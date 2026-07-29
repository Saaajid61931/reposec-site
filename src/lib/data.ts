import "server-only";

import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { LaunchReport, ReportFinding, Verdict } from "@/lib/types";

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  role: string;
  agencyName: string | null;
  logoUrl: string | null;
}

export interface ProjectListItem {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  status: string;
  repository: { fullName: string; visibility: string; htmlUrl: string | null } | null;
  latestScan: {
    id: string;
    verdict: Verdict | null;
    status: string;
    completedAt: string | null;
  } | null;
}

export interface ProjectDetail extends ProjectListItem {
  createdAt: string;
  site: { id: string; url: string; hostname: string; verifiedAt: string | null } | null;
  monitoringEnabled: boolean;
  publicReportEnabled: boolean;
  scans: Array<{
    id: string;
    verdict: Verdict | null;
    status: string;
    trigger: string;
    createdAt: string;
    completedAt: string | null;
    fingerprint: string | null;
  }>;
}

interface ScanRow {
  id: string;
  project_id: string;
  status: string;
  verdict: Verdict | null;
  mode: string;
  trigger: string;
  branch: string | null;
  commit_sha: string | null;
  started_at: string | null;
  completed_at: string | null;
  report_fingerprint: string | null;
  created_at: string;
  coverage_complete: boolean;
  limitation_notes: string[];
}

interface ProjectRow {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  status: string;
  created_at: string;
}

interface RepositoryRow {
  full_name: string;
  visibility: string;
  html_url: string | null;
  default_branch: string;
}

interface SiteRow {
  id: string;
  url: string;
  hostname: string;
  verified_at: string | null;
}

interface ComponentRow {
  scanner: string;
  status: "queued" | "running" | "passed" | "failed" | "timed_out" | "skipped";
  summary: string | null;
  rule_count: number;
}

interface FindingRow {
  id: string;
  rule_id: string;
  title: string;
  category: string;
  severity: ReportFinding["severity"];
  confidence: ReportFinding["confidence"];
  current_status: ReportFinding["status"];
  explanation: string;
  impact: string;
  remediation: string;
  fix_prompt: string;
  verification: string;
  references: Array<{ label: string; url: string }>;
  detection_sources: string[];
}

interface OccurrenceRow {
  finding_id: string;
  redacted_evidence: string;
  file_path: string | null;
  line_number: number | null;
  status_at_scan: ReportFinding["status"];
  is_new: boolean;
  is_regression: boolean;
}

function first<T>(value: T[] | null | undefined): T | null {
  return value?.[0] ?? null;
}

export async function getOrganizations(userId: string): Promise<OrganizationSummary[]> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("organization_members")
    .select("role, organizations!inner(id,name,slug,agency_name,logo_url)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw new Error("Unable to load organizations.");

  return (data ?? []).map((membership) => {
    const organization = membership.organizations as unknown as {
      id: string;
      name: string;
      slug: string;
      agency_name: string | null;
      logo_url: string | null;
    };
    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      role: membership.role as string,
      agencyName: organization.agency_name,
      logoUrl: organization.logo_url,
    };
  });
}

export async function getProjects(): Promise<ProjectListItem[]> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("projects")
    .select("id,organization_id,name,slug,status,repositories(full_name,visibility,html_url),scans(id,verdict,status,completed_at,created_at)")
    .order("updated_at", { ascending: false });

  if (error) throw new Error("Unable to load projects.");

  return (data ?? []).map((project) => {
    const scans = [...((project.scans ?? []) as unknown as Array<{
      id: string;
      verdict: Verdict | null;
      status: string;
      completed_at: string | null;
      created_at: string;
    }>)].sort((a, b) => b.created_at.localeCompare(a.created_at));
    const repository = first(project.repositories as unknown as RepositoryRow[]);
    const latest = scans[0] ?? null;
    return {
      id: project.id as string,
      organizationId: project.organization_id as string,
      name: project.name as string,
      slug: project.slug as string,
      status: project.status as string,
      repository: repository
        ? { fullName: repository.full_name, visibility: repository.visibility, htmlUrl: repository.html_url }
        : null,
      latestScan: latest
        ? { id: latest.id, verdict: latest.verdict, status: latest.status, completedAt: latest.completed_at }
        : null,
    };
  });
}

