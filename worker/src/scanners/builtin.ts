import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { branchProtection } from "../github.js";
import { createFinding, lineForOffset, safeLine } from "../findings.js";
import type {
  ComponentResult,
  NormalizedFinding,
  RepositorySnapshot,
  RepositoryTarget,
} from "../types.js";

const textExtensions = new Set([
  ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".py", ".go", ".rb", ".php", ".rs",
  ".sql", ".json", ".yaml", ".yml", ".toml", ".ini", ".env", ".md", ".txt", ".sh",
]);

const lockfiles = new Set([
  "package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml", "bun.lock", "bun.lockb",
  "poetry.lock", "pdm.lock", "pipfile.lock", "uv.lock", "go.sum", "gemfile.lock", "composer.lock", "cargo.lock",
]);

async function readText(file: { absolutePath: string; size: number }) {
  if (file.size === 0 || file.size > 2_000_000) return "";
  const buffer = await readFile(file.absolutePath);
  if (buffer.subarray(0, Math.min(buffer.length, 4096)).includes(0)) return "";
  return buffer.toString("utf8");
}

function byPath(snapshot: RepositorySnapshot) {
  return new Map(snapshot.files.map((file) => [file.relativePath.toLowerCase(), file]));
}

function fileName(relativePath: string) {
  return relativePath.split("/").at(-1)?.toLowerCase() ?? relativePath.toLowerCase();
}

function repoFinding(input: Omit<Parameters<typeof createFinding>[0], "detectionSource">) {
  return createFinding({
    ...input,
    detectionSource: "RepoSec deterministic rule",
  });
}

