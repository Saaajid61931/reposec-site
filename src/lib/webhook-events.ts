import type { SupabaseClient } from "@supabase/supabase-js";

type WebhookProvider = "github" | "stripe" | "resend";
type TerminalWebhookStatus = "processed" | "ignored" | "failed";

interface WebhookAttemptRow {
  event_id: string;
  event_status: "received" | "processing" | TerminalWebhookStatus;
  attempt_count: number;
  should_process: boolean;
}

function firstRecord<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export async function beginWebhookAttempt(
  client: SupabaseClient,
  input: {
    provider: WebhookProvider;
    providerEventId: string;
    eventType: string;
    payloadSha256: string;
    safeMetadata: unknown;
  },
) {
  const { data, error } = await client.rpc("begin_webhook_attempt", {
    p_provider: input.provider,
    p_provider_event_id: input.providerEventId,
    p_event_type: input.eventType,
    p_payload_sha256: input.payloadSha256,
    p_safe_metadata: input.safeMetadata,
  });
  if (error) throw new Error(`${input.provider}_webhook_attempt_begin_failed`);
  const record = firstRecord(data as WebhookAttemptRow[] | WebhookAttemptRow | null);
  if (!record) throw new Error(`${input.provider}_webhook_attempt_missing`);
  return record;
}

export async function finishWebhookAttempt(
  client: SupabaseClient,
  eventId: string,
  status: TerminalWebhookStatus,
  lastErrorRedacted: string | null = null,
) {
  const { error } = await client.from("webhook_events").update({
    status,
    processed_at: status === "processed" || status === "ignored" ? new Date().toISOString() : null,
    last_error_redacted: lastErrorRedacted,
  }).eq("id", eventId);
  if (error) throw new Error(`webhook_attempt_${status}_failed`);
}
