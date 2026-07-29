import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ExternalLink, Fingerprint, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/logo";
import { getPublicTrustReport } from "@/lib/public-report";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ publicSlug: string }>;
}): Promise<Metadata> {
  const { publicSlug } = await params;
  const report = await getPublicTrustReport(publicSlug);
  if (!report) return { title: "Public report unavailable", robots: { index: false, follow: false } };
  return {
    title: `${report.projectName} automated check status`,
    description: `Passed automated controls and scan scope for ${report.projectName}.`,
    alternates: { canonical: `/p/${publicSlug}` },
    robots: { index: true, follow: true },
  };
}

export default async function PublicTrustPage({
  params,
}: {
  params: Promise<{ publicSlug: string }>;
}) {
  const { publicSlug } = await params;
  const report = await getPublicTrustReport(publicSlug);
  if (!report) return notFound();
  const checkedAt = new Intl.DateTimeFormat("en", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }).format(new Date(report.lastScanAt));

  return (
    <main className="trust-page">
      <header className="trust-page-nav"><Logo /><Link href="/security">How RepoSec checks</Link></header>
      <article className="trust-report">
        <div className="trust-report-heading">
          <span className="trust-shield"><ShieldCheck size={25} /></span>
          <p className="eyebrow">Public automated-check summary</p>
          <h1>{report.projectName}</h1>
          <p>Automated checks passed as of {checkedAt} UTC for the scope below.</p>
          <div className="trust-links">
            {report.productUrl && <a href={report.productUrl} rel="noreferrer" target="_blank">Product <ExternalLink size={13} /></a>}
            {report.repositoryUrl && <a href={report.repositoryUrl} rel="noreferrer" target="_blank">Repository <ExternalLink size={13} /></a>}
          </div>
        </div>

        <section className="trust-report-section">
          <h2>Checks that passed</h2>
          <div className="public-controls">
            {report.passedControls.map((control) => (
              <div key={control.name}><Check size={16} /><span><strong>{control.name}</strong><small>{control.detail}</small></span></div>
            ))}
          </div>
        </section>

        <section className="trust-report-section public-summary-grid">
          <div><span>Fixed since first scan</span><strong>{report.remediationSummary.fixed}</strong></div>
          <div><span>Dismissed with review</span><strong>{report.remediationSummary.dismissed}</strong></div>
          <div><span>Unresolved details</span><strong>Private</strong></div>
        </section>

        <section className="trust-report-section">
          <h2>Scan scope</h2>
          <ul>{report.scope.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>

        <section className="trust-report-section public-fingerprint">
          <Fingerprint size={18} />
          <div><span>Report fingerprint</span><strong>{report.fingerprint}</strong></div>
        </section>

        <footer className="trust-disclaimer">
          <strong>Important limitation</strong>
          <p>This page intentionally publishes only passed controls and aggregate remediation status. It never displays unresolved vulnerabilities, private filenames, source, evidence, or internal notes. RepoSec performs automated static and passive checks; this is not a penetration test, warranty, certification, or proof that the project is secure.</p>
        </footer>
      </article>
    </main>
  );
}
