import "server-only";

import { ApiError } from "@/lib/api";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hashSensitive } from "@/lib/security/crypto";

export async function enforceRateLimit({
  identifier,
  action,
  limit,
  windowSeconds,
}: {
  identifier: string;
  action: string;
  limit: number;
  windowSeconds: number;
}) {
  const supabase = createAdminSupabaseClient();
  const keyHash = hashSensitive(identifier);
  const { data, error } = await supabase.rpc("consume_rate_limit", {
    p_key_hash: keyHash,
    p_action: action,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw new Error("Rate limiter is unavailable.");
  if (!data) throw new ApiError(429, "Too many requests. Please try again later.", "rate_limited");
}
