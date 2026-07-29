import { Webhook } from "svix";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiHandler, ApiError, json } from "@/lib/api";
import { requireEnv } from "@/lib/env";
import { sha256 } from "@/lib/security/crypto";
import { safeMetadata } from "@/lib/security/redact";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { beginWebhookAttempt, finishWebhookAttempt } from "@/lib/webhook-events";

const eventSchema = z.object({
  type: z.string().min(1).max(100),
  created_at: z.string().datetime({ offset: true }).optional(),
  data: z.object({
    email_id: z.string().min(1).max(200).optional(),
    id: z.string().min(1).max(200).optional(),
  }).passthrough(),
}).passthrough();


const statusRank: Record<string, number> = {
  queued: 0,
  sending: 1,
  delayed: 1,
  sent: 2,
  delivered: 3,
  opened: 4,
  clicked: 5,
  failed: 10,
  bounced: 10,
  complained: 10,
};

function nextDeliveryStatus(current: string | null | undefined, incoming: string) {
  if (!current) return incoming;
  if ((statusRank[current] ?? 0) >= 10) return current;
  if ((statusRank[incoming] ?? 0) >= 10) return incoming;
  return (statusRank[incoming] ?? 0) >= (statusRank[current] ?? 0) ? incoming : current;
}

function deliveryStatus(type: string) {
  switch (type) {
    case "email.sent": return "sent";
    case "email.delivered": return "delivered";
    case "email.delivery_delayed": return "delayed";
    case "email.bounced": return "bounced";
    case "email.complained": return "complained";
    case "email.failed": return "failed";
    case "email.opened": return "opened";
    case "email.clicked": return "clicked";
    default: return null;
  }
}

export async function POST(request: NextRequest) {
  return apiHandler(async () => {
    const { RESEND_WEBHOOK_SECRET } = requireEnv("RESEND_WEBHOOK_SECRET");
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 256_000) throw new ApiError(413, "Email event payload is too large.");
    const raw = Buffer.from(await request.arrayBuffer());
    if (raw.length > 256_000) throw new ApiError(413, "Email event payload is too large.");

    const svixId = request.headers.get("svix-id");
    const svixTimestamp = request.headers.get("svix-timestamp");
    const svixSignature = request.headers.get("svix-signature");
    if (!svixId || !svixTimestamp || !svixSignature) {
      throw new ApiError(400, "Email event signature headers are incomplete.");
    }

    let verified: unknown;
    try {
      verified = new Webhook(RESEND_WEBHOOK_SECRET).verify(raw.toString("utf8"), {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      });
    } catch {
      throw new ApiError(401, "Email event signature is invalid.");
    }
    const event = eventSchema.safeParse(verified);
    if (!event.success) throw new ApiError(400, "Email event payload is invalid.");

    const admin = createAdminSupabaseClient();
    const emailId = event.data.data.email_id ?? event.data.data.id ?? null;
    const attempt = await beginWebhookAttempt(admin, {
      provider: "resend",
      providerEventId: svixId,
      eventType: event.data.type,
      payloadSha256: sha256(raw),
      safeMetadata: safeMetadata({ emailId, type: event.data.type }),
    });
    if (!attempt.should_process) return json({ received: true, duplicate: true });

    try {
      const status = deliveryStatus(event.data.type);
      if (status && emailId) {
        const { data: delivery, error: deliveryError } = await admin
          .from("email_deliveries")
          .select("id,status,sent_at")
          .eq("provider_message_id", emailId)
          .maybeSingle();
        if (deliveryError) throw new Error("Email delivery could not be loaded.");
        if (delivery) {
          const finalStatus = nextDeliveryStatus(delivery.status as string | null, status);
          const update: Record<string, unknown> = {
            status: finalStatus,
            last_error_redacted: ["bounced", "complained", "failed"].includes(finalStatus) ? event.data.type : null,
          };
          if (!delivery.sent_at && ["sent", "delivered", "opened", "clicked"].includes(status)) {
            update.sent_at = event.data.created_at ?? new Date().toISOString();
          }
          const { error: updateError } = await admin.from("email_deliveries").update(update).eq("id", delivery.id);
          if (updateError) throw new Error("Email delivery status could not be updated.");
        }
      }
      await finishWebhookAttempt(admin, attempt.event_id, status ? "processed" : "ignored");
    } catch {
      await finishWebhookAttempt(admin, attempt.event_id, "failed", "email_event_processing_failed");
      throw new Error("Email event processing failed.");
    }

    return json({ received: true });
  });
}
