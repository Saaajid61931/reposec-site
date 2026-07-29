import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { CopyPromptButton } from "@/components/copy-prompt-button";
import { ButtonLink, ConfidenceBadge, SeverityBadge } from "@/components/ui";
import type { ReportFinding } from "@/lib/types";

export function FindingView({
  finding,
  backHref,
}: {
  finding: ReportFinding;
  backHref: string;
}) {
  return (
    <>
      <ButtonLink className="no-print" href={backHref} size="small" variant="quiet">
        <ArrowLeft size={15} /> Back to report
      </ButtonLink>
      <div className="finding-detail" style={{ marginTop: 20 }}>
        <div className="finding-detail-main">
          <section className="detail-block">
            <div style={{ display: "flex", gap: 7, marginBottom: 12 }}>
              <SeverityBadge severity={finding.severity} />
              <ConfidenceBadge confidence={finding.confidence} />
            </div>
            <h1 style={{ margin: "0 0 7px", fontFamily: "var(--font-serif)", fontSize: 34, lineHeight: 1.1 }}>
              {finding.title}
            </h1>
            <p>{finding.explanation}</p>
          </section>

          <section className="detail-block">
            <h2>Realistic impact</h2>
            <p>{finding.impact}</p>
          </section>

          <section className="detail-block">
            <h2>Redacted evidence</h2>
            {(finding.evidence.filePath || finding.evidence.line) && (
              <p>{finding.evidence.filePath}{finding.evidence.line ? `:${finding.evidence.line}` : ""}</p>
            )}
            <pre className="evidence">{finding.evidence.excerpt}</pre>
          </section>

          <section className="detail-block">
            <h2>Recommended remediation</h2>
            <p>{finding.remediation}</p>
          </section>

          <section className="detail-block prompt-block">
            <div className="prompt-block-header">
              <h3>Copy-ready fix prompt</h3>
              <CopyPromptButton prompt={finding.fixPrompt} />
            </div>
            <p className="prompt-text">{finding.fixPrompt}</p>
          </section>

          <section className="detail-block">
            <h2>How to verify the fix</h2>
            <p>{finding.verification}</p>
          </section>
        </div>

        <aside className="finding-detail-aside">
          <section className="detail-block">
            <h2>Finding details</h2>
            <div className="aside-list">
              <div><span>Rule</span><strong>{finding.ruleId}</strong></div>
              <div><span>Category</span><strong>{finding.category}</strong></div>
              <div><span>Status</span><strong>{finding.status}</strong></div>
              <div><span>Detection source</span><strong>{finding.detectionSource.join(", ")}</strong></div>
            </div>
          </section>
          <section className="detail-block">
            <h2>References</h2>
            {finding.references.map((reference) => (
              <p key={reference.url} style={{ marginBottom: 8 }}>
                <a href={reference.url} rel="noreferrer" target="_blank">
                  {reference.label} <ExternalLink size={12} style={{ display: "inline" }} />
                </a>
              </p>
            ))}
          </section>
          <section className="detail-block">
            <h2>False positive?</h2>
            <p>Paid reports let project members dismiss a finding with a required reason. The original machine result remains unchanged in the audit trail.</p>
          </section>
        </aside>
      </div>
    </>
  );
}
