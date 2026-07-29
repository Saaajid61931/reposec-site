import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiHandler, ApiError, json, readJson } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { appUrl } from "@/lib/env";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { assertSameOrigin } from "@/lib/security/csrf";
import { enforceRateLimit } from "@/lib/rate-limit";
import { priceForPlan, stripe } from "@/lib/stripe";

const schema = z.object({
  plan: z.enum(["launch_pack", "monitoring", "agency"]),
  projectId: z.string().uuid().optional(),
}).strict();

export async function POST(request: NextRequest) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const user = await currentUser();
    if (!user) throw new ApiError(401, "Sign in is required.");
    const input = await readJson(request, schema);
    await enforceRateLimit({ identifier: user.id, action: "stripe_checkout", limit: 12, windowSeconds: 3600 });

    const userClient = await createServerSupabaseClient();
    const { data: membership } = await userClient!
      .from("organization_members")
      .select("organization_id,role")
      .eq("user_id", user.id)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (!membership) throw new ApiError(403, "Organization membership is required.");

    if (input.plan === "monitoring" && !input.projectId) {
      throw new ApiError(400, "Choose a project before starting Monitoring checkout.");
    }
    if (input.projectId) {
      const { data: project } = await userClient!
        .from("projects")
        .select("id,organization_id")
        .eq("id", input.projectId)
        .eq("organization_id", membership.organization_id)
        .maybeSingle();
      if (!project) throw new ApiError(403, "Project does not belong to this organization.");
    }

    const admin = createAdminSupabaseClient();
    const { data: billingCustomer } = await admin
      .from("billing_customers")
      .select("stripe_customer_id")
      .eq("organization_id", membership.organization_id)
      .maybeSingle();

    let customerId = billingCustomer?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const customer = await stripe().customers.create({
        email: user.email,
        name: (user.user_metadata.full_name as string | undefined) ?? undefined,
        metadata: { organizationId: membership.organization_id, userId: user.id },
      }, { idempotencyKey: `customer:${membership.organization_id}` });
      customerId = customer.id;
      const { error } = await admin.from("billing_customers").upsert({
        organization_id: membership.organization_id,
        stripe_customer_id: customerId,
      }, { onConflict: "organization_id" });
      if (error) throw new Error("Billing customer could not be recorded.");
    }

    const priceId = priceForPlan(input.plan);
    const metadata = {
      organizationId: membership.organization_id as string,
      userId: user.id,
      plan: input.plan,
      projectId: input.projectId ?? "",
    };
    const isSubscription = input.plan !== "launch_pack";
    const checkout = await stripe().checkout.sessions.create({
      mode: isSubscription ? "subscription" : "payment",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      client_reference_id: user.id,
      metadata,
      subscription_data: isSubscription ? { metadata } : undefined,
      payment_intent_data: isSubscription ? undefined : { metadata },
      success_url: `${appUrl()}/dashboard/billing?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl()}/dashboard/billing?canceled=1`,
    }, {
      idempotencyKey: `checkout:${membership.organization_id}:${input.plan}:${input.projectId ?? "credit"}:${Math.floor(Date.now() / 300000)}`,
    });
    if (!checkout.url) throw new Error("Stripe did not return a Checkout URL.");
    return json({ url: checkout.url });
  });
}