export async function getProject(projectId: string): Promise<ProjectDetail> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) notFound();

  const { data, error } = await supabase
    .from("projects")
    .select("id,organization_id,name,slug,status,created_at,repositories(full_name,visibility,html_url),site_targets(id,url,hostname,verified_at),scans(id,verdict,status,trigger,created_at,completed_at,report_fingerprint),project_entitlements(kind,active)")
    .eq("id", projectId)
    .maybeSingle();

  if (error || !data) notFound();

  const project = data as unknown as ProjectRow & {
    repositories: RepositoryRow[];
    site_targets: SiteRow[];
    scans: Array<{
      id: string;
      verdict: Verdict | null;
      status: string;
      trigger: string;
      created_at: string;
      completed_at: string | null;
      report_fingerprint: string | null;
    }>;
    project_entitlements: Array<{ kind: string; active: boolean }>;
  };
  const scans = [...project.scans].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const repository = first(project.repositories);
  const site = first(project.site_targets);
  const latest = scans[0] ?? null;

  return {
    id: project.id,
    organizationId: project.organization_id,
    name: project.name,
    slug: project.slug,
    status: project.status,
    createdAt: project.created_at,
    repository: repository
      ? { fullName: repository.full_name, visibility: repository.visibility, htmlUrl: repository.html_url }
      : null,
    site: site
      ? { id: site.id, url: site.url, hostname: site.hostname, verifiedAt: site.verified_at }
      : null,
    latestScan: latest
      ? { id: latest.id, verdict: latest.verdict, status: latest.status, completedAt: latest.completed_at }
      : null,
    monitoringEnabled: project.project_entitlements.some((item) => item.kind === "monitoring" && item.active),
    publicReportEnabled: false,
    scans: scans.map((scan) => ({
      id: scan.id,
      verdict: scan.verdict,
      status: scan.status,
      trigger: scan.trigger,
      createdAt: scan.created_at,
      completedAt: scan.completed_at,
      fingerprint: scan.report_fingerprint,
    })),
  };
}

