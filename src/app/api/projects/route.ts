import { z } from "zod";
import { apiHandler, ApiError, json, readJson } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { assertSameOrigin } from "@/lib/security/csrf";
import { randomToken } from "@/lib/security/crypto";
import { parseGitHubRepositoryUrl, parseRootSiteUrl, slugify } from "@/lib/urls";
import type { NextRequest } from "next/server";

const schema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  repositoryUrl: z.string().url().max(500),
  siteUrl: z.string().url().max(500).optional(),
  authorized: z.literal(true, { error: "You must confirm authorization." }),
}).strict();

export async function POST(request: NextRequest) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const user = await currentUser();
    if (!user) throw new ApiError(401, "Sign in is required.");
    const input = await readJson(request, schema);
    const repository = parseGitHubRepositoryUrl(input.repositoryUrl);
    const site = input.siteUrl ? parseRootSiteUrl(input.siteUrl) : null;
    const slug = `${slugify(input.name)}-${randomToken(4).toLowerCase()}`;

    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase.rpc("create_project_with_targets", {
      p_organization_id: input.organizationId,
      p_user_id: user.id,
      p_name: input.name,
      p_slug: slug,
      p_repository_owner: repository.owner,
      p_repository_name: repository.name,
      p_repository_url: repository.url,
      p_site_url: site?.url ?? null,
      p_site_hostname: site?.hostname ?? null,
    });
    if (error || !data) {
      if (error?.message.includes("Not authorized")) throw new ApiError(403, "You cannot create projects in this organization.");
      throw new Error("Project could not be created.");
    }

    return json({ projectId: data }, { status: 201 });
  });
}
