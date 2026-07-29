import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiHandler, ApiError, json } from "@/lib/api";
import { requireEnv } from "@/lib/env";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { sha256, verifyHmacSha256 } from "@/lib/security/crypto";
import { safeMetadata } from "@/lib/security/redact";
import { beginWebhookAttempt, finishWebhookAttempt } from "@/lib/webhook-events";

const eventIdSchema = z.string().min(1).max(200);
const eventTypeSchema = z.string().min(1).max(100).regex(/^[a-z_]+$/);

interface GitHubWebhookPayload {
  action?: string;
  installation?: {
    id: number;
    account?: { id: number; login: string; type: string };
    repository_selection?: string;
    permissions?: Record<string, string>;
    suspended_at?: string | null;
  };
  repository?: {
    id: number;
    full_name: string;
    html_url: string;
    default_branch: string;
    visibility?: string;
    private: boolean;
    archived: boolean;
    pushed_at?: string | null;
  };
  repositories_added?: Array<{ id: number; full_name: string }>;
  repositories_removed?: Array<{ id: number; full_name: string }>;
  ref?: string;
  after?: string;
  sender?: { id: number; login: string };
}

async function projectIdsForOrganization(organizationId: string) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.from("projects").select("id").eq("organization_id", organizationId);
  if (error) throw new Error("GitHub organization projects could not be loaded.");
  return (data ?? []).map((project) => project.id as string);
}

async function processGitHubEvent(eventType: string, payload: GitHubWebhookPayload) {
  const admin = createAdminSupabaseClient();
  const installationId = payload.installation?.id;

  if (eventType === "installation" && installationId) {
    if (payload.action === "deleted") {
      const { error } = await admin.from("github_installations").update({
        deleted_at: new Date().toISOString(),
      }).eq("installation_id", installationId);
      if (error) throw new Error("GitHub installation deletion could not be recorded.");
    } else if (payload.action === "suspend") {
      const { error } = await admin.from("github_installations").update({
        suspended_at: payload.installation?.suspended_at ?? new Date().toISOString(),
      }).eq("installation_id", installationId);
      if (error) throw new Error("GitHub installation suspension could not be recorded.");
    } else if (payload.action === "unsuspend") {
      const { error } = await admin.from("github_installations").update({ suspended_at: null }).eq("installation_id", installationId);
      if (error) throw new Error("GitHub installation restoration could not be recorded.");
    } else if (payload.installation?.account) {
      const { error } = await admin.from("github_installations").update({
        account_id: payload.installation.account.id,
        account_login: payload.installation.account.login,
        account_type: payload.installation.account.type,
        repository_selection: payload.installation.repository_selection,
        permissions: payload.installation.permissions,
        suspended_at: payload.installation.suspended_at,
      }).eq("installation_id", installationId);
      if (error) throw new Error("GitHub installation metadata could not be updated.");
    }
    return;
  }

  let installation: { id: string; organization_id: string } | null = null;
  if (installationId) {
    const { data, error } = await admin
      .from("github_installations")
      .select("id,organization_id")
      .eq("installation_id", installationId)
      .maybeSingle();
    if (error) throw new Error("GitHub installation could not be loaded.");
    installation = data as typeof installation;
  }

  if (eventType === "installation_repositories" && installation) {
    const projectIds = await projectIdsForOrganization(installation.organization_id as string);
    for (const repository of payload.repositories_added ?? []) {
      if (projectIds.length > 0) {
        const { error } = await admin.from("repositories").update({
          github_installation_id: installation.id,
          github_repository_id: repository.id,
          last_metadata_sync_at: new Date().toISOString(),
        }).eq("full_name", repository.full_name).in("project_id", projectIds);
        if (error) throw new Error("GitHub repository installation link could not be updated.");
      }
    }
    for (const repository of payload.repositories_removed ?? []) {
      const { error } = await admin.from("repositories").update({
        github_installation_id: null,
        last_metadata_sync_at: new Date().toISOString(),
      }).eq("github_repository_id", repository.id).eq("github_installation_id", installation.id);
      if (error) throw new Error("GitHub repository installation link could not be removed.");
    }
    return;
  }

  if (eventType === "repository" && payload.repository) {
    const { error } = await admin.from("repositories").update({
      full_name: payload.repository.full_name,
      owner: payload.repository.full_name.split("/")[0],
      name: payload.repository.full_name.split("/")[1],
      html_url: payload.repository.html_url,
      default_branch: payload.repository.default_branch,
      visibility: payload.repository.visibility ?? (payload.repository.private ? "private" : "public"),
      is_archived: payload.repository.archived,
      pushed_at: payload.repository.pushed_at,
      last_metadata_sync_at: new Date().toISOString(),
    }).eq("github_repository_id", payload.repository.id);
    if (error) throw new Error("GitHub repository metadata could not be updated.");
    return;
  }

  if (eventType === "push" && payload.repository && installation) {
    const { data: repository, error: repositoryError } = await admin
      .from("repositories")
      .select("project_id,default_branch,github_installation_id")
      .eq("github_repository_id", payload.repository.id)
      .eq("github_installation_id", installation.id)
      .maybeSingle();
    if (repositoryError) throw new Error("GitHub push repository could not be loaded.");
    if (!repository || payload.ref !== `refs/heads/${repository.default_branch as string}`) return;

    const { error: updateError } = await admin.from("repositories").update({
      pushed_at: payload.repository.pushed_at ?? new Date().toISOString(),
      last_metadata_sync_at: new Date().toISOString(),
    }).eq("github_repository_id", payload.repository.id);
    if (updateError) throw new Error("GitHub push metadata could not be updated.");

    const { error: enqueueError } = await admin.rpc("enqueue_monitoring_scan", {
      p_project_id: repository.project_id,
      p_trigger: "github_push",
      p_commit_sha: payload.after ?? null,
    });
    if (enqueueError) throw new Error("GitHub push scan could not be enqueued.");
  }
}

