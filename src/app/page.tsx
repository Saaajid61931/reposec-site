import type { Metadata } from "next";
import {
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Code2,
  EyeOff,
  FileCheck2,
  FileWarning,
  Fingerprint,
  KeyRound,
  Network,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
  Webhook,
} from "lucide-react";
import { Github } from "@/components/github-icon";
import { PublicScanForm } from "@/components/public-scan-form";
import { PublicPage } from "@/components/site-shell";
import { ButtonLink, SectionHeading, SeverityBadge, VerdictBadge } from "@/components/ui";
import { sampleReport } from "@/lib/sample-report";

export const metadata: Metadata = {
  title: "Before you ship, know what your AI forgot",
  alternates: { canonical: "/" },
};

const blockers = [
  {
    icon: KeyRound,
    title: "Exposed and over-privileged keys",
    body: "Secret-shaped values, browser-exposed service credentials, and risky committed environment files.",
  },
  {
    icon: Github,
    title: "Unsafe GitHub Actions",
    body: "Broad token permissions, unpinned actions, dangerous pull-request triggers, and untrusted shell input.",
  },
  {
    icon: CircleDollarSign,
    title: "Payment and authorization gaps",
    body: "Unsigned webhooks, client-trusted prices or user IDs, and routes without an obvious authorization boundary.",
  },
  {
    icon: Network,
    title: "Production posture misses",
    body: "Missing browser protections, insecure cookies, public source maps, debug endpoints, and weak repository hygiene.",
  },
];

const faq = [
  {
    q: "Does a clean RepoSec report mean my application is secure?",
    a: "No. RepoSec reports only what its automated checks observed within the stated scope. Static analysis and passive URL checks cannot prove that an application is secure, and the report is not a certification or penetration test.",
  },
  {
    q: "Will RepoSec run my code?",
    a: "No. The scanner never installs dependencies or runs builds, scripts, tests, Dockerfiles, repository binaries, or customer commands. It analyzes files in an isolated, short-lived workspace that is deleted after each scan.",
  },
  {
    q: "What access does the GitHub App request?",
    a: "Private repository scans use short-lived installation tokens with read-only access to repository contents and metadata. Actions and administration are read-only where needed for workflow and branch-protection posture. RepoSec does not request repository write access.",
  },
  {
    q: "Can I check a client project?",
    a: "Yes, when the repository or site owner has authorized you. The Agency plan keeps client projects separate, supports client-safe report links, and preserves RepoSec's scope and limitations on every report.",
  },
  {
    q: "How is a deployed domain verified?",
    a: "Add a generated DNS TXT record or publish the generated token at /.well-known/reposec-verification.txt. Until verification, the free check requests only the public root URL and does not perform deeper URL checks.",
  },
  {
    q: "What happens to repository source and detected secrets?",
    a: "Repository source is held only in an ephemeral scanner workspace and is deleted after the scan. Secret values are redacted before findings leave the worker. RepoSec stores a fingerprint and redacted evidence, never the detected value.",
  },
];

