import { readFile } from "node:fs/promises";
import path from "node:path";
import { createFinding, hash, redact } from "../findings.js";
import { runTool } from "../tools.js";
import type {
  ComponentResult,
  NormalizedFinding,
  RepositorySnapshot,
  Severity,
  WorkerConfig,
} from "../types.js";

function severity(value: string | undefined, fallback: Severity = "medium"): Severity {
  switch (value?.toUpperCase()) {
    case "CRITICAL": return "critical";
    case "HIGH":
    case "ERROR": return "high";
    case "MEDIUM":
    case "MODERATE":
    case "WARNING":
    case "WARN": return "medium";
    case "LOW": return "low";
    case "INFO":
    case "UNKNOWN": return "info";
    default: return fallback;
  }
}

function failure(name: string, version: string, started: number, error: unknown): ComponentResult {
  const message = error instanceof Error ? error.message : "scanner_failed";
  const timedOut = /(?:timeout|scanner_exit_124)/i.test(message);
  return {
    name,
    version,
    status: timedOut ? "timed_out" : "failed",
    required: true,
    ruleCount: 0,
    findings: [],
    summary: `${name} did not complete`,
    errorCode: message.replace(/[^a-z0-9_]+/gi, "_").toLowerCase().slice(0, 80),
    errorDetail: "Scanner failure details are available to administrators without repository output.",
    durationMs: Date.now() - started,
  };
}


function evidencePath(snapshotRoot: string, candidate?: string) {
  if (!candidate) return undefined;
  const absolute = path.isAbsolute(candidate)
    ? path.resolve(candidate)
    : path.resolve(snapshotRoot, candidate);
  const relative = path.relative(snapshotRoot, absolute);
  if (!relative || relative === "." || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
    return undefined;
  }
  return relative.split(path.sep).join("/").slice(0, 1000);
}

