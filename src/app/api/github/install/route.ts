import { z } from "zod";
import { NextResponse, type NextRequest } from "next/server";
import { apiHandler, ApiError } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { githubInstallationUrl, signGitHubSetupState } from "@/lib/github";

export async function GET(request: NextRequest) {
  return apiHandler(async () => {
    const user = await currentUser();
    if (!user) throw new ApiError(401, "Sign in is required.");
    const organizationId = new URL(request.url).searchParams.get("organizationId");
    if (!organizationId || !z.string().uuid().safeParse(organizationId).success) {
      throw new ApiError(400, "Organization is required.");
    }
    const supabase = await createServerSupabaseClient();
    const { data: membership } = await supabase!
      .from("organization_members")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .in("role", ["owner", "admin"])
      .maybeSingle();
    if (!membership) throw new ApiError(403, "Only an organization owner or admin can install the GitHub App.");

    const state = signGitHubSetupState({
      userId: user.id,
      organizationId,
      expiresAt: Date.now() + 15 * 60 * 1000,
    });
    return NextResponse.redirect(githubInstallationUrl(state));
  });
}
