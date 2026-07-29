export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type Confidence = "high" | "medium" | "low";
export type ComponentStatus = "queued" | "running" | "passed" | "failed" | "timed_out" | "skipped";

export interface WorkerConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  workerSharedSecret: string;
  webAppUrl: string;
  githubAppId?: string;
  githubAppPrivateKey?: string;
  workerId: string;
  pollIntervalMs: number;
  concurrency: number;
  limits: {
    scanTimeoutMs: number;
    componentTimeoutMs: number;
    publicCompressedBytes: number;
    fullCompressedBytes: number;
    expandedBytes: number;
    fileCount: number;
    fileBytes: number;
    resultBytes: number;
  };
}

export interface ScanJob {
  jobId: string;
  scanId: string;
  attempt: number;
  maxAttempts: number;
  payload: {
    mode?: "free" | "launch_pack" | "monitoring";
    projectId?: string;
    repositoryOwner?: string;
    repositoryName?: string;
    repositoryUrl?: string;
    siteUrl?: string;
    componentOnly?: string;
    trigger?: string;
    commitSha?: string | null;
  };
}

export interface RepositoryTarget {
  owner: string;
  name: string;
  fullName: string;
  htmlUrl: string;
  defaultBranch: string;
  visibility: "public" | "private" | "internal";
  archived: boolean;
  pushedAt?: string | null;
  installationId?: number;
  site?: {
    url: string;
    hostname: string;
    verified: boolean;
  };
}

export interface Evidence {
  excerpt: string;
  filePath?: string;
  line?: number;
  secretFingerprint?: string;
}

export interface NormalizedFinding {
  ruleId: string;
  title: string;
  category: string;
  severity: Severity;
  confidence: Confidence;
  explanation: string;
  impact: string;
  evidence: Evidence;
  detectionSources: string[];
  remediation: string;
  fixPrompt: string;
  verification: string;
  references: Array<{ label: string; url: string }>;
  heuristic: boolean;
  fingerprint: string;
  evidenceFingerprint: string;
  machineResult: Record<string, unknown>;
}

export interface ComponentResult {
  name: import("./components.js").ScanComponentName | string;
  version: string;
  status: Exclude<ComponentStatus, "queued" | "running">;
  required: boolean;
  ruleCount: number;
  findings: NormalizedFinding[];
  summary: string;
  errorCode?: string;
  errorDetail?: string;
  durationMs: number;
  passedControls?: Array<{ name: string; detail: string }>;
}

export interface RepositorySnapshot {
  root: string;
  archivePath: string;
  commitSha: string | null;
  defaultBranch: string;
  compressedBytes: number;
  expandedBytes: number;
  fileCount: number;
  files: Array<{ relativePath: string; absolutePath: string; size: number }>;
}
