import type { Metadata } from "next";
import { CheckCircle2, Code2, Database, EyeOff, Network, ShieldCheck } from "lucide-react";
import { Github } from "@/components/github-icon";
import { PublicPage } from "@/components/site-shell";
import { SectionHeading } from "@/components/ui";

export const metadata: Metadata = {
  title: "Security",
  description: "RepoSec's scanning boundaries, privacy model, data handling, and responsible disclosure process.",
};

const controls = [
  { icon: Code2, title: "No customer code execution", body: "Workers do not install packages or run scripts, builds, tests, Dockerfiles, binaries, or repository-provided commands." },
  { icon: EyeOff, title: "Redaction before storage", body: "Secret values are replaced with a type marker and partial one-way fingerprint before a finding leaves the worker." },
  { icon: Github, title: "Read-only GitHub App", body: "Private scans use short-lived installation tokens and never request repository write permission." },
  { icon: Database, title: "Tenant isolation", body: "Supabase Row Level Security checks organization membership for projects, reports, findings, billing, and settings." },
  { icon: Network, title: "SSRF-resistant site checks", body: "Every request and redirect is DNS-resolved, IP-classified, size-limited, timed out, and restricted to HTTP or HTTPS." },
  { icon: ShieldCheck, title: "Signed and idempotent webhooks", body: "GitHub and Stripe payloads are verified before processing. Replayed event IDs cannot repeat grants or scans." },
];

export default function SecurityPage() {
  return (
    <PublicPage>
      <section className="page-hero"><div className="container"><p className="eyebrow">Security at RepoSec</p><h1>A scanner should reduce risk without becoming a new one.</h1><p>RepoSec is built around a narrow defensive boundary: read less, execute nothing from the repository, redact early, retain only the report record, and say clearly what could not be verified.</p></div></section>

      <section className="section"><div className="container">
        <SectionHeading title="Core safeguards" body="These are product boundaries, not marketing claims. Scanner component failures remain visible and make required coverage incomplete." />
        <div className="blocker-grid">
          {controls.map(({ icon: Icon, title, body }) => <article className="blocker-item" key={title}><span className="blocker-icon"><Icon size={19} /></span><div><h3>{title}</h3><p>{body}</p></div></article>)}
        </div>
      </div></section>

      <section className="section section-tinted"><div className="container trust-grid">
        <div>
          <p className="eyebrow">Scanner lifecycle</p>
          <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 44, lineHeight: 1.08, margin: 0 }}>A short-lived snapshot with hard resource limits.</h2>
        </div>
        <ol className="security-timeline">
          <li><span>1</span><div><strong>Authorize and queue</strong><p>A user confirms authorization. Private scans receive a short-lived GitHub App token only when the worker claims the durable job.</p></div></li>
          <li><span>2</span><div><strong>Download into isolation</strong><p>The default-branch archive enters a unique ephemeral directory with compressed-size, expanded-size, file-count, per-file, CPU, memory, and wall-clock limits.</p></div></li>
          <li><span>3</span><div><strong>Static tools only</strong><p>Deterministic RepoSec rules and trusted Gitleaks, Semgrep, Trivy, and OSV scanner binaries read files. No repository command is invoked.</p></div></li>
          <li><span>4</span><div><strong>Normalize and redact</strong><p>Overlapping results are fingerprinted and deduplicated. Evidence is redacted and bounded before database insertion.</p></div></li>
          <li><span>5</span><div><strong>Delete the workspace</strong><p>The entire workspace is removed in a finally block after success, failure, cancellation, or timeout.</p></div></li>
        </ol>
      </div></section>

      <section className="section"><div className="container">
        <SectionHeading title="What RepoSec can—and cannot—say" />
        <div className="scope-grid">
          <div className="scope-note">
            <h3>Report language</h3>
            <ul className="passed-list">
              <li><CheckCircle2 size={15} /> “Automated checks passed as of [date]”</li>
              <li><CheckCircle2 size={15} /> “Needs review” when static evidence is insufficient</li>
              <li><CheckCircle2 size={15} /> Exact scope, component versions, failures, and limitations</li>
            </ul>
          </div>
          <div className="scope-note">
            <h3>Claims we do not make</h3>
            <ul>
              <li>That a project is secure, certified, compliant, or free of vulnerabilities</li>
              <li>That static evidence proves exploitability</li>
              <li>That passive checks replace a penetration test or architecture review</li>
            </ul>
          </div>
        </div>
      </div></section>

      <section className="section section-dark"><div className="narrow">
        <p className="eyebrow">Responsible disclosure</p>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 42, margin: 0 }}>Found a problem in RepoSec itself?</h2>
        <p style={{ color: "#b9c4be" }}>Email <a href="mailto:security@reposec.site" style={{ color: "white", textDecoration: "underline" }}>security@reposec.site</a> with a concise reproduction and impact. Do not access customer data, degrade service, use automated exploitation, or include raw secrets. Our disclosure contact and encryption-key location are published in <a href="/.well-known/security.txt" style={{ color: "white", textDecoration: "underline" }}>security.txt</a>.</p>
      </div></section>
    </PublicPage>
  );
}
