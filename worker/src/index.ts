import { loadConfig } from "./config.js";
import { WorkerDatabase } from "./db.js";
import { deduplicateFindings } from "./findings.js";
import { log } from "./log.js";
import { notifyWebApp } from "./notifier.js";
import { runScanComponents } from "./orchestrator.js";
import { cleanupWorkspace, createSnapshot, repositoryErrorCode } from "./repository.js";
import type { NormalizedFinding, ScanJob, Severity } from "./types.js";

const severityOrder: Record<Severity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

function findingCounts(findings: NormalizedFinding[]) {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const finding of findings) counts[finding.severity] += 1;
  return counts;
}

function verdictFor(findings: NormalizedFinding[], coverageComplete: boolean) {
  if (!coverageComplete) return "SCAN INCOMPLETE" as const;
  if (findings.some((finding) => finding.severity === "critical" || finding.severity === "high")) return "BLOCKED" as const;
  if (findings.some((finding) => finding.severity === "medium" || finding.severity === "low" || finding.severity === "info")) return "NEEDS WORK" as const;
  return "READY FOR LAUNCH CHECKS" as const;
}

function limitationNotes(mode: "free" | "launch_pack" | "monitoring", hasSite: boolean, siteVerified: boolean) {
  const notes = [
    "Static analysis does not execute repository code or prove runtime authorization behavior.",
    "Dependency and source checks cover the downloaded default-branch snapshot only.",
    "Automated checks are not a penetration test, certification, warranty, or proof that the project is secure.",
  ];
  if (mode === "free") notes.push("The free check omits full static application analysis and limits displayed findings.");
  if (!hasSite) notes.push("No deployed-site target was configured.");
  else if (!siteVerified) notes.push("The deployed-site target was unverified, so only a passive root request was performed and site failure did not block repository coverage.");
  return notes;
}

function scanScope(mode: "free" | "launch_pack" | "monitoring", hasSite: boolean, siteVerified: boolean) {
  return [
    "Default-branch repository snapshot",
    "Repository posture and GitHub Actions",
    "Secret-pattern and dependency checks",
    ...(mode === "free" ? [] : ["Static application and configuration rules"]),
    ...(hasSite ? [siteVerified ? "Verified deployed-site root URL" : "Unverified passive deployed-site root URL"] : []),
  ];
}

function errorDetail(error: unknown) {
  if (error instanceof Error) return error.message.replace(/[\r\n\t]+/g, " ").slice(0, 1000);
  return "scan_processing_failed";
}