export async function scanRepositoryPosture({
  snapshot,
  target,
  githubToken,
}: {
  snapshot: RepositorySnapshot;
  target: RepositoryTarget;
  githubToken?: string;
}): Promise<ComponentResult> {
  const started = Date.now();
  const findings: NormalizedFinding[] = [];
  const passedControls: Array<{ name: string; detail: string }> = [];
  const paths = byPath(snapshot);
  let ruleCount = 0;

  ruleCount += 1;
  const securityFile = paths.get("security.md") ?? paths.get(".github/security.md") ?? paths.get("docs/security.md");
  if (!securityFile) {
    findings.push(repoFinding({
      ruleId: "REPOSEC-POSTURE-001",
      title: "Security reporting policy is missing",
      category: "Repository posture",
      severity: "low",
      confidence: "high",
      explanation: "The repository does not contain a SECURITY.md file in a conventional location.",
      impact: "Customers and researchers may not know how to report a suspected vulnerability privately or what response to expect.",
      evidence: { excerpt: "SECURITY.md: [not found]" },
      remediation: "Add a concise SECURITY.md with a private reporting contact, supported-version guidance, response expectations, and a request not to disclose raw customer data.",
      desiredBehavior: "the repository provides a clear private vulnerability-reporting path and supported-version policy.",
      verification: "SECURITY.md exists in a conventional location and names a monitored private contact plus response and disclosure expectations.",
      references: [{ label: "GitHub security policy documentation", url: "https://docs.github.com/code-security/getting-started/adding-a-security-policy-to-your-repository" }],
    }));
  } else {
    const content = await readText(securityFile);
    if (content.length < 180 || !/(report|contact|email|security@)/i.test(content) || !/(supported|version|response|disclos)/i.test(content)) {
      findings.push(repoFinding({
        ruleId: "REPOSEC-POSTURE-002",
        title: "Security reporting policy needs more detail",
        category: "Repository posture",
        severity: "low",
        confidence: "medium",
        explanation: "SECURITY.md exists but does not clearly cover a private contact, supported versions, and response or disclosure expectations.",
        impact: "An incomplete policy can delay responsible reports or encourage public disclosure before the owner can respond.",
        evidence: { excerpt: "SECURITY.md is present but required policy sections were not all detected.", filePath: securityFile.relativePath },
        remediation: "Expand the policy with a monitored private address, supported-version scope, acknowledgement targets, and coordinated-disclosure expectations.",
        desiredBehavior: "the policy answers where to report, what versions are supported, and what reporters should expect next.",
        verification: "a manual read confirms the policy contains all three topics and the reporting address is monitored.",
        heuristic: true,
      }));
    } else {
      passedControls.push({ name: "Security policy", detail: "SECURITY.md includes reporting and response guidance." });
    }
  }

  ruleCount += 1;
  if (!snapshot.files.some((file) => /^(?:license|licence)(?:\.[a-z0-9]+)?$/i.test(file.relativePath))) {
    findings.push(repoFinding({
      ruleId: "REPOSEC-POSTURE-003",
      title: "Repository license file is missing",
      category: "Repository posture",
      severity: "info",
      confidence: "high",
      explanation: "No conventional LICENSE or LICENCE file was found at the repository root.",
      impact: "Missing license terms can create uncertainty during a client handoff and for third-party use.",
      evidence: { excerpt: "LICENSE: [not found]" },
      remediation: "Add the license approved for this project and confirm that dependency and client commitments are compatible.",
      desiredBehavior: "the repository has explicit, reviewed license terms at its root.",
      verification: "a root license file exists and matches the intended legal terms.",
    }));
  } else {
    passedControls.push({ name: "License file", detail: "A conventional repository license file is present." });
  }

  ruleCount += 1;
  if (!snapshot.files.some((file) => lockfiles.has(fileName(file.relativePath)))) {
    findings.push(repoFinding({
      ruleId: "REPOSEC-DEPENDENCY-001",
      title: "Dependency lockfile is missing",
      category: "Dependencies",
      severity: "medium",
      confidence: "high",
      explanation: "A supported dependency manifest appears to be present, but no common lockfile was found.",
      impact: "Deployments can resolve different transitive versions, making vulnerability results and production builds less reproducible.",
      evidence: { excerpt: "Supported lockfile: [not found]" },
      remediation: "Generate and commit the package manager's stable lockfile without running untrusted scripts in the RepoSec worker.",
      desiredBehavior: "dependency resolution is reproducible from a committed lockfile appropriate to the stack.",
      verification: "the lockfile is committed and a clean trusted build resolves the expected versions.",
    }));
  } else {
    passedControls.push({ name: "Dependency lock", detail: "At least one supported lockfile is committed." });
  }

  ruleCount += 1;
  if (
    !paths.has(".github/dependabot.yml")
    && !paths.has(".github/dependabot.yaml")
    && !snapshot.files.some((file) => /(^|\/)renovate(?:\.json|\.json5|\.config\.[cm]?js)$/.test(file.relativePath.toLowerCase()))
  ) {
    findings.push(repoFinding({
      ruleId: "REPOSEC-DEPENDENCY-002",
      title: "Automated dependency update configuration is missing",
      category: "Dependencies",
      severity: "low",
      confidence: "high",
      explanation: "No Dependabot or Renovate configuration was found.",
      impact: "Known vulnerable dependencies can remain unnoticed after launch when no update workflow is configured.",
      evidence: { excerpt: "Dependabot/Renovate configuration: [not found]" },
      remediation: "Configure Dependabot or Renovate with a manageable cadence, grouped low-risk updates, and review requirements.",
      desiredBehavior: "the default branch receives reviewable dependency update proposals on a defined cadence.",
      verification: "the update service validates its configuration and can open a test update without bypassing reviews.",
    }));
  } else {
    passedControls.push({ name: "Dependency updates", detail: "Dependabot or Renovate configuration is present." });
  }

  ruleCount += 1;
  const workflows = snapshot.files.filter((file) => /^\.github\/workflows\/.*\.ya?ml$/i.test(file.relativePath));
  let codeQl = false;
  for (const workflow of workflows) {
    const content = await readText(workflow);
    if (/github\/codeql-action\/(?:init|analyze)@/i.test(content)) codeQl = true;
  }
  if (!codeQl) {
    findings.push(repoFinding({
      ruleId: "REPOSEC-POSTURE-004",
      title: "No CodeQL or equivalent SAST workflow was detected",
      category: "Repository posture",
      severity: "low",
      confidence: "medium",
      explanation: "GitHub workflow files do not contain a recognizable CodeQL analysis job. Another SAST system may exist outside the repository.",
      impact: "New code may reach the default branch without recurring static security analysis.",
      evidence: { excerpt: "github/codeql-action init + analyze: [not observed]" },
      remediation: "Add CodeQL for supported languages or document the equivalent required SAST check enforced elsewhere.",
      desiredBehavior: "security static analysis runs on pull requests and the default branch with visible required results.",
      verification: "a test pull request produces a successful SAST check and branch rules require the intended status.",
      heuristic: true,
    }));
  } else {
    passedControls.push({ name: "Repository SAST", detail: "A CodeQL workflow was detected." });
  }

  ruleCount += 1;
  const riskyEnvFiles = snapshot.files.filter((file) => {
    const base = fileName(file.relativePath);
    return /^\.env(?:\..+)?$/.test(base) && !/(?:example|sample|template|dist)$/.test(base);
  });
  for (const envFile of riskyEnvFiles) {
    const content = await readText(envFile);
    const assignments = content.split(/\r?\n/).filter((line: string) => /^[A-Za-z_][A-Za-z0-9_]*\s*=\s*.+/.test(line) && !/=\s*(?:["']?change|replace|example|your_|xxx|\{\{)/i.test(line));
    if (assignments.length > 0) {
      findings.push(repoFinding({
        ruleId: "REPOSEC-SECRETS-ENV-001",
        title: "Risky environment file is committed",
        category: "Secrets and configuration",
        severity: "high",
        confidence: "high",
        explanation: "A non-template .env file contains populated assignments. Values are deliberately not retained or displayed.",
        impact: "Committed environment files commonly expose credentials or production-only configuration through repository history and forks.",
        evidence: {
          excerpt: `[REDACTED ${assignments.length} populated environment assignment(s)]`,
          filePath: envFile.relativePath,
          secretFingerprint: "values-not-retained",
        },
        remediation: "Remove the file from the current tree and relevant history, rotate every real credential it contained, add an ignored example file with placeholders, and review deployment secret storage.",
        desiredBehavior: "only placeholder environment templates are committed and real values are supplied by protected deployment configuration.",
        verification: "the real file and history copies are removed, affected credentials are rotated, ignore rules are present, and a rescan finds no populated environment file.",
        fingerprintAnchor: envFile.relativePath.toLowerCase(),
      }));
    }
  }
  if (riskyEnvFiles.length === 0) passedControls.push({ name: "Environment files", detail: "No populated committed .env file was detected." });

  ruleCount += 2;
  if (target.archived) {
    findings.push(repoFinding({
      ruleId: "REPOSEC-POSTURE-005",
      title: "Repository is archived",
      category: "Repository posture",
      severity: "medium",
      confidence: "high",
      explanation: "GitHub marks this repository as archived and read-only.",
      impact: "An archived repository is unlikely to receive dependency, platform, or security maintenance after launch.",
      evidence: { excerpt: `GitHub repository archived: true` },
      remediation: "Confirm that the correct active repository was selected or restore maintained status and assign an owner before launch.",
      desiredBehavior: "the launched product points to an actively maintained source repository with a responsible owner.",
      verification: "GitHub metadata shows the repository is active and the maintenance owner confirms an update process.",
    }));
  } else {
    passedControls.push({ name: "Repository status", detail: "GitHub does not mark the repository as archived." });
  }

  if (target.pushedAt && Date.now() - new Date(target.pushedAt).getTime() > 365 * 86_400_000) {
    findings.push(repoFinding({
      ruleId: "REPOSEC-POSTURE-006",
      title: "Repository may be unmaintained",
      category: "Repository posture",
      severity: "low",
      confidence: "medium",
      explanation: "The default repository has not received a GitHub push in more than one year.",
      impact: "Old dependencies, expired integrations, and platform changes may not have been reviewed recently.",
      evidence: { excerpt: `Last GitHub push: ${target.pushedAt}` },
      remediation: "Confirm the repository is current, run an intentional maintenance review, and document the responsible owner and update cadence.",
      desiredBehavior: "the team has recently validated the exact repository and owns an ongoing maintenance process.",
      verification: "the owner documents the review and the repository metadata reflects current maintained work.",
      heuristic: true,
    }));
  }

  ruleCount += 1;
  const protection = await branchProtection(target.owner, target.name, snapshot.defaultBranch, githubToken);
  if (!protection.available) {
    findings.push(repoFinding({
      ruleId: "REPOSEC-GITHUB-001",
      title: "Needs review: branch protection could not be verified",
      category: "Repository posture",
      severity: "medium",
      confidence: "low",
      explanation: "The GitHub API did not expose branch-protection settings with the current repository access or plan.",
      impact: "RepoSec cannot confirm that direct pushes, missing reviews, or failing checks are prevented on the default branch.",
      evidence: { excerpt: `Branch protection API: ${protection.reason}` },
      remediation: "Inspect the default branch rules in GitHub and require pull requests, relevant status checks, and at least one approval for production changes.",
      desiredBehavior: "the default branch rejects direct unreviewed changes and requires the intended checks and approvals.",
      verification: "GitHub branch rules are visible to an authorized reviewer and a test pull request demonstrates enforcement.",
      heuristic: true,
    }));
  } else {
    const reviews = protection.protection.required_pull_request_reviews?.required_approving_review_count ?? 0;
    const checks = protection.protection.required_status_checks?.contexts?.length ?? 0;
    if (reviews < 1 || checks < 1) {
      findings.push(repoFinding({
        ruleId: "REPOSEC-GITHUB-002",
        title: "Default branch rules do not require both review and status checks",
        category: "Repository posture",
        severity: "medium",
        confidence: "high",
        explanation: "GitHub exposed the default-branch protection record, but required approvals or required status checks were not both detected.",
        impact: "A production change may merge without independent review or without passing the intended automated checks.",
        evidence: { excerpt: `Required approvals: ${reviews}; required status checks: ${checks}` },
        remediation: "Require at least one approving review and the appropriate build and security status checks on the default branch.",
        desiredBehavior: "default-branch changes merge only through reviewed pull requests with required checks passing.",
        verification: "a test pull request cannot merge without approval and the configured status checks.",
      }));
    } else {
      passedControls.push({ name: "Default branch rules", detail: `${reviews} approval(s) and ${checks} status check(s) are required.` });
    }
  }

  return {
    name: "Repository posture",
    version: "reposec-rules-2026.07",
    status: "passed",
    required: true,
    ruleCount,
    findings,
    summary: `${ruleCount} repository posture controls evaluated`,
    durationMs: Date.now() - started,
    passedControls,
  };
}

function triggerNames(on: unknown): string[] {
  if (typeof on === "string") return [on];
  if (Array.isArray(on)) return on.filter((item): item is string => typeof item === "string");
  if (on && typeof on === "object") return Object.keys(on);
  return [];
}

function visit(value: unknown, callback: (key: string, item: unknown, parent: Record<string, unknown>) => void) {
  if (Array.isArray(value)) {
    for (const item of value) visit(item, callback);
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  for (const [key, item] of Object.entries(record)) {
    callback(key, item, record);
    visit(item, callback);
  }
}

export async function scanGitHubActions(snapshot: RepositorySnapshot): Promise<ComponentResult> {
  const started = Date.now();
  const findings: NormalizedFinding[] = [];
  const passedControls: Array<{ name: string; detail: string }> = [];
  const workflows = snapshot.files.filter((file) => /^\.github\/workflows\/.*\.ya?ml$/i.test(file.relativePath));
  let ruleCount = 0;

  for (const workflow of workflows) {
    const content = await readText(workflow);
    let parsed: Record<string, unknown>;
    try {
      parsed = YAML.parse(content) as Record<string, unknown>;
    } catch {
      findings.push(repoFinding({
        ruleId: "REPOSEC-ACTIONS-000",
        title: "Needs review: workflow YAML could not be parsed",
        category: "GitHub Actions",
        severity: "medium",
        confidence: "low",
        explanation: "The workflow file could not be parsed as YAML, so its security posture was not fully evaluated.",
        impact: "Malformed or unusual YAML can hide unsafe triggers, permissions, or command interpolation from automated review.",
        evidence: { excerpt: "YAML parser failed; content not retained.", filePath: workflow.relativePath },
        remediation: "Validate the workflow with GitHub and a YAML parser, correct syntax or unsupported constructs, and rerun the scan.",
        desiredBehavior: "the workflow is valid YAML whose triggers, permissions, and steps can be reviewed deterministically.",
        verification: "GitHub accepts the workflow, a local YAML parser succeeds, and the RepoSec component completes.",
        heuristic: true,
      }));
      continue;
    }
    ruleCount += 7;
    const permissions = parsed.permissions;
    if (permissions === undefined) {
      findings.push(repoFinding({
        ruleId: "REPOSEC-ACTIONS-001",
        title: "GitHub Actions workflow has no explicit permissions block",
        category: "GitHub Actions",
        severity: "medium",
        confidence: "high",
        explanation: "The workflow relies on repository or organization defaults for GITHUB_TOKEN permissions.",
        impact: "A future default change or broad repository setting can give jobs more access than intended.",
        evidence: { excerpt: "Top-level permissions: [not set]", filePath: workflow.relativePath },
        remediation: "Add a top-level `permissions: contents: read` baseline and grant narrower job-level permissions only where required.",
        desiredBehavior: "every workflow has an explicit least-privilege permission baseline and narrowly scoped write permissions.",
        verification: "the workflow validates and each job succeeds with only its documented permissions.",
      }));
    }
    if (permissions === "write-all" || (permissions && typeof permissions === "object" && Object.values(permissions).filter((value) => value === "write").length >= 3)) {
      findings.push(repoFinding({
        ruleId: "REPOSEC-ACTIONS-002",
        title: "GitHub Actions token permissions are overly broad",
        category: "GitHub Actions",
        severity: "high",
        confidence: "high",
        explanation: "The workflow grants write-all or several write permissions to its GITHUB_TOKEN.",
        impact: "A compromised action or command injection could modify repository contents, releases, packages, or workflow state.",
        evidence: { excerpt: "Broad write permissions detected; permission object values retained only as labels.", filePath: workflow.relativePath },
        remediation: "Replace broad access with `contents: read` and add the smallest job-level write permission only to the trusted publish step.",
        desiredBehavior: "ordinary analysis and build jobs have read-only tokens and write access exists only in an isolated trusted release job.",
        verification: "the workflow completes with narrowed permissions and a non-release job cannot write repository resources.",
      }));
    }

    const triggers = triggerNames(parsed.on ?? parsed.true);
    const pullRequestTarget = triggers.includes("pull_request_target");
    if (pullRequestTarget) {
      findings.push(repoFinding({
        ruleId: "REPOSEC-ACTIONS-003",
        title: "Dangerous pull_request_target workflow needs review",
        category: "GitHub Actions",
        severity: "high",
        confidence: "high",
        explanation: "The workflow runs on `pull_request_target`, which executes in the base-repository context and can access privileged tokens or secrets.",
        impact: "If the workflow checks out or executes attacker-controlled pull-request content, a fork author can reach repository credentials.",
        evidence: { excerpt: "Trigger: pull_request_target", filePath: workflow.relativePath },
        remediation: "Prefer `pull_request` for untrusted code. If `pull_request_target` is essential, never check out the pull request head or run its scripts and isolate any privileged follow-up.",
        desiredBehavior: "untrusted pull-request content never runs in a context that has base-repository secrets or write permissions.",
        verification: "a fork pull request cannot cause its branch content or inputs to execute in a privileged job.",
      }));
    }

    visit(parsed, (key, item) => {
      if (key === "uses" && typeof item === "string" && !item.startsWith("./") && !item.startsWith("docker://")) {
        const [action, ref] = item.split("@");
        const owner = action?.split("/")[0]?.toLowerCase();
        if (owner && owner !== "actions" && (!ref || !/^[0-9a-f]{40}$/i.test(ref))) {
          findings.push(repoFinding({
            ruleId: "REPOSEC-ACTIONS-004",
            title: "Third-party GitHub Action is not pinned to a full commit SHA",
            category: "GitHub Actions",
            severity: "medium",
            confidence: "high",
            explanation: `The workflow references ${action ?? "a third-party action"} with a movable tag or branch instead of a 40-character commit SHA.`,
            impact: "A compromised or retagged upstream action can change code executed with the workflow token.",
            evidence: { excerpt: `uses: ${item}`, filePath: workflow.relativePath },
            remediation: "Resolve the reviewed action release to its immutable full commit SHA, pin it, and keep the human-readable release in a comment for update tooling.",
            desiredBehavior: "every third-party action runs from a reviewed immutable full commit SHA.",
            verification: "all external non-GitHub action references end in a 40-character SHA and update automation reports new releases for review.",
            fingerprintAnchor: `${workflow.relativePath}:${action}`,
          }));
        }
      }
      if (key === "run" && typeof item === "string" && /\$\{\{\s*(?:github\.event\.pull_request\.(?:title|body|head\.ref)|github\.head_ref|inputs\.)/i.test(item)) {
        const line = content.includes(item) ? lineForOffset(content, content.indexOf(item)) : undefined;
        findings.push(repoFinding({
          ruleId: "REPOSEC-ACTIONS-005",
          title: "Untrusted GitHub expression is interpolated into a shell command",
          category: "GitHub Actions",
          severity: "high",
          confidence: "high",
          explanation: "A pull-request or workflow input expression is inserted directly into a `run` script.",
          impact: "An attacker-controlled title, branch, body, or input may break shell quoting and execute commands with the job's token.",
          evidence: { excerpt: line ? safeLine(content, line) : "Untrusted expression in run block", filePath: workflow.relativePath, line },
          remediation: "Pass the expression through an environment variable and quote it as data, or avoid the shell by using a purpose-built action.",
          desiredBehavior: "untrusted GitHub context values are treated only as data and never become shell syntax.",
          verification: "test inputs containing quotes and shell metacharacters remain inert and the workflow still performs its intended task.",
          fingerprintAnchor: `${workflow.relativePath}:${line ?? item.slice(0, 80)}`,
        }));
      }
    });

    if (pullRequestTarget && /actions\/checkout@[\s\S]{0,500}(?:ref:\s*\$\{\{\s*github\.event\.pull_request\.head|repository:\s*\$\{\{)/i.test(content)) {
      findings.push(repoFinding({
        ruleId: "REPOSEC-ACTIONS-006",
        title: "Privileged workflow checks out untrusted pull-request code",
        category: "GitHub Actions",
        severity: "critical",
        confidence: "high",
        explanation: "A `pull_request_target` workflow appears to check out the pull request's head repository or ref.",
        impact: "Fork-controlled code can execute with base-repository secrets or write-capable GITHUB_TOKEN permissions.",
        evidence: { excerpt: "pull_request_target + pull request head checkout detected", filePath: workflow.relativePath },
        remediation: "Remove untrusted checkout from the privileged workflow. Split analysis into an unprivileged `pull_request` job and use a separate trusted event for any write action.",
        desiredBehavior: "no fork-controlled file executes in a job with secrets or base-repository write authority.",
        verification: "a fork pull request runs only read-only unprivileged jobs and cannot access secrets or modify repository resources.",
      }));
    }

    if ((triggers.includes("pull_request") || pullRequestTarget) && /secrets\.[A-Za-z0-9_]+/i.test(content)) {
      findings.push(repoFinding({
        ruleId: "REPOSEC-ACTIONS-007",
        title: "Needs review: pull-request workflow references secrets",
        category: "GitHub Actions",
        severity: pullRequestTarget ? "high" : "medium",
        confidence: pullRequestTarget ? "high" : "low",
        explanation: "A pull-request-triggered workflow references repository secrets. GitHub normally withholds secrets from forks on `pull_request`, but event and checkout details determine the actual risk.",
        impact: "A privileged event or unsafe checkout can expose a secret to attacker-controlled code.",
        evidence: { excerpt: "Secret reference detected; secret name and value are not retained.", filePath: workflow.relativePath },
        remediation: "Separate fork-safe checks from trusted secret-using jobs, require an explicit trusted event, and confirm no untrusted code runs after secrets enter the environment.",
        desiredBehavior: "fork-originated code has no path to jobs that receive repository or environment secrets.",
        verification: "a fork test confirms secrets are absent and privileged jobs run only after a trusted approval or protected event.",
        heuristic: !pullRequestTarget,
      }));
    }
  }

  if (workflows.length === 0) {
    passedControls.push({ name: "GitHub Actions exposure", detail: "No repository workflow files were present." });
  } else if (findings.length === 0) {
    passedControls.push({ name: "GitHub Actions posture", detail: `${workflows.length} workflow file(s) passed RepoSec workflow checks.` });
  }

  return {
    name: "GitHub Actions",
    version: "reposec-actions-2026.07",
    status: "passed",
    required: true,
    ruleCount,
    findings,
    summary: `${workflows.length} workflow file(s) evaluated`,
    durationMs: Date.now() - started,
    passedControls,
  };
}

interface PatternRule {
  id: string;
  title: string;
  category: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  confidence: "high" | "medium" | "low";
  regex: RegExp;
  path?: RegExp;
  absent?: RegExp;
  explanation: string;
  impact: string;
  remediation: string;
  desired: string;
  verification: string;
  heuristic?: boolean;
  redactWholeLine?: boolean;
}

const staticRules: PatternRule[] = [
  {
    id: "REPOSEC-SUPABASE-001",
    title: "Privileged Supabase key may be exposed to browser code",
    category: "Secrets and authorization",
    severity: "critical",
    confidence: "high",
    regex: /(?:NEXT_PUBLIC_|VITE_|PUBLIC_)[A-Z0-9_]*(?:SERVICE_ROLE|SUPABASE_SERVICE)[A-Z0-9_]*|service[_-]?role(?:[_-]?key)?\s*[:=]\s*["'][^"']{16,}/i,
    path: /\.(?:js|jsx|mjs|ts|tsx)$/i,
    explanation: "A browser-oriented configuration name or source assignment appears to expose a Supabase service-role credential.",
    impact: "Service-role credentials bypass Row Level Security and can allow elevated database access until rotated.",
    remediation: "Remove the credential from client code and history, rotate it, use the public publishable key in browsers, and move privileged work into authorized server-only routes.",
    desired: "only a publishable Supabase key reaches browser code and privileged operations enforce signed-in organization membership on the server.",
    verification: "the old credential fingerprint is absent from source and production bundles, the credential is rotated, and privileged routes reject unauthorized users.",
    redactWholeLine: true,
  },
  {
    id: "REPOSEC-CORS-001",
    title: "Wildcard CORS may allow credentialed cross-origin requests",
    category: "Authorization and browser security",
    severity: "high",
    confidence: "medium",
    regex: /(?:Access-Control-Allow-Origin["']?\s*[:,]\s*["']\*["'][\s\S]{0,800}Access-Control-Allow-Credentials["']?\s*[:,]\s*["']?true|origin\s*:\s*["']\*["'][\s\S]{0,300}credentials\s*:\s*true)/i,
    explanation: "Wildcard origin configuration appears near credentialed CORS configuration.",
    impact: "A permissive or reflected implementation can let an untrusted site issue authenticated browser requests or read responses.",
    remediation: "Use an explicit allowlist, reject unknown origins, vary caches by Origin, and never combine wildcard origins with credentials.",
    desired: "credentialed cross-origin requests are accepted only from a small validated allowlist.",
    verification: "allowed origins work, an unlisted origin receives no permissive CORS headers, and credentialed preflights are correct.",
  },
  {
    id: "REPOSEC-AUTH-CLIENT-001",
    title: "Needs review: admin access may rely on a client-controlled value",
    category: "Authorization",
    severity: "high",
    confidence: "low",
    regex: /(?:req(?:uest)?\.(?:body|query)|body|params|searchParams|localStorage|sessionStorage)[\s\S]{0,120}(?:isAdmin|role\s*===?\s*["']admin|admin\s*===?\s*true)/i,
    explanation: "A request, URL, or browser-storage value appears near an admin or role decision. Static evidence cannot confirm whether a trusted server-side check also exists.",
    impact: "If the client-provided value is authoritative, a user can claim an elevated role.",
    remediation: "Resolve roles from the authenticated server session and organization membership record, then enforce them on every privileged query and mutation.",
    desired: "admin authorization derives only from server-validated identity and stored membership, never a client assertion.",
    verification: "changing request fields, query parameters, or browser storage cannot elevate access and authorization tests cover non-admin users.",
    heuristic: true,
  },
  {
    id: "REPOSEC-DEBUG-001",
    title: "Development or debug behavior appears enabled",
    category: "Production configuration",
    severity: "medium",
    confidence: "medium",
    regex: /(?:debug\s*[:=]\s*true|NODE_ENV\s*!==?\s*["']production["'][\s\S]{0,100}(?:stack|error)|enableDebug\s*\(\s*true\s*\))/i,
    explanation: "Source configuration appears to enable debug behavior or verbose production error details.",
    impact: "Debug routes and stack traces can disclose implementation details, paths, queries, or sensitive context.",
    remediation: "Gate diagnostics behind server-only development configuration and return bounded generic errors in production.",
    desired: "production builds disable debug endpoints and never return stack traces or internal exception details to clients.",
    verification: "production requests receive generic errors, debug routes are unavailable, and server observability still captures redacted diagnostics.",
    heuristic: true,
  },
  {
    id: "REPOSEC-STRIPE-001",
    title: "Stripe webhook may not verify its signature",
    category: "Payments",
    severity: "high",
    confidence: "high",
    regex: /(?:stripe|checkout)[\s\S]{0,600}(?:webhook|event)[\s\S]{0,1000}(?:request|req)\.json\s*\(/i,
    absent: /constructEvent(?:Async)?\s*\(|stripe-signature|webhooks\.constructEvent/i,
    explanation: "A Stripe-related webhook handler parses JSON, but signature verification of the raw request body was not detected in the same file.",
    impact: "A forged webhook could grant paid access, alter subscription state, or trigger duplicate side effects.",
    remediation: "Verify the raw body with Stripe's official helper and webhook secret before reading fields, and process event IDs idempotently.",
    desired: "only correctly signed Stripe events can change billing or entitlements and replayed IDs have no repeated effect.",
    verification: "a valid Stripe CLI event succeeds once while invalid-signature and replayed requests cannot grant access.",
  },
  {
    id: "REPOSEC-CLIENT-TRUST-001",
    title: "Needs review: server may trust a client-submitted price or user ID",
    category: "Authorization and payments",
    severity: "high",
    confidence: "low",
    regex: /(?:body|request|req)\.(?:price|priceId|amount|unitAmount|userId|ownerId)\b|(?:body|payload)\[["'](?:price|amount|userId)["']\]/i,
    path: /(?:api|route|server|action)/i,
    explanation: "A server-oriented file reads a price, amount, owner, or user identifier from client input. Static analysis cannot determine whether it is revalidated.",
    impact: "Trusting that value can let a caller underpay, buy a different product, or act on another user's records.",
    remediation: "Resolve prices from server-owned product identifiers and user IDs from the authenticated session; validate ownership on every referenced object.",
    desired: "billing amounts come from server configuration and resource ownership comes from authenticated membership.",
    verification: "tampered client values are ignored or rejected and integration tests show cross-user access and price substitution fail.",
    heuristic: true,
  },
  {
    id: "REPOSEC-SOURCEMAP-001",
    title: "Production source maps appear publicly enabled",
    category: "Production configuration",
    severity: "medium",
    confidence: "high",
    regex: /productionBrowserSourceMaps\s*:\s*true|sourcemap\s*:\s*true|devtool\s*:\s*["'](?:source-map|inline-source-map)["']/i,
    path: /(?:next\.config|vite\.config|webpack|rollup)/i,
    explanation: "Build configuration explicitly enables browser source maps in production.",
    impact: "Public source maps can reveal original source, comments, internal paths, and implementation details not present in minified bundles.",
    remediation: "Disable public production source maps or upload them privately to error reporting and delete public artifacts after upload.",
    desired: "production error symbolication works without serving source maps to unauthenticated visitors.",
    verification: "deployed JavaScript has no publicly retrievable `.map` reference while error reporting still symbolicates authorized events.",
  },
];

export async function scanStaticPatterns(snapshot: RepositorySnapshot): Promise<ComponentResult> {
  const started = Date.now();
  const findings: NormalizedFinding[] = [];
  let ruleCount = staticRules.length + 3;
  const codeFiles = snapshot.files.filter((file) => textExtensions.has(path.extname(file.relativePath).toLowerCase()) || fileName(file.relativePath).startsWith(".env"));

  for (const file of codeFiles) {
    const content = await readText(file);
    if (!content) continue;
    for (const rule of staticRules) {
      if (rule.path && !rule.path.test(file.relativePath)) continue;
      rule.regex.lastIndex = 0;
      const match = rule.regex.exec(content);
      if (!match || (rule.absent && rule.absent.test(content))) continue;
      const line = lineForOffset(content, match.index);
      findings.push(repoFinding({
        ruleId: rule.id,
        title: rule.title,
        category: rule.category,
        severity: rule.severity,
        confidence: rule.confidence,
        explanation: rule.explanation,
        impact: rule.impact,
        evidence: {
          excerpt: rule.redactWholeLine ? "[REDACTED privileged credential pattern]" : safeLine(content, line),
          filePath: file.relativePath,
          line,
        },
        remediation: rule.remediation,
        desiredBehavior: rule.desired,
        verification: rule.verification,
        heuristic: rule.heuristic,
        fingerprintAnchor: `${rule.id}:${file.relativePath}:${line}`,
      }));
    }

    if (/\/(?:api|routes?)\//i.test(file.relativePath) && /export\s+(?:async\s+)?function\s+(?:POST|PUT|PATCH|DELETE)|router\.(?:post|put|patch|delete)/.test(content)) {
      const authSignal = /(?:getUser|getSession|getClaims|requireUser|currentUser|auth\(|authorization|verifyToken|verifySignature|constructEvent)/i.test(content);
      if (!authSignal && !/(?:public|health|contact)/i.test(file.relativePath)) {
        findings.push(repoFinding({
          ruleId: "REPOSEC-AUTH-ROUTE-001",
          title: "Needs review: mutating API route has no obvious authorization check",
          category: "Authorization",
          severity: "medium",
          confidence: "low",
          explanation: "A mutating API handler was detected without a recognizable identity, membership, token, or signature check in the same file.",
          impact: "If authorization is not enforced in imported middleware or the database, an unauthenticated caller may change protected data.",
          evidence: { excerpt: "Mutating handler detected; no local authorization signal found.", filePath: file.relativePath },
          remediation: "Trace imported middleware and data policies, then add an explicit server-side identity and resource-membership check if no equivalent boundary exists.",
          desiredBehavior: "every mutating route rejects unauthenticated and cross-organization callers before protected data changes.",
          verification: "authorization tests cover signed-out, wrong-organization, viewer, and authorized-member cases.",
          heuristic: true,
          fingerprintAnchor: file.relativePath,
        }));
      }
    }
  }

  const sqlFiles = snapshot.files.filter((file) => file.relativePath.toLowerCase().endsWith(".sql"));
  for (const file of sqlFiles) {
    const content = await readText(file);
    const createRegex = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:(?:public|auth)\.)?["']?([a-zA-Z_][\w]*)["']?/gi;
    for (const match of content.matchAll(createRegex)) {
      const table = match[1]!;
      if (/^(?:schema_migrations|_prisma_migrations)$/i.test(table)) continue;
      const rls = new RegExp(`alter\\s+table\\s+(?:(?:public)\\.)?["']?${table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']?\\s+enable\\s+row\\s+level\\s+security`, "i");
      if (!rls.test(content)) {
        findings.push(repoFinding({
          ruleId: "REPOSEC-SUPABASE-RLS-001",
          title: "Needs review: database table is created without enabling Row Level Security",
          category: "Database authorization",
          severity: "high",
          confidence: "medium",
          explanation: `The migration creates table \`${table}\`, but no matching RLS enable statement was found in the same file.`,
          impact: "A table exposed through Supabase's API can be accessible outside the intended tenant boundary when RLS is not enabled and safely policy-controlled.",
          evidence: { excerpt: `CREATE TABLE ${table} …; RLS enable statement: [not observed]`, filePath: file.relativePath, line: lineForOffset(content, match.index ?? 0) },
          remediation: "Enable RLS in the migration, add least-privilege policies for organization membership, and test through anon and authenticated Supabase clients.",
          desiredBehavior: `table \`${table}\` has RLS enabled with explicit tenant-scoped policies before application access.`,
          verification: "anonymous and cross-organization test users cannot select or mutate rows while authorized users retain intended access.",
          heuristic: true,
          fingerprintAnchor: `${file.relativePath}:${table.toLowerCase()}`,
        }));
      }
    }
  }

  const debugEndpoints = snapshot.files.filter((file) => /(?:^|\/)(?:debug|dev|test|diagnostics?)(?:\/|\.|$)/i.test(file.relativePath) && /(?:route|api|pages)/i.test(file.relativePath));
  for (const file of debugEndpoints) {
    findings.push(repoFinding({
      ruleId: "REPOSEC-DEBUG-ENDPOINT-001",
      title: "Needs review: development or debug endpoint is present",
      category: "Production configuration",
      severity: "medium",
      confidence: "low",
      explanation: "A route-like file path contains a debug, dev, test, or diagnostics segment. Static evidence does not show whether production deployment excludes it.",
      impact: "A production debug endpoint may disclose internal state or enable actions that bypass normal product controls.",
      evidence: { excerpt: "Route-like debug path detected.", filePath: file.relativePath },
      remediation: "Remove the endpoint from production builds or enforce a server-side environment and administrator check with generic error handling.",
      desiredBehavior: "production deployments expose no unauthenticated debug or development routes.",
      verification: "the production route returns 404 or requires verified platform-admin authorization and emits only redacted output.",
      heuristic: true,
      fingerprintAnchor: file.relativePath,
    }));
  }

  return {
    name: "RepoSec static rules",
    version: "reposec-static-2026.07",
    status: "passed",
    required: true,
    ruleCount,
    findings,
    summary: `${codeFiles.length + sqlFiles.length} text source file(s) evaluated by RepoSec rules`,
    durationMs: Date.now() - started,
    passedControls: findings.length === 0 ? [{ name: "AI-built application patterns", detail: "No RepoSec static pattern finding was observed." }] : [],
  };
}
