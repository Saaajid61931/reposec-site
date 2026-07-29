import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { FindingOverrideForm } from "@/components/admin-actions";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SeverityBadge } from "@/components/ui";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Admin finding review" };

export default async function AdminFindingPage({
  params,
}: {
  params: Promise<{ findingId: string }>;
}) {
  await requireAdmin();
  const { findingId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: finding } = await supabase!
    .from("findings")
    .select("id,title,rule_id,severity,confidence,explanation,remediation,project_id,finding_occurrences(redacted_evidence,file_path,line_number),finding_overrides(id,classification,customer_explanation,customer_remediation,reason,created_at)")
    .eq("id", findingId)
    .maybeSingle();
  if (!finding) notFound();

  return (
    <>
      <div className="dashboard-breadcrumb"><Link href="/dashboard/admin"><ArrowLeft size={14} /> Admin dashboard</Link></div>
      <header className="dashboard-header compact">
        <div>
          <p className="eyebrow">Admin finding review</p>
          <h1>{String(finding.title)}</h1>
          <p>{String(finding.rule_id)} · {String(finding.confidence)} confidence</p>
        </div>
        <SeverityBadge severity={finding.severity as "critical" | "high" | "medium" | "low" | "info"} />
      </header>

      <div className="settings-grid">
        <section className="settings-card">
          <div className="dashboard-section-heading"><div><h2>Original machine result</h2><p>This record is preserved and cannot be silently replaced.</p></div></div>
          <h3>Explanation</h3><p className="inline-note">{String(finding.explanation)}</p>
          <h3>Remediation</h3><p className="inline-note">{String(finding.remediation)}</p>
          <h3>Latest redacted evidence</h3>
          <pre className="evidence">{String((finding.finding_occurrences as unknown as Array<{ redacted_evidence: string }>)[0]?.redacted_evidence ?? "No evidence")}</pre>
        </section>
        <section className="settings-card">
          <div className="dashboard-section-heading"><div><h2>Append human override</h2><p>Every override identifies the admin and reason and supersedes rather than mutates prior text.</p></div></div>
          <FindingOverrideForm findingId={findingId} />
        </section>
      </div>

      <section className="dashboard-section">
        <div className="dashboard-section-heading"><div><h2>Override history</h2></div></div>
        <div className="audit-list">
          {((finding.finding_overrides ?? []) as unknown as Array<{ id: string; classification: string | null; reason: string; created_at: string }>).map((override) => (
            <div key={override.id}><ListChecksIcon /><span><strong>{override.classification ?? "Wording override"}</strong><small>{override.reason}</small></span><time>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(override.created_at))}</time></div>
          ))}
        </div>
      </section>
    </>
  );
}

function ListChecksIcon() {
  return <span aria-hidden="true">≡</span>;
}