export async function POST(request: NextRequest) {
  return apiHandler(async () => {
    const { GITHUB_WEBHOOK_SECRET } = requireEnv("GITHUB_WEBHOOK_SECRET");
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 2_000_000) throw new ApiError(413, "Webhook payload is too large.");
    const raw = Buffer.from(await request.arrayBuffer());
    if (raw.length > 2_000_000) throw new ApiError(413, "Webhook payload is too large.");

    const signature = request.headers.get("x-hub-signature-256") ?? "";
    if (!verifyHmacSha256(raw, signature, GITHUB_WEBHOOK_SECRET)) {
      throw new ApiError(401, "GitHub webhook signature is invalid.");
    }
    const eventId = eventIdSchema.safeParse(request.headers.get("x-github-delivery"));
    const eventType = eventTypeSchema.safeParse(request.headers.get("x-github-event"));
    if (!eventId.success || !eventType.success) throw new ApiError(400, "GitHub webhook headers are incomplete.");

    let payload: GitHubWebhookPayload;
    try {
      payload = JSON.parse(raw.toString("utf8")) as GitHubWebhookPayload;
    } catch {
      throw new ApiError(400, "GitHub webhook JSON is invalid.");
    }

    const admin = createAdminSupabaseClient();
    const safe = safeMetadata({
      action: payload.action,
      installationId: payload.installation?.id,
      repositoryId: payload.repository?.id,
      repository: payload.repository?.full_name,
      ref: payload.ref,
      senderId: payload.sender?.id,
    });
    const attempt = await beginWebhookAttempt(admin, {
      provider: "github",
      providerEventId: eventId.data,
      eventType: eventType.data,
      payloadSha256: sha256(raw),
      safeMetadata: safe,
    });
    if (!attempt.should_process) return json({ received: true, duplicate: true });

    try {
      await processGitHubEvent(eventType.data, payload);
    } catch {
      await finishWebhookAttempt(admin, attempt.event_id, "failed", "github_event_processing_failed");
      throw new Error("GitHub webhook processing failed.");
    }
    await finishWebhookAttempt(admin, attempt.event_id, "processed");

    return json({ received: true });
  });
}
