export const verdicts = [
  "BLOCKED",
  "NEEDS WORK",
  "READY FOR LAUNCH CHECKS",
  "SCAN INCOMPLETE",
] as const;

export type Verdict = (typeof verdicts)[number];

export const severities = ["critical", "high", "medium", "low", "info"] as const;
export type Severity = (typeof severities)[number];

export const confidences = ["high", "medium", "low"] as const;
export type Confidence = (typeof confidences)[number];

export type FindingStatus = "open" | "fixed" | "dismissed" | "accepted";

export interface FindingEvidence {
  excerpt: string;
  filePath?: string;
  line?: number;
}

export interface ReportFinding {
  id: string;
  ruleId: string;
  title: string;
  category: string;
  severity: Severity;
  confidence: Confidence;
  status: FindingStatus;
  explanation: string;
  impact: string;
  evidence: FindingEvidence;
  detectionSource: string[];
  remediation: string;
  fixPrompt: string;
  verification: string;
  references: { label: string; url: string }[];
  dismissedReason?: string;
  isNew?: boolean;
  isRegression?: boolean;
}

export interface ScanComponentSummary {
  name: string;
  status: "queued" | "running" | "passed" | "failed" | "timed_out" | "skipped";
  detail: string;
}

export interface LaunchReport {
  id: string;
  projectName: string;
  repositoryLabel: string;
  repositoryUrl?: string;
  siteUrl?: string;
  verdict: Verdict;
  completedAt: string;
  fingerprint: string;
  scope: string[];
  limitations: string[];
  findings: ReportFinding[];
  components: ScanComponentSummary[];
}
