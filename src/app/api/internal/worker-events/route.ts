import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiHandler, ApiError, json } from "@/lib/api";
import { appUrl, requireEnv } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import { verifyHmacSha256 } from "@/lib/security/crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const schema = z.object({
  type: z.enum(["scan.started", "scan.completed", "scan.failed"]),
  scanId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  mode: z.enum(["free", "launch_pack", "monitoring"]),
  verdict: z.enum(["BLOCKED", "NEEDS WORK", "READY FOR LAUNCH CHECKS", "SCAN INCOMPLETE"]).optional(),
  reportFingerprint: z.string().max(80).optional(),
  findingCounts: z.record(z.string(), z.number().int().min(0)).optional(),
  newHighCount: z.number().int().min(0).optional(),
  regressionCount: z.number().int().min(0).optional(),
  resolvedCount: z.number().int().min(0).optional(),
  errorCode: z.string().max(100).optional(),
}).strict();

type WorkerEvent = z.infer<typeof schema>;

async function recipientUsers(projectId: string, requestedBy: string | null, startedEvent: boolean) {
  const admin = createAdminSupabaseClient();
  const { data: project, error: projectError } = await admin
    .from("projects")
    .select("name,organization_id")
    .eq("id", projectId)
    .single();
  if (projectError || !project) throw new Error("Worker event project could not be loaded.");

  const userIds = new Set<string>();
  if (requestedBy) userIds.add(requestedBy);
  if (!startedEvent || !requestedBy) {
    const { data: members, error: memberError } = await admin
      .from("organization_members")
      .select("user_id,role")
      .eq("organization_id", project.organization_id)
      .in("role", ["owner", "admin"]);
    if (memberError) throw new Error("Worker event recipients could not be loaded.");
    for (const member of members ?? []) userIds.add(member.user_id as string);
  }

  if (userIds.size === 0) return { project, users: [] as Array<{ id: string; email: string }> };
  const { data: users, error: userError } = await admin
    .from("users")
    .select("id,email")
    .in("id", [...userIds])
    .is("suspended_at", null);
  if (userError) throw new Error("Worker event recipient accounts could not be loaded.");
  return { project, users: (users ?? []) as Array<{ id: string; email: string }> };
}

function totalFindings(event: WorkerEvent) {
  return Object.values(event.findingCounts ?? {}).reduce((total, count) => total + count, 0);
}

async function handleEvent(event: WorkerEvent) {
  if (!event.projectId) return;
  const admin = createAdminSupabaseClient();
  const { data: scan, error } = await admin
    .from("scans")
    .select("requested_by")
    .eq("id", event.scanId)
    .eq("project_id", event.projectId)
    .single();
  if (error || !scan) throw new Error("Worker event scan could not be loaded.");

  const { project, users } = await recipientUsers(
    event.projectId,
    (scan.requested_by as string | null) ?? null,
    event.type === "scan.started",
  );
  const projectUrl = `${appUrl()}/dashboard/projects/${event.projectId}`;
  const reportUrl = `${projectUrl}/scans/${event.scanId}`;

  for (const user of users) {
    if (event.type === "scan.started") {
      await sendEmail({
        to: user.email,
        userId: user.id,
        organizationId: project.organization_id as string,
        template: "scan_started",
        subject: `RepoSec scan started for ${project.name as string}`,
        preheader: "RepoSec is reviewing the latest default-branch snapshot.",
        heading: "The security scan has started.",
        body: `RepoSec is reviewing ${project.name as string}. Repository code will not be executed. You can follow component progress in the dashboard.`,
        actionLabel: "View scan progress",
        actionUrl: reportUrl,
        dedupeKey: `scan-started:${event.scanId}:${user.id}`,
      });
      continue;
    }

    if (event.type === "scan.failed") {
      await sendEmail({
        to: user.email,
        userId: user.id,
        organizationId: project.organization_id as string,
        template: "scan_failed",
        subject: `RepoSec scan incomplete for ${project.name as string}`,
        preheader: "Required scanner coverage did not complete.",
        heading: "The scan did not complete.",
        body: `RepoSec stopped the scan because required coverage failed. Error code: ${event.errorCode ?? "scan_failed"}. No partial result is presented as complete.`,
        actionLabel: "Open project",
        actionUrl: projectUrl,
        dedupeKey: `scan-failed:${event.scanId}:${user.id}`,
      });
      continue;
    }

    await sendEmail({
      to: user.email,
      userId: user.id,
      organizationId: project.organization_id as string,
      template: "scan_complete",
      subject: `RepoSec report ready for ${project.name as string}`,
      preheader: `${event.verdict ?? "Scan complete"}. ${totalFindings(event)} finding(s) observed.`,
      heading: event.verdict ?? "The scan is complete.",
      body: `RepoSec completed the latest snapshot review with ${totalFindings(event)} finding(s). ${event.resolvedCount ?? 0} finding(s) were resolved, and ${event.regressionCount ?? 0} regression(s) were detected.`,
      actionLabel: "Open report",
      actionUrl: reportUrl,
      dedupeKey: `scan-complete:${event.scanId}:${user.id}`,
    });

    if ((event.newHighCount ?? 0) > 0) {
      await sendEmail({
        to: user.email,
        userId: user.id,
        organizationId: project.organization_id as string,
        template: "new_high_finding",
        subject: `New high-priority RepoSec finding for ${project.name as string}`,
        preheader: `${event.newHighCount} new or regressed high-priority finding(s).`,
        heading: "A high-priority finding needs review.",
        body: `${event.newHighCount} new or regressed high or critical finding(s) appeared in the latest scan. Open the private report for redacted evidence and the fix prompt.`,
        actionLabel: "Review findings",
        actionUrl: reportUrl,
        dedupeKey: `scan-high:${event.scanId}:${user.id}`,
      });
    }
  }
}

export async function POST(request: NextRequest) {
  return apiHandler(async () => {
    const { WORKER_SHARED_SECRET } = requireEnv("WORKER_SHARED_SECRET");
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 64_000) throw new ApiError(413, "Worker event payload is too large.");
    const raw = Buffer.from(await request.arrayBuffer());
    if (raw.length > 64_000) throw new ApiError(413, "Worker event payload is too large.");

    const timestamp = request.headers.get("x-reposec-worker-timestamp") ?? "";
    const signature = request.headers.get("x-reposec-worker-signature") ?? "";
    const timestampNumber = Number(timestamp);
    if (!Number.isSafeInteger(timestampNumber) || Math.abs(Date.now() / 1000 - timestampNumber) > 300) {
      throw new ApiError(401, "Worker event timestamp is invalid.");
    }
    if (!verifyHmacSha256(Buffer.from(`${timestamp}.${raw.toString("utf8")}`), signature, WORKER_SHARED_SECRET)) {
      throw new ApiError(401, "Worker event signature is invalid.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString("utf8"));
    } catch {
      throw new ApiError(400, "Worker event JSON is invalid.");
    }
    const event = schema.safeParse(parsed);
    if (!event.success) throw new ApiError(400, "Worker event payload is invalid.");
    await handleEvent(event.data);
    return json({ received: true });
  });
}