export async function getScanReport(scanId: string): Promise<{ scan: ScanRow; report: LaunchReport | null }> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) notFound();

  const { data: scanData, error: scanError } = await supabase
    .from("scans")
    .select("id,project_id,status,verdict,mode,trigger,branch,commit_sha,started_at,completed_at,report_fingerprint,created_at,coverage_complete,limitation_notes")
    .eq("id", scanId)
    .maybeSingle();
  if (scanError || !scanData) notFound();
  const scan = scanData as unknown as ScanRow;

  if (scan.status !== "completed" && scan.status !== "failed") return { scan, report: null };

  const [
    { data: projectData },
    { data: repositoryData },
    { data: siteData },
    { data: componentData },
    { data: occurrenceData },
  ] = await Promise.all([
    supabase.from("projects").select("id,name").eq("id", scan.project_id).single(),
    supabase.from("repositories").select("full_name,html_url").eq("project_id", scan.project_id).limit(1).maybeSingle(),
    supabase.from("site_targets").select("url,verified_at").eq("project_id", scan.project_id).limit(1).maybeSingle(),
    supabase.from("scan_components").select("scanner,status,summary,rule_count").eq("scan_id", scan.id).order("created_at"),
    supabase.from("finding_occurrences").select("finding_id,redacted_evidence,file_path,line_number,status_at_scan,is_new,is_regression").eq("scan_id", scan.id),
  ]);

  const occurrences = (occurrenceData ?? []) as unknown as OccurrenceRow[];
  const findingIds = occurrences.map((item) => item.finding_id);
  const { data: findingData } = findingIds.length > 0
    ? await supabase
        .from("findings")
        .select("id,rule_id,title,category,severity,confidence,current_status,explanation,impact,remediation,fix_prompt,verification,references,detection_sources")
        .in("id", findingIds)
    : { data: [] };

  const findingRows = (findingData ?? []) as unknown as FindingRow[];
  const findings: ReportFinding[] = findingRows.map((finding) => {
    const occurrence = occurrences.find((item) => item.finding_id === finding.id);
    return {
      id: finding.id,
      ruleId: finding.rule_id,
      title: finding.title,
      category: finding.category,
      severity: finding.severity,
      confidence: finding.confidence,
      status: occurrence?.status_at_scan ?? finding.current_status,
      explanation: finding.explanation,
      impact: finding.impact,
      evidence: {
        excerpt: occurrence?.redacted_evidence ?? "Evidence unavailable",
        filePath: occurrence?.file_path ?? undefined,
        line: occurrence?.line_number ?? undefined,
      },
      detectionSource: finding.detection_sources,
      remediation: finding.remediation,
      fixPrompt: finding.fix_prompt,
      verification: finding.verification,
      references: finding.references,
      isNew: occurrence?.is_new ?? false,
      isRegression: occurrence?.is_regression ?? false,
    };
  });

  const components = (componentData ?? []) as unknown as ComponentRow[];
  const repository = repositoryData as unknown as { full_name: string; html_url: string | null } | null;
  const site = siteData as unknown as { url: string; verified_at: string | null } | null;
  const project = projectData as unknown as { name: string };

  return {
    scan,
    report: {
      id: scan.id,
      projectName: project.name,
      repositoryLabel: repository?.full_name ?? "Repository unavailable",
      repositoryUrl: repository?.html_url ?? undefined,
      siteUrl: site?.verified_at ? site.url : undefined,
      verdict: scan.verdict ?? "SCAN INCOMPLETE",
      completedAt: scan.completed_at ?? scan.created_at,
      fingerprint: scan.report_fingerprint ?? `pending_${scan.id.slice(0, 8)}`,
      scope: [
        "Default-branch repository snapshot",
        "Repository posture and GitHub Actions",
        "Dependency manifests and static application rules",
        ...(site?.verified_at ? ["Verified deployed-site root URL"] : []),
      ],
      limitations: scan.limitation_notes?.length
        ? scan.limitation_notes
        : [
            "Static analysis does not execute code or prove runtime authorization behavior.",
            "Automated checks do not certify that an application is secure.",
          ],
      findings,
      components: components.map((component) => ({
        name: component.scanner,
        status: component.status,
        detail: component.summary ?? `${component.rule_count} rules evaluated`,
      })),
    },
  };
}

export async function getFinding(findingId: string): Promise<ReportFinding> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) notFound();

  const { data, error } = await supabase
    .from("findings")
    .select("id,rule_id,title,category,severity,confidence,current_status,explanation,impact,remediation,fix_prompt,verification,references,detection_sources,finding_occurrences(redacted_evidence,file_path,line_number,status_at_scan,is_new,is_regression,created_at)")
    .eq("id", findingId)
    .maybeSingle();
  if (error || !data) notFound();

  const finding = data as unknown as FindingRow & { finding_occurrences: Array<OccurrenceRow & { created_at: string }> };
  const occurrence = [...finding.finding_occurrences].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return {
    id: finding.id,
    ruleId: finding.rule_id,
    title: finding.title,
    category: finding.category,
    severity: finding.severity,
    confidence: finding.confidence,
    status: occurrence?.status_at_scan ?? finding.current_status,
    explanation: finding.explanation,
    impact: finding.impact,
    evidence: {
      excerpt: occurrence?.redacted_evidence ?? "Evidence unavailable",
      filePath: occurrence?.file_path ?? undefined,
      line: occurrence?.line_number ?? undefined,
    },
    detectionSource: finding.detection_sources,
    remediation: finding.remediation,
    fixPrompt: finding.fix_prompt,
    verification: finding.verification,
    references: finding.references,
    isNew: occurrence?.is_new ?? false,
    isRegression: occurrence?.is_regression ?? false,
  };
}

export async function getScanComponents(scanId: string): Promise<ComponentRow[]> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("scan_components")
    .select("scanner,status,summary,rule_count")
    .eq("scan_id", scanId)
    .order("created_at");
  if (error) return [];
  return (data ?? []) as unknown as ComponentRow[];
}
