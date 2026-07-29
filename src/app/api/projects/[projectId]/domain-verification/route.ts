import { promises as dns } from "node:dns";
import { z } from "zod";
import { apiHandler, ApiError, json, readJson } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { assertSameOrigin } from "@/lib/security/csrf";
import { randomToken, sha256 } from "@/lib/security/crypto";
import { safeHttpGet } from "@/lib/security/ssrf";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { NextRequest } from "next/server";

const schema = z.object({
  siteId: z.string().uuid(),
  action: z.enum(["issue", "verify"]),
  token: z.string().min(20).max(200).optional(),
}).strict();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const user = await currentUser();
    if (!user) throw new ApiError(401, "Sign in is required.");
    const input = await readJson(request, schema);
    const { projectId } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: site } = await supabase!
      .from("site_targets")
      .select("id,hostname,project_id,projects!inner(organization_id)")
      .eq("id", input.siteId)
      .eq("project_id", projectId)
      .maybeSingle();
    if (!site) throw new ApiError(404, "Site target not found.");
    await enforceRateLimit({ identifier: `${user.id}:${site.hostname as string}`, action: "domain_verification", limit: 12, windowSeconds: 3600 });

    const admin = createAdminSupabaseClient();
    if (input.action === "issue") {
      const token = `reposec-verification=${randomToken(24)}`;
      const { error } = await admin.from("domain_verifications").insert({
        site_target_id: site.id,
        token_hash: sha256(token),
        expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        created_by: user.id,
      });
      if (error) throw new Error("Verification token could not be issued.");
      return json({ token, hostname: site.hostname });
    }

    if (!input.token) throw new ApiError(400, "The verification token is required.");
    const { data: verification } = await admin
      .from("domain_verifications")
      .select("id,expires_at,verified_at,failed_attempts")
      .eq("site_target_id", site.id)
      .eq("token_hash", sha256(input.token))
      .maybeSingle();
    if (!verification || new Date(verification.expires_at as string) <= new Date()) {
      throw new ApiError(400, "Verification token is invalid or expired.");
    }

    let method: "dns_txt" | "well_known_file" | null = null;
    try {
      const records = await dns.resolveTxt(`_reposec.${site.hostname as string}`);
      if (records.some((parts) => parts.join("") === input.token)) method = "dns_txt";
    } catch {
      // DNS absence is an expected verification miss; the file method is checked next.
    }

    if (!method) {
      try {
        const response = await safeHttpGet(
          `https://${site.hostname as string}/.well-known/reposec-verification.txt`,
          { maxBytes: 4096, timeoutMs: 6000, maxRedirects: 2, allowedContentTypes: ["text/plain", "application/octet-stream"] },
        );
        if (response.status === 200 && response.body.toString("utf8").trim() === input.token) method = "well_known_file";
      } catch {
        // A failed safe request means verification has not propagated.
      }
    }

    if (!method) {
      await admin.from("domain_verifications").update({
        failed_attempts: Number(verification.failed_attempts ?? 0) + 1,
        last_attempt_at: new Date().toISOString(),
      }).eq("id", verification.id);
      throw new ApiError(409, "Verification was not found yet. DNS changes may take time to propagate.");
    }

    const verifiedAt = new Date().toISOString();
    await Promise.all([
      admin.from("domain_verifications").update({ method, verified_at: verifiedAt, last_attempt_at: verifiedAt }).eq("id", verification.id),
      admin.from("site_targets").update({ verification_method: method, verified_at: verifiedAt }).eq("id", site.id),
    ]);
    return json({ verified: true });
  });
}
