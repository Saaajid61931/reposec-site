import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, CircleAlert, RotateCcw } from "lucide-react";
import { getProject, getScanReport } from "@/lib/data";
import { SeverityBadge, VerdictBadge } from "@/components/ui";

export const metadata: Metadata = { title: "Scan comparison" };

export default async function ComparePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  const completed = project.scans.filter((scan) => scan.status === "completed").slice(0, 2);

  if (completed.length < 2) {
    return (
      <>
        <div className="dashboard-breadcrumb"><Link href={`/dashboard/projects/${projectId}`}><ArrowLeft size={14} /> Project overview</Link></div>
        <section className="empty-state">
          <h2>Two completed scans are required</h2>
          <p>Run a rescan after making fixes to see new, resolved, unchanged, and regressed findings.</p>
        </section>
      </>
    );
  }

  const [currentResult, previousResult] = await Promise.all([
    getScanReport(completed[0]!.id),
    getScanReport(completed[1]!.id),
  ]);
  const current = currentResult.report!;
  const previous = previousResult.report!;
  const currentFindings = new Map(current.findings.map((finding) => [finding.id, finding]));
  const previousFindings = new Map(previous.findings.map((finding) => [finding.id, finding]));
  const regressed = current.findings.filter((finding) => finding.isRegression);
  const newFindings = current.findings.filter((finding) => !finding.isRegression && !previousFindings.has(finding.id));
  const resolved = previous.findings.filter((finding) => !currentFindings.has(finding.id));
  const unchanged = current.findings.filter((finding) => previousFindings.has(finding.id) && !finding.isRegression);

  const groups = [
    { label: "New", items: newFindings, icon: CircleAlert, tone: "new" },
    { label: "Resolved", items: resolved, icon: CheckCircle2, tone: "resolved" },
    { label: "Regressed", items: regressed, icon: RotateCcw, tone: "regressed" },
    { label: "Unchanged", items: unchanged, icon: ArrowRight, tone: "unchanged" },
  ];

  return (
    <>
      <div className="dashboard-breadcrumb"><Link href={`/dashboard/projects/${projectId}`}><ArrowLeft size={14} /> Project overview</Link></div>
      <header className="dashboard-header compact">
        <div><p className="eyebrow">Scan comparison</p><h1>What changed since the last check?</h1><p>Findings are matched by stable rule and evidence fingerprints.</p></div>
      </header>
      <div className="comparison-header">
        <div><span>Previous</span><strong>{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(previous.completedAt))}</strong><VerdictBadge verdict={previous.verdict} /></div>
        <ArrowRight size={20} />
        <div><span>Current</span><strong>{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(current.completedAt))}</strong><VerdictBadge verdict={current.verdict} /></div>
      </div>
      <div className="comparison-grid">
        {groups.map(({ label, items, icon: Icon, tone }) => (
          <section className="comparison-group" key={label}>
            <div className="comparison-group-header"><span className={`comparison-icon ${tone}`}><Icon size={16} /></span><h2>{label}</h2><strong>{items.length}</strong></div>
            {items.length === 0 ? <p>No {label.toLowerCase()} findings.</p> : items.map((finding) => (
              <Link href={`/dashboard/projects/${projectId}/findings/${finding.id}`} key={finding.id}>
                <SeverityBadge severity={finding.severity} />
                <span><strong>{finding.title}</strong><small>{finding.ruleId}</small></span>
                <ArrowRight size={14} />
              </Link>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
