import Link from "next/link";
import { ArrowRight, CheckCircle2, ExternalLink, TriangleAlert } from "lucide-react";
import { SeverityBadge, VerdictBadge } from "@/components/ui";
import type { LaunchReport } from "@/lib/types";

export function ReportView({
  report,
  findingBasePath,
}: {
  report: LaunchReport;
  findingBasePath: string;
}) {
  const completed = new Intl.DateTimeFormat("en", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(report.completedAt));

  return (
    <article className="report-page">
      <header className="report-page-header">
        <div>
          <VerdictBadge verdict={report.verdict} />
          <h1>{report.projectName}</h1>
          <p>{report.repositoryLabel}</p>
        </div>
        <p className="report-date">Automated checks completed<br />{completed} UTC</p>
      </header>

      <div className="report-metadata">
        <div><span>Report fingerprint</span><strong>{report.fingerprint}</strong></div>
        <div>
          <span>Repository</span>
          {report.repositoryUrl ? (
            <a href={report.repositoryUrl} rel="noreferrer" target="_blank">
              {report.repositoryLabel}
            </a>
          ) : <strong>Private</strong>}
        </div>
        <div>
          <span>Deployed target</span>
          {report.siteUrl ? <strong>{new URL(report.siteUrl).hostname}</strong> : <strong>Not included</strong>}
        </div>
        <div><span>Open findings</span><strong>{report.findings.filter((finding) => finding.status === "open").length}</strong></div>
      </div>

      <section className="report-section">
        <div className="report-section-heading">
          <h2>Prioritized findings</h2>
          <p>Machine evidence is preserved; secret values are redacted.</p>
        </div>
        <div className="finding-list">
          {report.findings.map((finding) => (
            <Link className="finding-card" href={`${findingBasePath}/${finding.id}`} key={finding.id}>
              <SeverityBadge severity={finding.severity} />
              <div>
                <h3>{finding.title}</h3>
                <p>{finding.category} · {finding.confidence} confidence · {finding.ruleId}</p>
              </div>
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      <section className="report-section">
        <div className="report-section-heading">
          <h2>Scanner coverage</h2>
          <p>A required failure or timeout makes the verdict “Scan incomplete.”</p>
        </div>
        <div className="component-grid">
          {report.components.map((component) => (
            <div className="component-row" key={component.name}>
              <div>
                {component.status === "passed" ? <CheckCircle2 size={17} /> : <TriangleAlert size={17} />}
                <span><strong>{component.name}</strong>{component.detail}</span>
              </div>
              <span className={`badge ${component.status === "passed" ? "badge-success" : "badge-neutral"}`}>
                {component.status.replace("_", " ")}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="report-section">
        <div className="report-section-heading">
          <h2>Scope and limitations</h2>
          <p>This report is not a security certification.</p>
        </div>
        <div className="scope-grid">
          <div>
            <h3>Included in this scan</h3>
            <ul>{report.scope.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
          <div>
            <h3>Important limitations</h3>
            <ul>{report.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        </div>
      </section>

      <section className="report-section">
        <div className="report-section-heading">
          <h2>Statement</h2>
        </div>
        <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>
          Automated checks completed as of {completed} UTC for the scope listed above.
          RepoSec did not execute customer code and did not perform active exploitation.
          Findings describe observed evidence, not a guarantee that the project is secure.
        </p>
        <p style={{ margin: "14px 0 0", fontSize: 12 }}>
          <Link href="/security">Read the RepoSec security model <ExternalLink size={12} style={{ display: "inline" }} /></Link>
        </p>
      </section>
    </article>
  );
}
