import { z } from "zod";
import { apiHandler, ApiError, json, requestIp } from "@/lib/api";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { sha256 } from "@/lib/security/crypto";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { NextRequest } from "next/server";

const tokenSchema = z.string().min(30).max(100).regex(/^[A-Za-z0-9_-]+$/);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  return apiHandler(async () => {
    const { token: rawToken } = await params;
    const parsed = tokenSchema.safeParse(rawToken);
    if (!parsed.success) throw new ApiError(404, "Scan result not found.");

    await enforceRateLimit({
      identifier: `${requestIp(request)}:${sha256(parsed.data).slice(0, 16)}`,
      action: "public_scan_status",
      limit: 90,
      windowSeconds: 3600,
    });

    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("free_scan_requests")
      .select("status,verdict,repository_owner,repository_name,limited_findings,scope_snapshot,error_code,updated_at,expires_at")
      .eq("access_token_hash", sha256(parsed.data))
      .maybeSingle();
    if (error || !data) throw new ApiError(404, "Scan result not found.");
    if (new Date(data.expires_at as string) <= new Date()) {
      return json({ status: "expired", error: "Free results are retained for seven days." }, { status: 410 });
    }

    const findings = Array.isArray(data.limited_findings) ? data.limited_findings.slice(0, 3) : [];
    return json({
      status: data.status,
      verdict: data.verdict,
      repository: `${data.repository_owner as string}/${data.repository_name as string}`,
      findings,
      scope: data.scope_snapshot,
      error: data.error_code ? "A required scanner failed or timed out." : undefined,
      completedAt: ["completed", "failed"].includes(data.status as string) ? data.updated_at : undefined,
    });
  });
}
