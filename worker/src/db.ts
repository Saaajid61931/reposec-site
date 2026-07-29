import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { hash } from "./findings.js";
import type { ScanComponentName } from "./components.js";
import type {
  ComponentResult,
  NormalizedFinding,
  RepositoryTarget,
  ScanJob,
  Severity,
  WorkerConfig,
} from "./types.js";

interface LoadedTarget {
  target: RepositoryTarget;
  projectId?: string;
  mode: "free" | "launch_pack" | "monitoring";
  requestedCommitSha?: string;
}

interface PersistenceSummary {
  findingCounts: Record<Severity, number>;
  newHighCount: number;
  regressionCount: number;
  resolvedCount: number;
}


interface ExistingFindingRow {
  id: string;
  fingerprint: string;
  current_status: "open" | "fixed" | "dismissed" | "accepted";
  severity: Severity;
  last_seen_scan_id: string | null;
}

interface FindingStatusRow {
  current_status: "open" | "fixed" | "dismissed" | "accepted";
}

interface CompleteScanInput {
  job: ScanJob;
  projectId?: string;
  verdict: "BLOCKED" | "NEEDS WORK" | "READY FOR LAUNCH CHECKS" | "SCAN INCOMPLETE";
  coverageComplete: boolean;
  limitationNotes: string[];
  reportFingerprint: string;
  findingCounts: Record<Severity, number>;
  findings: NormalizedFinding[];
  components: ComponentResult[];
  passedControls: Array<{ name: string; detail: string }>;
  scope: string[];
}

const EMPTY_COUNTS: Record<Severity, number> = {
  critical: 0,
  high: 0,
  medium: 0,
  low: 0,
  info: 0,
};

function firstRecord<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

export class WorkerDatabase {
  readonly client: SupabaseClient;