export default function HomePage() {
  return (
    <PublicPage>
      <section className="hero" id="free-check">
        <div className="container hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Launch-readiness checks for AI-built software</p>
            <h1>Before you ship, know what your AI forgot.</h1>
            <p className="hero-lede">
              Connect your GitHub repo and deployed app. RepoSec finds launch blockers,
              explains the impact, and gives your coding agent an exact prompt to fix each one.
            </p>
            <ul className="hero-points" aria-label="Scanner safeguards">
              <li><CheckCircle2 size={15} /> No code execution</li>
              <li><CheckCircle2 size={15} /> Secret values redacted</li>
              <li><CheckCircle2 size={15} /> Plain-English evidence</li>
            </ul>
          </div>
          <PublicScanForm />
        </div>
      </section>

      <section className="section section-tinted">
        <div className="container">
          <SectionHeading
            eyebrow="A report you can act on"
            title="Find the blocker. Understand it. Hand off the fix."
            body="Every result connects deterministic evidence to a practical remediation and a stack-aware prompt for your coding agent."
          />
          <div className="report-window" aria-label="Example RepoSec report preview">
            <div className="report-window-bar">
              <div className="window-dots" aria-hidden="true"><span /><span /><span /></div>
              <span>Sample report · Northstar Client Portal</span>
              <span>rs_8d31a7c2e4906baf</span>
            </div>
            <div className="report-window-body">
              <aside className="report-sidebar">
                <p className="report-sidebar-label">Report</p>
                <div className="report-sidebar-item active"><FileWarning size={14} /> Findings</div>
                <div className="report-sidebar-item"><ScanSearch size={14} /> Scan coverage</div>
                <div className="report-sidebar-item"><RefreshCw size={14} /> Verification</div>
                <div className="report-sidebar-item"><FileCheck2 size={14} /> Client report</div>
              </aside>
              <div className="report-main">
                <div className="report-summary-row">
                  <div>
                    <VerdictBadge verdict={sampleReport.verdict} />
                    <h3>{sampleReport.projectName}</h3>
                    <p>3 findings shown · sample data · automated checks completed</p>
                  </div>
                  <ButtonLink href="/sample-report" size="small" variant="secondary">
                    Open report <ArrowRight size={14} />
                  </ButtonLink>
                </div>
                <div className="finding-preview-list">
                  {sampleReport.findings.map((finding) => (
                    <div className="finding-preview" key={finding.id}>
                      <span className={`severity-dot ${finding.severity}`} aria-hidden="true" />
                      <div>
                        <h4>{finding.title}</h4>
                        <p>{finding.evidence.filePath ?? "Deployed production response"}</p>
                      </div>
                      <SeverityBadge severity={finding.severity} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="report-cta">
            <ButtonLink href="/sample-report" variant="secondary">
              View the full sample report <ArrowRight size={16} />
            </ButtonLink>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHeading
            eyebrow="From repository to client-ready"
            title="A careful launch check in three steps"
            centered
          />
          <div className="steps-grid">
            <article className="step-card">
              <span className="step-number">1</span>
              <h3>Connect what you are shipping</h3>
              <p>Select a public repository or install the read-only GitHub App. Verify a deployed domain when you want full passive site checks.</p>
            </article>
            <article className="step-card">
              <span className="step-number">2</span>
              <h3>Review evidence, not guesswork</h3>
              <p>RepoSec runs deterministic scanners, deduplicates overlaps, redacts sensitive values, and labels uncertain evidence “Needs review.”</p>
            </article>
            <article className="step-card">
              <span className="step-number">3</span>
              <h3>Fix, rescan, and hand off</h3>
              <p>Copy precise prompts into Codex, Cursor, Claude Code, or another coding agent. Rescan, compare changes, and print a client-safe report.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="section section-tinted">
        <div className="container">
          <SectionHeading
            eyebrow="Checks that match modern launches"
            title="The quiet mistakes that turn into difficult handoffs"
            body="RepoSec looks for repository, dependency, workflow, application, and deployed-site signals without probing or exploiting the target."
          />
          <div className="blocker-grid">
            {blockers.map(({ icon: Icon, title, body }) => (
              <article className="blocker-item" key={title}>
                <span className="blocker-icon"><Icon size={19} /></span>
                <div><h3>{title}</h3><p>{body}</p></div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-dark">
        <div className="container agency-panel">
          <div className="agency-copy">
            <p className="eyebrow">Built for the agency handoff</p>
            <h2>Send the client a clear answer, not a scanner dump.</h2>
            <p>
              Keep technical notes private while sharing remediation progress, passed controls,
              scan scope, and an honest statement of limitations.
            </p>
            <ButtonLink href="/pricing" variant="secondary">
              Explore Agency <ArrowRight size={16} />
            </ButtonLink>
          </div>
          <div className="handoff-card">
            <div className="handoff-header">
              <strong>Northstar launch review</strong>
              <span className="badge badge-success">Client view</span>
            </div>
            <div className="handoff-body">
              <div className="handoff-meta">
                <div><span>Current status</span><strong>Needs work</strong></div>
                <div><span>Open items</span><strong>2 remaining</strong></div>
                <div><span>Last checked</span><strong>24 Jul 2026</strong></div>
              </div>
              <ul className="passed-list">
                <li><Check size={15} /> Secret-pattern scan completed</li>
                <li><Check size={15} /> Dependency advisories checked</li>
                <li><Check size={15} /> Production domain verified</li>
                <li><Check size={15} /> Previously exposed key confirmed removed</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHeading
            eyebrow="Simple plans"
            title="Start free. Pay for the handoff."
            body="One-time launch reviews for client work, with monitoring when a project stays in active use."
          />
          <div className="pricing-grid">
            <article className="pricing-card">
              <p className="pricing-kicker">Free check</p>
              <h3>Public preview</h3>
              <div className="price">$0</div>
              <ul className="pricing-features">
                <li><Check size={14} /> Public repository</li>
                <li><Check size={14} /> Limited real checks</li>
                <li><Check size={14} /> Up to three findings</li>
              </ul>
              <ButtonLink href="/#free-check" variant="secondary">Run free check</ButtonLink>
            </article>
            <article className="pricing-card featured">
              <p className="pricing-kicker">Launch Pack</p>
              <h3>Complete handoff</h3>
              <div className="price">$49 <span>one time</span></div>
              <ul className="pricing-features">
                <li><Check size={14} /> Full repository scan</li>
                <li><Check size={14} /> All findings and fix prompts</li>
                <li><Check size={14} /> Rescan and printable report</li>
              </ul>
              <ButtonLink href="/signin?plan=launch_pack">Get Launch Pack</ButtonLink>
            </article>
            <article className="pricing-card">
              <p className="pricing-kicker">Monitoring</p>
              <h3>Watch one project</h3>
              <div className="price">$19 <span>/ project / month</span></div>
              <ul className="pricing-features">
                <li><Check size={14} /> Weekly and push rescans</li>
                <li><Check size={14} /> Regression-only alerts</li>
                <li><Check size={14} /> Scan-to-scan differences</li>
              </ul>
              <ButtonLink href="/signin?plan=monitoring" variant="secondary">Add monitoring</ButtonLink>
            </article>
            <article className="pricing-card">
              <p className="pricing-kicker">Agency</p>
              <h3>Client workspace</h3>
              <div className="price">$99 <span>/ month</span></div>
              <ul className="pricing-features">
                <li><Check size={14} /> 10 active projects</li>
                <li><Check size={14} /> Agency name and logo</li>
                <li><Check size={14} /> Client-safe share links</li>
              </ul>
              <ButtonLink href="/signin?plan=agency" variant="secondary">Start Agency</ButtonLink>
            </article>
          </div>
        </div>
      </section>

      <section className="section section-tinted">
        <div className="container trust-grid">
          <SectionHeading
            eyebrow="Security and privacy"
            title="Designed to inspect less and retain less."
            body="RepoSec is intentionally defensive. The worker receives a short-lived snapshot, never executes it, redacts findings before storage, and removes the source workspace after every scan."
          />
          <div className="trust-list">
            <div className="trust-list-item">
              <EyeOff size={19} />
              <div><h3>Secrets stay secret</h3><p>Raw detected values are replaced with a type, partial fingerprint, and redaction marker before database insertion.</p></div>
            </div>
            <div className="trust-list-item">
              <Code2 size={19} />
              <div><h3>Customer code is never run</h3><p>No package installation, build, test, script, container, binary, or repository-provided command is executed.</p></div>
            </div>
            <div className="trust-list-item">
              <Fingerprint size={19} />
              <div><h3>Auditable results</h3><p>Machine evidence is immutable. Status changes, dismissals, and admin wording overrides are recorded separately.</p></div>
            </div>
            <div className="trust-list-item">
              <ShieldCheck size={19} />
              <div><h3>Read-only GitHub access</h3><p>Private scans use minimum-permission, short-lived installation tokens. The MVP never requests repository write access.</p></div>
            </div>
          </div>
          <div className="scope-note">
            <h3>What this is—and is not</h3>
            <p>RepoSec is a launch-readiness aid, not a penetration test, warranty, certification, or substitute for an architecture review.</p>
            <ul>
              <li>Passive checks only for deployed sites</li>
              <li>No browser exploitation or active probing</li>
              <li>No claim that a project is “secure”</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHeading eyebrow="FAQ" title="Questions before you connect a repository" centered />
          <div className="faq-list">
            {faq.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="final-cta">
        <div className="container final-cta-inner">
          <Bot size={28} aria-hidden="true" />
          <h2>Give your coding agent a better final checklist.</h2>
          <p>Start with a public repository. RepoSec will show what it checked, what it found, and what it could not verify.</p>
          <ButtonLink href="/#free-check" size="large">
            Run a free launch check <ArrowRight size={18} />
          </ButtonLink>
        </div>
      </section>
    </PublicPage>
  );
}
