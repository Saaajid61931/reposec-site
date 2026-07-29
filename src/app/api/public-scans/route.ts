import { z } from "zod";
import { apiHandler, ApiError, json, readJson, requestIp } from "@/lib/api";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { assertSameOrigin } from "@/lib/security/csrf";
import { hashSensitive, randomToken, sha256 } from "@/lib/security/crypto";
import { enforceRateLimit } from "@/lib/rate-limit";
import { parseGitHubRepositoryUrl, parseRootSiteUrl } from "@/lib/urls";
import type { NextRequest } from "next/server";

const schema = z.object({
  repositoryUrl: z.string().url().max(500),
  siteUrl: z.string().url().max(500).optional(),
  authorized: z.literal(true, { error: "You must confirm authorization." }),
}).strict();

export async function POST(request: NextRequest) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const input = await readJson(request, schema);
    const repository = parseGitHubRepositoryUrl(input.repositoryUrl);
    const site = input.siteUrl ? parseRootSiteUrl(input.siteUrl) : null;
    const ip = requestIp(request);

    await Promise.all([
      enforceRateLimit({ identifier: ip, action: "public_scan_ip", limit: 5, windowSeconds: 3600 }),
      enforceRateLimit({ identifier: repository.fullName.toLowerCase(), action: "public_scan_repo", limit: 10, windowSeconds: 86_400 }),
    ]);

    const token = randomToken();
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase.rpc("enqueue_free_scan", {
      p_access_token_hash: sha256(token),
      p_repository_owner: repository.owner,
      p_repository_name: repository.name,
      p_repository_url: repository.url,
      p_site_url: site?.url ?? null,
      p_requester_ip_hash: hashSensitive(ip),
    });
    if (error || !data) {
      if (error?.code === "23505") throw new ApiError(409, "A check for this request already exists.");
      throw new Error("Free scan could not be queued.");
    }

    return json({ token }, { status: 202 });
  });
}
