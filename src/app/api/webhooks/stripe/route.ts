import type Stripe from "stripe";
import type { NextRequest } from "next/server";
import { apiHandler, ApiError, json } from "@/lib/api";
import { appUrl, requireEnv } from "@/lib/env";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { sha256 } from "@/lib/security/crypto";
import { safeMetadata } from "@/lib/security/redact";
import { stripe } from "@/lib/stripe";
import { beginWebhookAttempt, finishWebhookAttempt } from "@/lib/webhook-events";

type BillingKind = "launch_pack" | "monitoring" | "agency";
type BillingStatus = "pending" | "active" | "past_due" | "canceled" | "expired" | "failed";

function objectId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id ?? null;
}

function mapSubscriptionStatus(status: Stripe.Subscription.Status): BillingStatus {
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due" || status === "unpaid" || status === "paused") return "past_due";
  if (status === "canceled") return "canceled";
  if (status === "incomplete_expired") return "expired";
  if (status === "incomplete") return "pending";
  return "failed";
}

function unixDate(value: number | null | undefined) {
  return value ? new Date(value * 1000).toISOString() : null;
}

async function recordCheckout(session: Stripe.Checkout.Session) {
  const admin = createAdminSupabaseClient();
  const plan = session.metadata?.plan as BillingKind | undefined;
  const organizationId = session.metadata?.organizationId;
  const projectId = session.metadata?.projectId || null;
  const customerId = objectId(session.customer);
  if (!plan || !organizationId || !customerId) throw new Error("Checkout metadata is incomplete.");

  if (plan === "launch_pack") {
    if (session.payment_status !== "paid") return;
    const paymentIntentId = objectId(session.payment_intent);
    if (!paymentIntentId) throw new Error("Paid checkout is missing a payment intent.");
    const { error } = await admin.rpc("record_launch_pack_purchase", {
      p_organization_id: organizationId,
      p_project_id: projectId,
      p_stripe_customer_id: customerId,
      p_checkout_session_id: session.id,
      p_payment_intent_id: paymentIntentId,
      p_amount_cents: session.amount_total ?? 0,
      p_currency: session.currency ?? "usd",
    });
    if (error) throw new Error("Launch Pack entitlement could not be recorded.");
  }
}

async function recordSubscription(subscription: Stripe.Subscription) {
  const admin = createAdminSupabaseClient();
  const plan = subscription.metadata.plan as BillingKind | undefined;
  const organizationId = subscription.metadata.organizationId;
  const projectId = subscription.metadata.projectId || null;
  const customerId = objectId(subscription.customer);
  const firstItem = subscription.items.data[0];
  if (!plan || plan === "launch_pack" || !organizationId || !customerId || !firstItem) {
    throw new Error("Subscription metadata is incomplete.");
  }
  const period = firstItem as unknown as { current_period_start?: number; current_period_end?: number };
  const subscriptionDates = subscription as unknown as {
    current_period_start?: number;
    current_period_end?: number;
  };
  const { error } = await admin.rpc("record_subscription_state", {
    p_organization_id: organizationId,
    p_project_id: projectId,
    p_kind: plan,
    p_status: mapSubscriptionStatus(subscription.status),
    p_stripe_customer_id: customerId,
    p_stripe_subscription_id: subscription.id,
    p_stripe_price_id: firstItem.price.id,
    p_period_start: unixDate(period.current_period_start ?? subscriptionDates.current_period_start),
    p_period_end: unixDate(period.current_period_end ?? subscriptionDates.current_period_end),
    p_cancel_at_period_end: subscription.cancel_at_period_end,
    p_canceled_at: unixDate(subscription.canceled_at),
  });
  if (error) throw new Error("Subscription entitlement could not be recorded.");
}

async function processStripeEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await recordCheckout(event.data.object);
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await recordSubscription(event.data.object);
      break;
    case "charge.refunded": {
      const paymentIntentId = objectId(event.data.object.payment_intent);
      if (paymentIntentId) {
        const admin = createAdminSupabaseClient();
        const { error } = await admin.rpc("record_purchase_refund", { p_payment_intent_id: paymentIntentId });
        if (error) throw new Error("Refund state could not be recorded.");
      }
      break;
    }
    default:
      break;
  }
}

async function sendPaymentHandoff(event: Stripe.Event) {
  if (event.type !== "checkout.session.completed") return;
  const session = event.data.object;
  const userId = session.metadata?.userId;
  if (!userId) return;
  const admin = createAdminSupabaseClient();
  const { data: user } = await admin.from("users").select("email").eq("id", userId).maybeSingle();
  if (!user?.email) return;
  try {
    await sendEmail({
      to: user.email as string,
      userId,
      organizationId: session.metadata?.organizationId,
      template: "payment_receipt",
      subject: "Your RepoSec purchase is ready",
      preheader: "Payment received; your entitlement is now recorded.",
      heading: "Your launch check is ready to continue.",
      body: "Stripe confirmed the payment. Return to your RepoSec project to run the full check or use the billing page to review the entitlement.",
      actionLabel: "Open RepoSec",
      actionUrl: `${appUrl()}/dashboard`,
      dedupeKey: `payment-handoff:${event.id}`,
    });
  } catch {
    // Delivery failure is recorded by sendEmail and must not roll back a valid signed payment event.
  }
}

export async function POST(request: NextRequest) {
  return apiHandler(async () => {
    const { STRIPE_WEBHOOK_SECRET } = requireEnv("STRIPE_WEBHOOK_SECRET");
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 2_000_000) throw new ApiError(413, "Webhook payload is too large.");
    const raw = Buffer.from(await request.arrayBuffer());
    if (raw.length > 2_000_000) throw new ApiError(413, "Webhook payload is too large.");
    const signature = request.headers.get("stripe-signature");
    if (!signature) throw new ApiError(400, "Stripe signature is missing.");

    let event: Stripe.Event;
    try {
      event = stripe().webhooks.constructEvent(raw, signature, STRIPE_WEBHOOK_SECRET);
    } catch {
      throw new ApiError(401, "Stripe webhook signature is invalid.");
    }

    const admin = createAdminSupabaseClient();
    const attempt = await beginWebhookAttempt(admin, {
      provider: "stripe",
      providerEventId: event.id,
      eventType: event.type,
      payloadSha256: sha256(raw),
      safeMetadata: safeMetadata({
        objectId: "id" in event.data.object ? event.data.object.id : undefined,
        type: event.type,
      }),
    });
    if (!attempt.should_process) return json({ received: true, duplicate: true });

    try {
      await processStripeEvent(event);
    } catch {
      await finishWebhookAttempt(admin, attempt.event_id, "failed", "stripe_event_processing_failed");
      throw new Error("Stripe webhook processing failed.");
    }
    await finishWebhookAttempt(admin, attempt.event_id, "processed");

    await sendPaymentHandoff(event);
    return json({ received: true });
  });
}
