import { createHash } from "node:crypto";
import path from "node:path";
import type { Confidence, NormalizedFinding, Severity } from "./types.js";

const secretPatterns = [
  /\bsk_(?:live|test)_[A-Za-z0-9]{12,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9_]{16,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{16,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]{10,})?\b/g,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
];

export function hash(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

export function redact(value: string, maxLength = 2000) {
  let result = value;
  for (const pattern of secretPatterns) result = result.replace(pattern, "[REDACTED]");
  result = result.replace(
    /((?:secret|token|password|api[_-]?key|service[_-]?role)\s*[:=]\s*["']?)[^"'\s,;]{6,}/gi,
    "$1[REDACTED]",
  );
  return result.slice(0, maxLength);
}

function normalizePath(filePath?: string) {
  if (!filePath) return "";
  const normalized = filePath.split(path.sep).join("/").replace(/^\.?\//, "");
  if (normalized.startsWith("/") || normalized.split("/").includes("..")) return "";
  return normalized.slice(0, 1000);
}

export interface FindingInput {
  ruleId: string;
  title: string;
  category: string;
  severity: Severity;
  confidence: Confidence;
  explanation: string;
  impact: string;
  evidence: {
    excerpt: string;
    filePath?: string;
    line?: number;
    secretFingerprint?: string;
  };
  detectionSource: string;
  remediation: string;
  desiredBehavior: string;
  verification: string;
  references?: Array<{ label: string; url: string }>;
  heuristic?: boolean;
  relatedCallSites?: string;
  machineResult?: Record<string, unknown>;
  fingerprintAnchor?: string;
}

export function createFinding(input: FindingInput): NormalizedFinding {
  const filePath = normalizePath(input.evidence.filePath);
  const excerpt = redact(input.evidence.excerpt);
  const anchor = input.fingerprintAnchor ?? `${filePath}:${input.evidence.line ?? 0}:${excerpt.slice(0, 160)}`;
  const fingerprint = hash(`${input.ruleId}\0${anchor}`).slice(0, 40);
  const evidenceFingerprint = hash(`${input.ruleId}\0${filePath}\0${input.evidence.line ?? 0}\0${anchor}`).slice(0, 40);
  const target = filePath ? `\`${filePath}\`` : "the affected configuration";
  const fixPrompt = [
    `Inspect ${target}${input.evidence.line ? ` near line ${input.evidence.line}` : ""} and ${input.relatedCallSites ?? "every related call site"}.`,
    input.explanation,
    `Change the implementation so that ${input.desiredBehavior}`,
    "Preserve existing user-facing behavior, data contracts, and working integrations unless a security requirement makes a narrow change necessary.",
    "Do not print, copy into chat, expose, or commit any secret value; use placeholders when documenting configuration.",
    `Complete the work only when ${input.verification}`,
  ].join(" ");

  return {
    ruleId: input.ruleId,
    title: input.title,
    category: input.category,
    severity: input.severity,
    confidence: input.confidence,
    explanation: input.explanation,
    impact: input.impact,
    evidence: {
      excerpt,
      filePath: filePath || undefined,
      line: input.evidence.line,
      secretFingerprint: input.evidence.secretFingerprint,
    },
    detectionSources: [input.detectionSource],
    remediation: input.remediation,
    fixPrompt,
    verification: input.verification,
    references: input.references ?? [],
    heuristic: input.heuristic ?? false,
    fingerprint,
    evidenceFingerprint,
    machineResult: input.machineResult ?? {},
  };
}

const severityOrder: Record<Severity, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
const confidenceOrder: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

export function deduplicateFindings(findings: NormalizedFinding[]) {
  const byFingerprint = new Map<string, NormalizedFinding>();
  for (const finding of findings) {
    const existing = byFingerprint.get(finding.fingerprint);
    if (!existing) {
      byFingerprint.set(finding.fingerprint, finding);
      continue;
    }
    existing.detectionSources = [...new Set([...existing.detectionSources, ...finding.detectionSources])];
    if (severityOrder[finding.severity] > severityOrder[existing.severity]) existing.severity = finding.severity;
    if (confidenceOrder[finding.confidence] > confidenceOrder[existing.confidence]) existing.confidence = finding.confidence;
  }
  return [...byFingerprint.values()];
}

export function lineForOffset(content: string, offset: number) {
  return content.slice(0, Math.max(0, offset)).split("\n").length;
}

export function safeLine(content: string, line: number) {
  return redact(content.split(/\r?\n/)[Math.max(0, line - 1)]?.trim() ?? "[evidence not available]", 500);
}