async function processJob(config: ReturnType<typeof loadConfig>, db: WorkerDatabase, job: ScanJob) {
  const started = Date.now();
  let workspace: string | undefined;
  let loaded: Awaited<ReturnType<WorkerDatabase["loadTarget"]>> | undefined;
  let completed = false;

  try {
    loaded = await db.loadTarget(job);
    job.payload.mode = loaded.mode;
    job.payload.projectId = loaded.projectId;
    job.payload.commitSha = loaded.requestedCommitSha ?? null;
    await db.prepareScan(job.scanId);
    const deadlineAt = started + config.limits.scanTimeoutMs;
    await notifyWebApp(config, {
      type: "scan.started",
      scanId: job.scanId,
      projectId: loaded.projectId,
      mode: loaded.mode,
    });
    const created = await createSnapshot(config, loaded.target, loaded.mode, loaded.requestedCommitSha, deadlineAt);
    workspace = created.workspace;
    await db.updateSnapshotMetadata(job.scanId, loaded.projectId, loaded.target, created.snapshot);

    const components = await runScanComponents({
      config,
      db,
      scanId: job.scanId,
      target: loaded.target,
      snapshot: created.snapshot,
      workspace: created.workspace,
      githubToken: created.githubToken,
      mode: loaded.mode,
      deadlineAt,
    });
    if (Date.now() - started > config.limits.scanTimeoutMs) throw new Error("scan_timeout");

    const findings = deduplicateFindings(components.flatMap((component) => component.findings))
      .sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity] || a.ruleId.localeCompare(b.ruleId));
    const coverageComplete = components.every((component) => !component.required || component.status === "passed");
    const verdict = verdictFor(findings, coverageComplete);
    const limitations = limitationNotes(loaded.mode, Boolean(loaded.target.site), Boolean(loaded.target.site?.verified));
    const scope = scanScope(loaded.mode, Boolean(loaded.target.site), Boolean(loaded.target.site?.verified));
    const passedControls = components
      .filter((component) => component.status === "passed")
      .flatMap((component) => component.passedControls ?? [])
      .slice(0, 100);

    const persistence = loaded.projectId
      ? await db.persistProjectFindings(loaded.projectId, job.scanId, findings, coverageComplete)
      : {
          findingCounts: findingCounts(findings),
          newHighCount: findings.filter((finding) => finding.severity === "critical" || finding.severity === "high").length,
          regressionCount: 0,
          resolvedCount: 0,
        };
    const reportFingerprint = db.createReportFingerprint({
      scanId: job.scanId,
      commitSha: created.snapshot.commitSha,
      verdict,
      findings,
      components,
    });

    await db.completeScan({
      job,
      projectId: loaded.projectId,
      verdict,
      coverageComplete,
      limitationNotes: limitations,
      reportFingerprint,
      findingCounts: persistence.findingCounts,
      findings,
      components,
      passedControls,
      scope,
    });
    completed = true;

    await notifyWebApp(config, {
      type: "scan.completed",
      scanId: job.scanId,
      projectId: loaded.projectId,
      mode: loaded.mode,
      verdict,
      reportFingerprint,
      findingCounts: persistence.findingCounts,
      newHighCount: persistence.newHighCount,
      regressionCount: persistence.regressionCount,
      resolvedCount: persistence.resolvedCount,
    });
    log.info("scan completed", {
      scanId: job.scanId,
      mode: loaded.mode,
      verdict,
      coverageComplete,
      findingCount: findings.length,
      commitSha: created.snapshot.commitSha,
      durationMs: Date.now() - started,
    });
  } catch (error) {
    const code = repositoryErrorCode(error);
    log.error("scan processing failed", {
      scanId: job.scanId,
      attempt: job.attempt,
      maxAttempts: job.maxAttempts,
      code,
      error: errorDetail(error),
    });
    if (!completed) {
      try {
        const outcome = await db.failOrRetryJob(job, code, errorDetail(error));
        if (!outcome.willRetry) {
          await notifyWebApp(config, {
            type: "scan.failed",
            scanId: job.scanId,
            projectId: loaded?.projectId,
            mode: loaded?.mode ?? job.payload.mode ?? "launch_pack",
            errorCode: code,
          });
        }
      } catch (transitionError) {
        // Leave the lease to expire so another worker can safely reclaim the job.
        log.error("scan failure transition failed", {
          scanId: job.scanId,
          error: transitionError instanceof Error ? transitionError.message : "failure_transition_failed",
        });
      }
    }
  } finally {
    if (workspace) {
      try {
        await cleanupWorkspace(workspace);
      } catch (cleanupError) {
        log.error("workspace cleanup failed", {
          scanId: job.scanId,
          error: cleanupError instanceof Error ? cleanupError.message : "cleanup_failed",
        });
      }
    }
  }
}

async function main() {
  const config = loadConfig();
  const db = new WorkerDatabase(config);
  const active = new Set<Promise<void>>();
  let stopping = false;
  const stop = () => {
    stopping = true;
    log.info("worker shutdown requested", { activeJobs: active.size });
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);

  log.info("worker started", {
    workerId: config.workerId,
    concurrency: config.concurrency,
    pollIntervalMs: config.pollIntervalMs,
  });

  while (!stopping) {
    while (!stopping && active.size < config.concurrency) {
      let job: ScanJob | null = null;
      try {
        job = await db.claimJob();
      } catch (error) {
        log.error("job claim failed", { error: error instanceof Error ? error.message : "claim_failed" });
        break;
      }
      if (!job) break;
      let task!: Promise<void>;
      task = processJob(config, db, job).finally(() => active.delete(task));
      active.add(task);
    }
    if (active.size > 0) {
      await Promise.race([
        Promise.race(active),
        new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs)),
      ]);
    } else {
      await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
    }
  }

  await Promise.allSettled(active);
  log.info("worker stopped");
}

main().catch((error) => {
  log.error("worker fatal error", { error: error instanceof Error ? error.message : "fatal_error" });
  process.exitCode = 1;
});