  constructor(private readonly config: WorkerConfig) {
    this.client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { "x-application-name": "reposec-worker" } },
    });
  }

  async claimJob(): Promise<ScanJob | null> {
    const { data, error } = await this.client.rpc("claim_scan_job", {
      p_worker_id: this.config.workerId,
      p_lease_seconds: Math.ceil(this.config.limits.scanTimeoutMs / 1000) + 60,
    });
    if (error) throw new Error(`claim_job_failed:${error.code ?? "unknown"}`);
    const claimed = firstRecord(data as Record<string, unknown>[] | null);
    if (!claimed) return null;
    return {
      jobId: String(claimed.job_id),
      scanId: String(claimed.scan_id),
      payload: (claimed.payload ?? {}) as ScanJob["payload"],
      attempt: Number(claimed.attempt ?? 1),
      maxAttempts: Number(claimed.max_attempts ?? 3),
    };
  }

  async loadTarget(job: ScanJob): Promise<LoadedTarget> {
    const { data: scan, error: scanError } = await this.client
      .from("scans")
      .select("id,project_id,free_scan_request_id,mode,commit_sha")
      .eq("id", job.scanId)
      .single();
    if (scanError || !scan) throw new Error("scan_target_not_found");
    const mode = scan.mode as LoadedTarget["mode"];

    if (mode === "free") {
      const requestId = scan.free_scan_request_id as string | null;
      const { data: request, error } = await this.client
        .from("free_scan_requests")
        .select("repository_owner,repository_name,repository_url,site_url")
        .eq("id", requestId)
        .single();
      if (error || !request) throw new Error("free_scan_payload_incomplete");
      const site = request.site_url ? new URL(request.site_url as string) : null;
      return {
        mode,
        target: {
          owner: request.repository_owner as string,
          name: request.repository_name as string,
          fullName: `${request.repository_owner as string}/${request.repository_name as string}`,
          htmlUrl: request.repository_url as string,
          defaultBranch: "main",
          visibility: "public",
          archived: false,
          site: site ? { url: site.toString().replace(/\/$/, ""), hostname: site.hostname, verified: false } : undefined,
        },
      };
    }

    const projectId = scan.project_id as string | null;
    if (!projectId) throw new Error("scan_project_missing");
    const [{ data: repository, error: repositoryError }, { data: site, error: siteError }] = await Promise.all([
      this.client
        .from("repositories")
        .select("owner,name,full_name,html_url,default_branch,visibility,is_archived,pushed_at,github_installation_id")
        .eq("project_id", projectId)
        .maybeSingle(),
      this.client
        .from("site_targets")
        .select("url,hostname,verified_at")
        .eq("project_id", projectId)
        .maybeSingle(),
    ]);
    if (repositoryError || !repository) throw new Error("repository_not_connected");
    if (siteError) throw new Error("site_target_load_failed");

    let installationId: number | undefined;
    if (repository.github_installation_id) {
      const { data: installation, error } = await this.client
        .from("github_installations")
        .select("installation_id,suspended_at,deleted_at")
        .eq("id", repository.github_installation_id)
        .maybeSingle();
      if (error) throw new Error("github_installation_load_failed");
      if (installation && !installation.suspended_at && !installation.deleted_at) {
        installationId = Number(installation.installation_id);
      }
    }

    const visibility = repository.visibility as RepositoryTarget["visibility"];
    if (visibility !== "public" && !installationId) {
      throw new Error("private_repository_installation_unavailable");
    }

    return {
      projectId,
      mode,
      requestedCommitSha: typeof scan.commit_sha === "string" && scan.commit_sha.length > 0 ? scan.commit_sha : undefined,
      target: {
        owner: repository.owner as string,
        name: repository.name as string,
        fullName: repository.full_name as string,
        htmlUrl: (repository.html_url as string | null) ?? `https://github.com/${repository.full_name as string}`,
        defaultBranch: repository.default_branch as string,
        visibility,
        archived: Boolean(repository.is_archived),
        pushedAt: repository.pushed_at as string | null,
        installationId,
        site: site
          ? {
              url: site.url as string,
              hostname: site.hostname as string,
              verified: Boolean(site.verified_at),
            }
          : undefined,
      },
    };
  }

  async prepareScan(scanId: string) {
    // Finding occurrences are append-only. A retried job reuses the same scan and
    // inserts only evidence rows that are not already present.
    const { error } = await this.client.from("scans").update({
      status: "running",
      started_at: new Date().toISOString(),
      verdict: null,
      coverage_complete: false,
      completed_at: null,
      report_fingerprint: null,
      finding_counts: {},
      limitation_notes: [],
    }).eq("id", scanId);
    if (error) throw new Error("scan_prepare_failed");

    const { error: freeRequestError } = await this.client.from("free_scan_requests").update({
      status: "running",
      error_code: null,
    }).eq("scan_id", scanId);
    if (freeRequestError) throw new Error("free_scan_prepare_failed");
  }

  async startComponent(scanId: string, name: ScanComponentName, required: boolean) {
    const { error } = await this.client.from("scan_components").upsert({
      scan_id: scanId,
      scanner: name,
      required,
      status: "running",
      started_at: new Date().toISOString(),
      completed_at: null,
      error_code: null,
      error_detail_redacted: null,
      duration_ms: null,
      finding_count: 0,
      rule_count: 0,
      summary: null,
    }, { onConflict: "scan_id,scanner" });
    if (error) throw new Error(`component_start_failed:${name}`);
  }

  async finishComponent(scanId: string, result: ComponentResult) {
    const { error } = await this.client.from("scan_components").update({
      status: result.status,
      scanner_version: result.version,
      policy_version: "2026.07",
      required: result.required,
      rule_count: result.ruleCount,
      finding_count: result.findings.length,
      summary: result.summary.slice(0, 1000),
      error_code: result.errorCode ?? null,
      error_detail_redacted: result.errorDetail?.slice(0, 1000) ?? null,
      completed_at: new Date().toISOString(),
      duration_ms: result.durationMs,
    }).eq("scan_id", scanId).eq("scanner", result.name);
    if (error) throw new Error(`component_finish_failed:${result.name}`);
  }

  async updateSnapshotMetadata(scanId: string, projectId: string | undefined, target: RepositoryTarget, snapshot: {
    defaultBranch: string;
    commitSha: string | null;
    compressedBytes: number;
    expandedBytes: number;
    fileCount: number;
  }) {
    const { error } = await this.client.from("scans").update({
      branch: snapshot.defaultBranch,
      commit_sha: snapshot.commitSha,
      repository_snapshot_bytes: snapshot.expandedBytes,
      file_count: snapshot.fileCount,
    }).eq("id", scanId);
    if (error) throw new Error("snapshot_metadata_update_failed");

    if (projectId) {
      const { error: repositoryError } = await this.client.from("repositories").update({
        default_branch: target.defaultBranch,
        visibility: target.visibility,
        is_archived: target.archived,
        pushed_at: target.pushedAt ?? null,
        last_metadata_sync_at: new Date().toISOString(),
      }).eq("project_id", projectId);
      if (repositoryError) throw new Error("repository_metadata_update_failed");
    }
  }

  async persistProjectFindings(
    projectId: string,
    scanId: string,
    findings: NormalizedFinding[],
    coverageComplete: boolean,
  ): Promise<PersistenceSummary> {
    const now = new Date().toISOString();
    const [{ data: existingData, error: existingError }, { data: previousScan, error: previousError }] = await Promise.all([
      this.client
        .from("findings")
        .select("id,fingerprint,current_status,severity,last_seen_scan_id")
        .eq("project_id", projectId),
      this.client
        .from("scans")
        .select("id")
        .eq("project_id", projectId)
        .eq("status", "completed")
        .eq("coverage_complete", true)
        .neq("id", scanId)
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (existingError || previousError) throw new Error("finding_history_load_failed");

    const existing = (existingData ?? []) as ExistingFindingRow[];
    const existingByFingerprint = new Map(existing.map((row: ExistingFindingRow) => [row.fingerprint, row]));
    const existingById = new Map(existing.map((row: ExistingFindingRow) => [row.id, row]));
    const previousFingerprints = new Set<string>();
    if (previousScan?.id) {
      const { data: previousOccurrences, error } = await this.client
        .from("finding_occurrences")
        .select("finding_id")
        .eq("scan_id", previousScan.id);
      if (error) throw new Error("previous_scan_occurrences_load_failed");
      for (const occurrence of previousOccurrences ?? []) {
        const prior = existingById.get(occurrence.finding_id as string);
        if (prior) previousFingerprints.add(prior.fingerprint as string);
      }
    }

    const seen = new Set<string>();
    let newHighCount = 0;
    let regressionCount = 0;
    const statusEvents: Array<Record<string, unknown>> = [];

    for (const finding of findings) {
      seen.add(finding.fingerprint);
      const prior = existingByFingerprint.get(finding.fingerprint);
      const isNew = !previousFingerprints.has(finding.fingerprint);
      const isRegression = Boolean(prior && prior.current_status === "fixed");
      const currentStatus = isRegression ? "open" : (prior?.current_status ?? "open");
      if (isRegression) regressionCount += 1;
      if ((isNew || isRegression) && ["critical", "high"].includes(finding.severity) && currentStatus === "open") {
        newHighCount += 1;
      }

      let findingId: string;
      if (prior) {
        findingId = prior.id as string;
        const { error } = await this.client.from("findings").update({
          current_status: currentStatus,
          last_seen_scan_id: scanId,
          last_seen_at: now,
        }).eq("id", findingId);
        if (error) throw new Error("finding_seen_update_failed");
      } else {
        const { data: saved, error } = await this.client.from("findings").insert({
          project_id: projectId,
          fingerprint: finding.fingerprint,
          rule_id: finding.ruleId,
          title: finding.title,
          category: finding.category,
          severity: finding.severity,
          confidence: finding.confidence,
          current_status: currentStatus,
          explanation: finding.explanation,
          impact: finding.impact,
          remediation: finding.remediation,
          fix_prompt: finding.fixPrompt,
          verification: finding.verification,
          references: finding.references,
          detection_sources: finding.detectionSources,
          is_heuristic: finding.heuristic,
          first_seen_scan_id: scanId,
          first_seen_at: now,
          last_seen_scan_id: scanId,
          last_seen_at: now,
        }).select("id").single();
        if (error || !saved) throw new Error("finding_insert_failed");
        findingId = saved.id as string;
      }

      const { error: occurrenceError } = await this.client.from("finding_occurrences").insert({
        finding_id: findingId,
        scan_id: scanId,
        file_path: finding.evidence.filePath ?? null,
        line_number: finding.evidence.line ?? null,
        redacted_evidence: finding.evidence.excerpt.slice(0, 8000),
        evidence_fingerprint: finding.evidenceFingerprint,
        machine_result: finding.machineResult,
        status_at_scan: currentStatus,
        is_new: isNew,
        is_regression: isRegression,
        detected_at: now,
      });
      if (occurrenceError && occurrenceError.code !== "23505") {
        throw new Error("finding_occurrence_insert_failed");
      }

      if (isRegression && prior) {
        statusEvents.push({
          finding_id: findingId,
          previous_status: "fixed",
          new_status: "open",
          reason: "Finding reappeared in a later repository snapshot.",
          source: "scanner",
        });
      }
    }

    const resolved = coverageComplete
      ? existing.filter((row) => row.current_status === "open" && !seen.has(row.fingerprint as string))
      : [];
    for (const row of resolved) {
      const { error } = await this.client.from("findings").update({ current_status: "fixed" }).eq("id", row.id);
      if (error) throw new Error("resolved_finding_update_failed");
      statusEvents.push({
        finding_id: row.id,
        previous_status: "open",
        new_status: "fixed",
        reason: "The finding was not observed in the latest completed scan.",
        source: "scanner",
      });
    }
    if (statusEvents.length > 0) {
      const { error } = await this.client.from("finding_status_events").insert(statusEvents);
      if (error) throw new Error("finding_status_event_insert_failed");
    }

    const findingCounts = { ...EMPTY_COUNTS };
    for (const finding of findings) findingCounts[finding.severity] += 1;
    return {
      findingCounts,
      newHighCount,
      regressionCount,
      resolvedCount: resolved.length,
    };
  }

  async completeScan(input: CompleteScanInput) {
    const now = new Date().toISOString();
    const scanUpdate = {
      status: "completed",
      verdict: input.verdict,
      coverage_complete: input.coverageComplete,
      limitation_notes: input.limitationNotes,
      finding_counts: input.findingCounts,
      report_fingerprint: input.reportFingerprint,
      completed_at: now,
    };
    const { error: scanError } = await this.client.from("scans").update(scanUpdate).eq("id", input.job.scanId);
    if (scanError) throw new Error("scan_completion_update_failed");

    const { error: jobError } = await this.client.from("scan_jobs").update({
      status: "completed",
      completed_at: now,
      lease_expires_at: null,
      last_error_code: null,
      last_error_redacted: null,
    }).eq("id", input.job.jobId);
    if (jobError) throw new Error("scan_job_completion_failed");

    if (!input.projectId) {
      const limited = input.findings
        .filter((finding) => finding.severity !== "info")
        .sort((a, b) => {
          const order: Record<Severity, number> = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
          return order[b.severity] - order[a.severity];
        })
        .slice(0, 3)
        .map((finding) => ({
          id: finding.fingerprint,
          title: finding.title,
          severity: finding.severity,
          explanation: finding.explanation,
          evidence: finding.evidence.excerpt,
        }));
      const { error } = await this.client.from("free_scan_requests").update({
        status: "completed",
        verdict: input.verdict,
        limited_findings: limited,
        scope_snapshot: input.scope,
        error_code: null,
      }).eq("scan_id", input.job.scanId);
      if (error) throw new Error("free_scan_completion_failed");
      return;
    }

    const { data: project, error: projectError } = await this.client
      .from("projects")
      .select("organization_id")
      .eq("id", input.projectId)
      .single();
    if (projectError || !project) throw new Error("report_project_load_failed");
    const organizationId = project.organization_id as string;
    const { error: reportError } = await this.client.from("reports").upsert({
      organization_id: organizationId,
      project_id: input.projectId,
      scan_id: input.job.scanId,
      status: "ready",
      report_fingerprint: input.reportFingerprint,
      generated_at: now,
    }, { onConflict: "scan_id" });
    if (reportError) throw new Error("report_upsert_failed");

    const { data: statusRows, error: statusError } = await this.client
      .from("findings")
      .select("current_status")
      .eq("project_id", input.projectId);
    if (statusError) throw new Error("public_report_status_summary_failed");
    const remediationSummary = ((statusRows ?? []) as FindingStatusRow[]).reduce((summary, row) => {
      const status = String(row.current_status);
      if (status === "fixed") summary.fixed += 1;
      else if (status === "dismissed") summary.dismissed += 1;
      else summary.openHidden += 1;
      return summary;
    }, { fixed: 0, dismissed: 0, openHidden: 0 });
    const { error: publicError } = await this.client.from("public_report_settings").update({
      last_scan_id: input.job.scanId,
      last_scan_at: now,
      report_fingerprint: input.reportFingerprint,
      passed_controls: input.passedControls,
      remediation_summary: remediationSummary,
      scope_snapshot: input.scope,
    }).eq("project_id", input.projectId);
    if (publicError) throw new Error("public_report_summary_update_failed");

    const { error: auditError } = await this.client.from("audit_events").insert({
      organization_id: organizationId,
      actor_type: "worker",
      action: "scan.completed",
      target_type: "scan",
      target_id: input.job.scanId,
      after_state: {
        verdict: input.verdict,
        reportFingerprint: input.reportFingerprint,
        findingCounts: input.findingCounts,
      },
    });
    if (auditError) throw new Error("scan_audit_insert_failed");
  }

  async failOrRetryJob(job: ScanJob, code: string, detail: string) {
    const now = new Date();
    const willRetry = job.attempt < job.maxAttempts;
    if (willRetry) {
      const delaySeconds = Math.min(300, 15 * 2 ** Math.max(0, job.attempt - 1));
      const { error: jobError } = await this.client.from("scan_jobs").update({
        status: "queued",
        available_at: new Date(now.getTime() + delaySeconds * 1000).toISOString(),
        locked_at: null,
        locked_by: null,
        lease_expires_at: null,
        last_error_code: code,
        last_error_redacted: detail.slice(0, 1000),
      }).eq("id", job.jobId);
      if (jobError) throw new Error("scan_job_retry_update_failed");
      await this.client.from("scans").update({ status: "queued" }).eq("id", job.scanId);
      return { willRetry: true };
    }

    const completedAt = now.toISOString();
    const [{ error: scanError }, { error: jobError }] = await Promise.all([
      this.client.from("scans").update({
        status: "failed",
        verdict: "SCAN INCOMPLETE",
        coverage_complete: false,
        completed_at: completedAt,
        limitation_notes: [`Required scanner workflow failed: ${code}`],
      }).eq("id", job.scanId),
      this.client.from("scan_jobs").update({
        status: "dead",
        last_error_code: code,
        last_error_redacted: detail.slice(0, 1000),
        completed_at: completedAt,
        lease_expires_at: null,
      }).eq("id", job.jobId),
    ]);
    if (scanError || jobError) throw new Error("scan_failure_update_failed");
    if (job.payload.mode === "free") {
      await this.client.from("free_scan_requests").update({
        status: "failed",
        verdict: "SCAN INCOMPLETE",
        error_code: code,
      }).eq("scan_id", job.scanId);
    }
    return { willRetry: false };
  }

  createReportFingerprint(input: {
    scanId: string;
    commitSha: string | null;
    verdict: string;
    findings: NormalizedFinding[];
    components: ComponentResult[];
  }) {
    const payload = JSON.stringify({
      scanId: input.scanId,
      commitSha: input.commitSha,
      verdict: input.verdict,
      findings: input.findings.map((finding) => finding.fingerprint).sort(),
      components: input.components.map((component) => `${component.name}:${component.status}:${component.version}`).sort(),
    });
    return `rs_${hash(payload).slice(0, 16)}`;
  }
}
