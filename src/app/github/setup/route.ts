import { NextResponse, type NextRequest } from "next/server";
import { apiHandler, ApiError } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  getInstallation,
  githubSetupRedirect,
  listInstallationRepositories,
  verifyGitHubSetupState,
} from "@/lib/github";

export async function GET(request: NextRequest) {
  return apiHandler(async () => {
    const user = await currentUser();
    if (!user) throw new ApiError(401, "Sign in is required.");
    const url = new URL(request.url);
    const installationId = Number(url.searchParams.get("installation_id"));
    const state = url.searchParams.get("state");
    if (!Number.isSafeInteger(installationId) || installationId <= 0 || !state) {
      throw new ApiError(400, "GitHub installation callback is incomplete.");
    }
    const setup = verifyGitHubSetupState(state);
    if (setup.userId !== user.id) throw new ApiError(403, "GitHub installation user does not match.");
    const installation = await getInstallation(installationId);
    const repositories = await listInstallationRepositories(installationId);
    const admin = createAdminSupabaseClient();

    const { data: saved, error } = await admin
      .from("github_installations")
      .upsert({
        organization_id: setup.organizationId,
        installation_id: installation.id,
        account_id: installation.account.id,
        account_login: installation.account.login,
        account_type: installation.account.type,
        repository_selection: installation.repository_selection,
        permissions: installation.permissions,
        installed_by: user.id,
        suspended_at: installation.suspended_at,
        deleted_at: null,
      }, { onConflict: "installation_id" })
      .select("id")
      .single();
    if (error || !saved) throw new Error("GitHub installation could not be recorded.");

    const { data: organizationProjects, error: projectError } = await admin
      .from("projects")
      .select("id")
      .eq("organization_id", setup.organizationId);
    if (projectError) throw new Error("Organization projects could not be loaded.");
    const projectIds = (organizationProjects ?? []).map((project) => project.id as string).filter(Boolean);

    if (projectIds.length > 0) {
      for (const repository of repositories) {
        await admin.from("repositories").update({
          github_installation_id: saved.id,
          github_repository_id: repository.id,
          html_url: repository.html_url,
          default_branch: repository.default_branch,
          visibility: repository.visibility,
          is_archived: repository.archived,
          pushed_at: repository.pushed_at,
          last_metadata_sync_at: new Date().toISOString(),
        }).eq("full_name", repository.full_name).in("project_id", projectIds);
      }
    }

    await admin.from("audit_events").insert({
      organization_id: setup.organizationId,
      actor_user_id: user.id,
      actor_type: "user",
      action: "github.installation_connected",
      target_type: "github_installation",
      target_id: String(installation.id),
      after_state: {
        account: installation.account.login,
        repositorySelection: installation.repository_selection,
        permissions: installation.permissions,
      },
    });

    return NextResponse.redirect(githubSetupRedirect(true));
  });
}
