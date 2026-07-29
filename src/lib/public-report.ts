import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface PublicTrustReport {
  slug: string;
  projectName: string;
  productUrl: string | null;
  repositoryUrl: string | null;
  lastScanAt: string;
  fingerprint: string;
  passedControls: Array<{ name: string; detail: string }>;
  remediationSummary: { fixed: number; dismissed: number; openHidden: number };
  scope: string[];
}

export async function getPublicTrustReport(slug: string): Promise<PublicTrustReport | null> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("public_report_settings")
    .select("public_slug,show_product_link,show_repository_link,passed_controls,remediation_summary,scope_snapshot,last_scan_at,report_fingerprint,projects!inner(name,product_url,repositories(html_url,visibility))")
    .eq("public_slug", slug)
    .eq("enabled", true)
    .maybeSingle();

  if (error || !data) return null;
  const project = data.projects as unknown as {
    name: string;
    product_url: string | null;
    repositories: Array<{ html_url: string | null; visibility: string }>;
  };
  const repository = project.repositories[0];

  return {
    slug: data.public_slug as string,
    projectName: project.name,
    productUrl: data.show_product_link ? project.product_url : null,
    repositoryUrl: data.show_repository_link && repository?.visibility === "public" ? repository.html_url : null,
    lastScanAt: data.last_scan_at as string,
    fingerprint: data.report_fingerprint as string,
    passedControls: data.passed_controls as Array<{ name: string; detail: string }>,
    remediationSummary: data.remediation_summary as { fixed: number; dismissed: number; openHidden: number },
    scope: data.scope_snapshot as string[],
  };
}