function dependencyScope(snapshot: RepositorySnapshot, packageName: string) {
  const packageFiles = snapshot.files.filter((file) => file.relativePath.endsWith("package.json") && file.size <= 1_000_000);
  return Promise.all(packageFiles.map(async (file) => {
    try {
      const manifest = JSON.parse(await readFile(file.absolutePath, "utf8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        optionalDependencies?: Record<string, string>;
      };
      if (manifest.dependencies?.[packageName] || manifest.optionalDependencies?.[packageName]) return "runtime";
      if (manifest.devDependencies?.[packageName]) return "development";
    } catch {
      return null;
    }
    return null;
  })).then((values) => values.find(Boolean) ?? "transitive or unknown");
}

export async function scanGitleaks(
  config: WorkerConfig,
  snapshot: RepositorySnapshot,
  workspace: string,
): Promise<ComponentResult> {
  const started = Date.now();
  const version = "8.30.1";
  const report = path.join(workspace, "gitleaks.json");
  try {
    await runTool({
      command: "gitleaks",
      args: [
        "dir",
        snapshot.root,
        "--no-banner",
        "--redact=100",
        "--report-format=json",
        `--report-path=${report}`,
        "--exit-code=0",
      ],
      cwd: workspace,
      config,
      acceptedExitCodes: [0, 1],
    });
    const raw = await readFile(report, "utf8").catch(() => "[]");
    const results = JSON.parse(raw) as Array<{
      RuleID?: string;
      Description?: string;
      File?: string;
      StartLine?: number;
      Secret?: string;
      Match?: string;
    }>;
    const findings: NormalizedFinding[] = results.map((result) => {
      const secretFingerprint = hash(result.Secret ?? result.Match ?? `${result.RuleID}:${result.File}:${result.StartLine}`).slice(0, 12);
      const relativePath = evidencePath(snapshot.root, result.File);
      return createFinding({
        ruleId: `SECRET-${result.RuleID ?? "GENERIC"}`,
        title: "Secret-shaped value is committed",
        category: "Secrets",
        severity: "high",
        confidence: "high",
        explanation: `Gitleaks matched ${result.Description ?? result.RuleID ?? "a known credential pattern"}. The value is not retained.`,
        impact: "A committed credential can be recovered from clones or history and used until it is revoked or rotated.",
        evidence: {
          excerpt: `[REDACTED secret pattern; fingerprint:${secretFingerprint}]`,
          filePath: relativePath,
          line: result.StartLine,
          secretFingerprint,
        },
        detectionSource: "Gitleaks",
        remediation: "Revoke or rotate the credential first, replace it with protected runtime configuration, remove relevant history copies, and add a safe placeholder template.",
        desiredBehavior: "the repository and its history contain no usable credential and runtime configuration injects the rotated value through a protected secret store.",
        verification: "the old credential is revoked, its fingerprint is absent from a full history-aware secret scan, and the application still reads the rotated secret server-side.",
        references: [{ label: "Gitleaks", url: "https://github.com/gitleaks/gitleaks" }],
        machineResult: { ruleId: result.RuleID, description: result.Description },
        fingerprintAnchor: `${result.RuleID}:${relativePath}:${secretFingerprint}`,
      });
    });
    return {
      name: "Gitleaks",
      version,
      status: "passed",
      required: true,
      ruleCount: results.length > 0 ? results.length : 1,
      findings,
      summary: `${results.length} redacted secret-pattern result(s)`,
      durationMs: Date.now() - started,
      passedControls: results.length === 0 ? [{ name: "Secret patterns", detail: "Gitleaks observed no credential-pattern finding." }] : [],
    };
  } catch (error) {
    return failure("Gitleaks", version, started, error);
  }
}

interface SemgrepResult {
  check_id: string;
  path: string;
  start: { line: number };
  end?: { line: number };
  extra?: {
    message?: string;
    severity?: string;
    lines?: string;
    metadata?: Record<string, unknown>;
  };
}

export async function scanSemgrep(
  config: WorkerConfig,
  snapshot: RepositorySnapshot,
  workspace: string,
): Promise<ComponentResult> {
  const started = Date.now();
  const version = "1.164.0";
  try {
    const output = await runTool({
      command: "semgrep",
      args: [
        "scan",
        "--config=/app/rules/semgrep.yml",
        "--json",
        "--metrics=off",
        "--jobs=1",
        `--max-target-bytes=${config.limits.fileBytes}`,
        "--timeout=10",
        "--timeout-threshold=3",
        "--exclude=.git",
        snapshot.root,
      ],
      cwd: workspace,
      config,
      acceptedExitCodes: [0, 1],
    });
    const parsed = JSON.parse(output.stdout.toString("utf8") || "{}") as {
      results?: SemgrepResult[];
      errors?: Array<{ type?: string; message?: string }>;
      paths?: { scanned?: string[] };
    };
    const fatalErrors = (parsed.errors ?? []).filter((error) => !/syntax|parse/i.test(error.type ?? ""));
    if (fatalErrors.length > 0) throw new Error(`semgrep_${fatalErrors[0]?.type ?? "error"}`);
    const results = parsed.results ?? [];
    const findings = results.map((result) => {
      const relativePath = evidencePath(snapshot.root, result.path);
      return createFinding({
        ruleId: `SEMGREP-${result.check_id}`,
        title: result.extra?.message ?? result.check_id,
        category: "Static application security",
        severity: severity(result.extra?.severity),
        confidence: "medium",
        explanation: `${result.extra?.message ?? "Semgrep matched a security rule."} Static evidence should be confirmed in the surrounding data flow.`,
        impact: "If reachable with attacker-controlled data, the matched behavior can weaken confidentiality, integrity, or authorization.",
        evidence: {
          excerpt: redact(result.extra?.lines ?? `[Semgrep match ${result.check_id}]`, 500),
          filePath: relativePath,
          line: result.start.line,
        },
        detectionSource: "Semgrep Community Edition (pinned local policy)",
        remediation: "Review the complete source-to-sink path, apply the narrow secure API or validation for this rule, and add a regression test.",
        desiredBehavior: "untrusted data cannot reach the matched sensitive behavior without the rule-specific validation or authorization boundary.",
        verification: "the relevant security test passes and a Semgrep rescan no longer reports the unsafe data flow.",
        references: [{ label: "Semgrep documentation", url: "https://semgrep.dev/docs/" }],
        heuristic: true,
        machineResult: { checkId: result.check_id, severity: result.extra?.severity },
        fingerprintAnchor: `${result.check_id}:${relativePath}:${result.start.line}`,
      });
    });
    return {
      name: "Semgrep",
      version,
      status: "passed",
      required: true,
      ruleCount: 6,
      findings,
      summary: `${parsed.paths?.scanned?.length ?? 0} target(s) evaluated; ${results.length} result(s)`,
      durationMs: Date.now() - started,
      passedControls: results.length === 0 ? [{ name: "Semgrep policy", detail: "The pinned Semgrep policy reported no finding." }] : [],
    };
  } catch (error) {
    return failure("Semgrep", version, started, error);
  }
}

interface TrivyVulnerability {
  VulnerabilityID: string;
  PkgName: string;
  InstalledVersion: string;
  FixedVersion?: string;
  Severity?: string;
  Title?: string;
  Description?: string;
  PrimaryURL?: string;
}

interface TrivySecret {
  RuleID: string;
  Category?: string;
  Severity?: string;
  Title?: string;
  StartLine?: number;
  Match?: string;
}

interface TrivyMisconfiguration {
  ID: string;
  Title?: string;
  Description?: string;
  Message?: string;
  Resolution?: string;
  Severity?: string;
  PrimaryURL?: string;
  CauseMetadata?: { StartLine?: number };
}

interface TrivyTarget {
  Target: string;
  Class?: string;
  Type?: string;
  Vulnerabilities?: TrivyVulnerability[];
  Secrets?: TrivySecret[];
  Misconfigurations?: TrivyMisconfiguration[];
}

export async function scanTrivy(
  config: WorkerConfig,
  snapshot: RepositorySnapshot,
  workspace: string,
): Promise<ComponentResult> {
  const started = Date.now();
  const version = "0.70.0";
  const report = path.join(workspace, "trivy.json");
  try {
    await runTool({
      command: "trivy",
      args: [
        "fs",
        "--format=json",
        "--scanners=vuln,secret,misconfig",
        "--skip-db-update",
        "--skip-check-update",
        "--offline-scan",
        `--cache-dir=${process.env.TRIVY_CACHE_DIR ?? "/var/lib/reposec/trivy"}`,
        "--timeout=3m",
        `--output=${report}`,
        snapshot.root,
      ],
      cwd: workspace,
      config,
      timeoutMs: config.limits.componentTimeoutMs,
    });
    const parsed = JSON.parse(await readFile(report, "utf8")) as { Results?: TrivyTarget[] };
    const findings: NormalizedFinding[] = [];
    let ruleCount = 0;
    for (const result of parsed.Results ?? []) {
      const targetPath = evidencePath(snapshot.root, result.Target);
      for (const vulnerability of result.Vulnerabilities ?? []) {
        ruleCount += 1;
        const scope = await dependencyScope(snapshot, vulnerability.PkgName);
        findings.push(createFinding({
          ruleId: `DEPENDENCY-${vulnerability.VulnerabilityID}`,
          title: `${vulnerability.PkgName} ${vulnerability.InstalledVersion} has a known vulnerability`,
          category: "Dependencies",
          severity: severity(vulnerability.Severity),
          confidence: "high",
          explanation: `${vulnerability.VulnerabilityID} affects installed ${vulnerability.PkgName} ${vulnerability.InstalledVersion}. Dependency scope: ${scope}.`,
          impact: vulnerability.Title ?? vulnerability.Description?.slice(0, 500) ?? "The advisory documents security impact in this dependency version.",
          evidence: {
            excerpt: `Package: ${vulnerability.PkgName}; installed: ${vulnerability.InstalledVersion}; fixed: ${vulnerability.FixedVersion || "not listed"}; scope: ${scope}`,
            filePath: targetPath || undefined,
          },
          detectionSource: "Trivy",
          remediation: vulnerability.FixedVersion
            ? `Upgrade ${vulnerability.PkgName} to ${vulnerability.FixedVersion} or a later compatible fixed release without bypassing the lockfile.`
            : `Review the advisory and replace, constrain, or mitigate ${vulnerability.PkgName}; no fixed version was listed.`,
          desiredBehavior: `the resolved ${vulnerability.PkgName} version is outside the advisory's affected range without breaking supported application behavior.`,
          verification: "the trusted build and tests pass, the lockfile resolves the intended fixed version, and both OSV and Trivy no longer report the advisory.",
          references: vulnerability.PrimaryURL ? [{ label: vulnerability.VulnerabilityID, url: vulnerability.PrimaryURL }] : [],
          machineResult: {
            advisory: vulnerability.VulnerabilityID,
            package: vulnerability.PkgName,
            installedVersion: vulnerability.InstalledVersion,
            fixedVersion: vulnerability.FixedVersion,
            scope,
          },
          fingerprintAnchor: `${vulnerability.VulnerabilityID}:${vulnerability.PkgName}:${targetPath || "dependency"}`,
        }));
      }
      for (const secret of result.Secrets ?? []) {
        ruleCount += 1;
        const secretFingerprint = hash(secret.Match ?? `${secret.RuleID}:${targetPath}:${secret.StartLine}`).slice(0, 12);
        findings.push(createFinding({
          ruleId: `SECRET-${secret.RuleID}`,
          title: secret.Title ?? "Secret-shaped value is committed",
          category: "Secrets",
          severity: severity(secret.Severity, "high"),
          confidence: "high",
          explanation: `Trivy matched ${secret.Category ?? secret.RuleID}. The detected value is not retained.`,
          impact: "A committed credential can remain recoverable and usable until explicitly rotated.",
          evidence: { excerpt: `[REDACTED secret pattern; fingerprint:${secretFingerprint}]`, filePath: targetPath, line: secret.StartLine, secretFingerprint },
          detectionSource: "Trivy secret scanner",
          remediation: "Rotate or revoke the value, replace it with protected runtime configuration, and remove history copies.",
          desiredBehavior: "no usable credential exists in repository content or history and the application obtains secrets only at runtime.",
          verification: "the old value is revoked and full secret scans no longer report its fingerprint.",
          machineResult: { ruleId: secret.RuleID, category: secret.Category },
          fingerprintAnchor: `${secret.RuleID}:${targetPath}:${secretFingerprint}`,
        }));
      }
      for (const issue of result.Misconfigurations ?? []) {
        ruleCount += 1;
        findings.push(createFinding({
          ruleId: `TRIVY-${issue.ID}`,
          title: issue.Title ?? issue.ID,
          category: "Infrastructure and configuration",
          severity: severity(issue.Severity),
          confidence: "medium",
          explanation: issue.Message ?? issue.Description ?? "Trivy matched a configuration security rule.",
          impact: issue.Description?.slice(0, 700) ?? "The configuration can weaken the production security boundary.",
          evidence: { excerpt: redact(issue.Message ?? `[Trivy misconfiguration ${issue.ID}]`, 500), filePath: targetPath, line: issue.CauseMetadata?.StartLine },
          detectionSource: "Trivy misconfiguration scanner",
          remediation: issue.Resolution ?? "Apply the rule-specific least-privilege configuration and review dependent deployment settings.",
          desiredBehavior: "the affected configuration meets the rule's secure setting without broadening permissions elsewhere.",
          verification: "the deployment configuration remains valid and Trivy no longer reports this rule.",
          references: issue.PrimaryURL ? [{ label: issue.ID, url: issue.PrimaryURL }] : [],
          heuristic: true,
          machineResult: { id: issue.ID, severity: issue.Severity },
          fingerprintAnchor: `${issue.ID}:${targetPath}:${issue.CauseMetadata?.StartLine ?? 0}`,
        }));
      }
    }
    return {
      name: "Trivy",
      version,
      status: "passed",
      required: true,
      ruleCount,
      findings,
      summary: `${ruleCount} vulnerability, secret, and misconfiguration result(s) normalized`,
      durationMs: Date.now() - started,
      passedControls: findings.length === 0 ? [{ name: "Trivy filesystem scan", detail: "Trivy reported no filesystem result in the configured scanners." }] : [],
    };
  } catch (error) {
    return failure("Trivy", version, started, error);
  }
}

function fixedVersion(vulnerability: Record<string, unknown>) {
  const affected = Array.isArray(vulnerability.affected) ? vulnerability.affected as Array<Record<string, unknown>> : [];
  for (const item of affected) {
    const ranges = Array.isArray(item.ranges) ? item.ranges as Array<Record<string, unknown>> : [];
    for (const range of ranges) {
      const events = Array.isArray(range.events) ? range.events as Array<Record<string, unknown>> : [];
      const fixed = events.find((event) => typeof event.fixed === "string")?.fixed;
      if (typeof fixed === "string") return fixed;
    }
  }
  return undefined;
}

function osvSeverity(pkg: Record<string, unknown>, vulnerability: Record<string, unknown>) {
  const groups = Array.isArray(pkg.groups) ? pkg.groups as Array<Record<string, unknown>> : [];
  const score = Math.max(...groups.map((group) => Number(group.max_severity ?? 0)), 0);
  if (score >= 9) return "critical" as const;
  if (score >= 7) return "high" as const;
  if (score >= 4) return "medium" as const;
  const database = vulnerability.database_specific as Record<string, unknown> | undefined;
  return severity(typeof database?.severity === "string" ? database.severity : undefined);
}

export async function scanOsv(
  config: WorkerConfig,
  snapshot: RepositorySnapshot,
  workspace: string,
): Promise<ComponentResult> {
  const started = Date.now();
  const version = "2.3.8";
  const report = path.join(workspace, "osv.json");
  try {
    await runTool({
      command: "osv-scanner",
      args: [
        "scan",
        "source",
        "-r",
        "--allow-no-lockfiles",
        "--format=json",
        `--output=${report}`,
        snapshot.root,
      ],
      cwd: workspace,
      config,
      acceptedExitCodes: [0, 1],
    });
    const parsed = JSON.parse(await readFile(report, "utf8").catch(() => "{}")) as {
      results?: Array<{ source?: { path?: string }; packages?: Array<Record<string, unknown>> }>;
    };
    const findings: NormalizedFinding[] = [];
    let ruleCount = 0;
    for (const result of parsed.results ?? []) {
      for (const packageResult of result.packages ?? []) {
        const packageInfo = (packageResult.package ?? {}) as Record<string, unknown>;
        const name = String(packageInfo.name ?? "unknown package");
        const versionValue = String(packageInfo.version ?? "unknown");
        const scope = await dependencyScope(snapshot, name);
        const vulnerabilities = Array.isArray(packageResult.vulnerabilities)
          ? packageResult.vulnerabilities as Array<Record<string, unknown>>
          : [];
        for (const vulnerability of vulnerabilities) {
          ruleCount += 1;
          const advisory = String(vulnerability.id ?? "OSV advisory");
          const aliases = Array.isArray(vulnerability.aliases) ? vulnerability.aliases.map(String) : [];
          const primary = aliases.find((alias) => /^GHSA-|^CVE-/.test(alias)) ?? advisory;
          const fixed = fixedVersion(vulnerability);
          const references = Array.isArray(vulnerability.references)
            ? (vulnerability.references as Array<Record<string, unknown>>)
                .filter((reference) => typeof reference.url === "string" && /^https:\/\//.test(reference.url))
                .slice(0, 3)
                .map((reference) => ({ label: primary, url: String(reference.url) }))
            : [];
          const sourcePath = evidencePath(snapshot.root, result.source?.path);
          findings.push(createFinding({
            ruleId: `DEPENDENCY-${primary}`,
            title: `${name} ${versionValue} has a known vulnerability`,
            category: "Dependencies",
            severity: osvSeverity(packageResult, vulnerability),
            confidence: "high",
            explanation: `${primary} affects installed ${name} ${versionValue}. Dependency scope: ${scope}.`,
            impact: String(vulnerability.summary ?? vulnerability.details ?? "The advisory documents a security impact.").slice(0, 800),
            evidence: { excerpt: `Package: ${name}; installed: ${versionValue}; fixed: ${fixed ?? "not listed"}; scope: ${scope}`, filePath: sourcePath },
            detectionSource: "OSV-Scanner",
            remediation: fixed ? `Upgrade ${name} to ${fixed} or a later compatible fixed release and update the lockfile.` : `Review ${primary} and replace, constrain, or mitigate ${name}; OSV does not list a fixed version.`,
            desiredBehavior: `the resolved ${name} version is outside the advisory's affected range while supported application behavior remains intact.`,
            verification: "trusted tests pass, the lockfile contains the intended resolution, and OSV-Scanner no longer reports the advisory.",
            references,
            machineResult: { advisory: primary, aliases, package: name, installedVersion: versionValue, fixedVersion: fixed, scope },
            fingerprintAnchor: `${primary}:${name}:${sourcePath ?? "dependency"}`,
          }));
        }
      }
    }
    return {
      name: "OSV",
      version,
      status: "passed",
      required: true,
      ruleCount,
      findings,
      summary: `${ruleCount} known dependency advisory result(s) normalized`,
      durationMs: Date.now() - started,
      passedControls: findings.length === 0 ? [{ name: "OSV dependency check", detail: "OSV-Scanner reported no known dependency advisory." }] : [],
    };
  } catch (error) {
    return failure("OSV", version, started, error);
  }
}
