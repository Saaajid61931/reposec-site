import { SCAN_COMPONENTS, type ScanComponentName } from "./components.js";
import { WorkerDatabase } from "./db.js";
import { deduplicateFindings } from "./findings.js";
import { log } from "./log.js";
import { scanGitHubActions, scanRepositoryPosture, scanStaticPatterns } from "./scanners/builtin.js";
import { scanGitleaks, scanOsv, scanSemgrep, scanTrivy } from "./scanners/external.js";
import { scanDeployedSite } from "./scanners/site.js";
import type { ComponentResult, NormalizedFinding, RepositorySnapshot, RepositoryTarget, WorkerConfig } from "./types.js";

function statusRank(status: ComponentResult["status"]) {
  switch (status) {
    case "timed_out": return 4;
    case "failed": return 3;
    case "skipped": return 2;
    case "passed": return 1;
  }
}

function aggregateComponent(
  name: ScanComponentName,
  required: boolean,
  results: ComponentResult[],
  findingFilter?: (finding: NormalizedFinding) => boolean,
): ComponentResult {
  const findings = deduplicateFindings(
    results.flatMap((result) => result.findings.filter((finding) => findingFilter?.(finding) ?? true)),
  );
  const worst = [...results].sort((a, b) => statusRank(b.status) - statusRank(a.status))[0];
  const status = results.every((result) => result.status === "skipped")
    ? "skipped"
    : worst?.status === "timed_out"
      ? "timed_out"
      : results.some((result) => result.status === "failed")
        ? "failed"
        : "passed";
  const versions = results.map((result) => `${result.name}@${result.version}`).join(", ");
  const summaries = results.map((result) => result.summary).join("; ").slice(0, 1000);
  return {
    name,
    version: versions || "reposec-2026.07",
    status,
    required,
    ruleCount: results.reduce((total, result) => total + result.ruleCount, 0),
    findings,
    summary: summaries || `${name} completed`,
    errorCode: worst && worst.status !== "passed" && worst.status !== "skipped" ? worst.errorCode : undefined,
    errorDetail: worst && worst.status !== "passed" && worst.status !== "skipped" ? worst.errorDetail : undefined,
    durationMs: Math.max(0, ...results.map((result) => result.durationMs)),
    passedControls: results.flatMap((result) => result.passedControls ?? []),
  };
}

function timedOutResult(name: ScanComponentName, required: boolean, started: number): ComponentResult {
  return {
    name,
    version: "reposec-2026.07",
    status: "timed_out",
    required,
    ruleCount: 0,
    findings: [],
    summary: `${name} exceeded its component timeout`,
    errorCode: "component_timeout",
    errorDetail: "The component exceeded the configured execution limit.",
    durationMs: Date.now() - started,
  };
}

async function withComponentTimeout(
  name: ScanComponentName,
  required: boolean,
  timeoutMs: number,
  task: () => Promise<ComponentResult>,
) {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task(),
      new Promise<ComponentResult>((resolve) => {
        timer = setTimeout(() => resolve(timedOutResult(name, required, started)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function runAndPersist(
  db: WorkerDatabase,
  scanId: string,
  name: ScanComponentName,
  required: boolean,
  config: WorkerConfig,
  deadlineAt: number,
  task: (timeoutMs: number) => Promise<ComponentResult>,
) {
  await db.startComponent(scanId, name, required);
  const remainingMs = deadlineAt - Date.now();
  const timeoutMs = Math.min(config.limits.componentTimeoutMs, remainingMs);
  const result = timeoutMs <= 0
    ? timedOutResult(name, required, Date.now())
    : await withComponentTimeout(name, required, timeoutMs, () => task(timeoutMs));
  await db.finishComponent(scanId, result);
  log.info("scan component completed", {
    scanId,
    component: name,
    status: result.status,
    findingCount: result.findings.length,
    durationMs: result.durationMs,
  });
  return result;
}

function configWithComponentTimeout(config: WorkerConfig, timeoutMs: number): WorkerConfig {
  return {
    ...config,
    limits: { ...config.limits, componentTimeoutMs: Math.max(1, timeoutMs) },
  };
}

function trivySubset(result: ComponentResult, name: string, predicate: (finding: NormalizedFinding) => boolean): ComponentResult {
  const findings = result.findings.filter(predicate);
  return {
    ...result,
    name,
    ruleCount: findings.length,
    findings,
    summary: result.status === "passed"
      ? `${findings.length} ${name.toLowerCase()} result(s) from Trivy`
      : result.summary,
  };
}

export async function runScanComponents({
  config,
  db,
  scanId,
  target,
  snapshot,
  workspace,
  githubToken,
  mode,
  deadlineAt,
}: {
  config: WorkerConfig;
  db: WorkerDatabase;
  scanId: string;
  target: RepositoryTarget;
  snapshot: RepositorySnapshot;
  workspace: string;
  githubToken?: string;
  mode: "free" | "launch_pack" | "monitoring";
  deadlineAt: number;
}) {
  const results: ComponentResult[] = [];

  results.push(await runAndPersist(db, scanId, "Repository posture", true, config, deadlineAt, async () => {
    const result = await scanRepositoryPosture({ snapshot, target, githubToken });
    return { ...result, name: "Repository posture", required: true };
  }));

  results.push(await runAndPersist(db, scanId, "GitHub Actions", true, config, deadlineAt, async () => {
    const result = await scanGitHubActions(snapshot);
    return { ...result, name: "GitHub Actions", required: true };
  }));

  let trivyPromise: Promise<ComponentResult> | undefined;
  const getTrivy = (timeoutMs: number) => {
    trivyPromise ??= scanTrivy(configWithComponentTimeout(config, timeoutMs), snapshot, workspace);
    return trivyPromise;
  };
  const secretPromise = runAndPersist(db, scanId, "Secrets", true, config, deadlineAt, async (timeoutMs) => {
    const scannerConfig = configWithComponentTimeout(config, timeoutMs);
    const [gitleaks, trivy] = await Promise.all([scanGitleaks(scannerConfig, snapshot, workspace), getTrivy(timeoutMs)]);
    return aggregateComponent("Secrets", true, [
      gitleaks,
      trivySubset(trivy, "Trivy secrets", (finding) => finding.category === "Secrets"),
    ]);
  });

  const dependencyPromise = runAndPersist(db, scanId, "Dependencies", true, config, deadlineAt, async (timeoutMs) => {
    const scannerConfig = configWithComponentTimeout(config, timeoutMs);
    const [osv, trivy] = await Promise.all([scanOsv(scannerConfig, snapshot, workspace), getTrivy(timeoutMs)]);
    return aggregateComponent("Dependencies", true, [
      osv,
      trivySubset(trivy, "Trivy dependencies", (finding) => finding.category === "Dependencies"),
    ]);
  });

  const staticPromise = mode === "free"
    ? Promise.resolve<ComponentResult>({
        name: "Static analysis",
        version: "not-in-free-scan",
        status: "skipped",
        required: false,
        ruleCount: 0,
        findings: [],
        summary: "Full static analysis is not included in the free scan",
        durationMs: 0,
      })
    : runAndPersist(db, scanId, "Static analysis", true, config, deadlineAt, async (timeoutMs) => {
        const scannerConfig = configWithComponentTimeout(config, timeoutMs);
        const [semgrep, builtin, trivy] = await Promise.all([
          scanSemgrep(scannerConfig, snapshot, workspace),
          scanStaticPatterns(snapshot),
          getTrivy(timeoutMs),
        ]);
        return aggregateComponent("Static analysis", true, [
          semgrep,
          builtin,
          trivySubset(trivy, "Trivy configuration", (finding) => finding.category === "Infrastructure and configuration"),
        ]);
      });

  results.push(...await Promise.all([secretPromise, dependencyPromise]));
  if (mode !== "free") results.push(await staticPromise);

  const siteRequired = Boolean(target.site?.verified);
  results.push(await runAndPersist(
    db,
    scanId,
    "Deployed site",
    siteRequired,
    config,
    deadlineAt,
    async (timeoutMs) => scanDeployedSite(target, timeoutMs),
  ));

  const ordered = SCAN_COMPONENTS.flatMap((name) => results.filter((result) => result.name === name));
  return ordered;
}
