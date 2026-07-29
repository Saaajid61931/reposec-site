"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, CircleDashed, TriangleAlert } from "lucide-react";
import { ButtonLink, SeverityBadge, VerdictBadge } from "@/components/ui";
import { FREE_SCAN_COMPONENTS } from "@/lib/scan-components";
import type { Severity, Verdict } from "@/lib/types";

interface FreeScanResult {
  status: "queued" | "running" | "completed" | "failed" | "expired";
  verdict?: Verdict;
  repository?: string;
  completedAt?: string;
  findings?: Array<{
    id: string;
    title: string;
    severity: Severity;
    explanation: string;
    evidence: string;
  }>;
  scope?: string[];
  error?: string;
}

export function FreeScanStatus({ token }: { token: string }) {
  const [result, setResult] = useState<FreeScanResult>({ status: "queued" });

  useEffect(() => {
    let active = true;
    let timer: number | undefined;

    async function load() {
      const response = await fetch(`/api/public-scans/${encodeURIComponent(token)}`, { cache: "no-store" });
      const body = (await response.json()) as FreeScanResult;
      if (!active) return;
      setResult(response.ok ? body : { status: "failed", error: body.error ?? "Scan status is unavailable." });
      if (response.ok && (body.status === "queued" || body.status === "running")) {
        timer = window.setTimeout(load, 4000);
      }
    }

    void load();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [token]);

  if (result.status === "queued" || result.status === "running") {
    return (
      <section className="scan-progress-card" style={{ marginInline: "auto" }}>
        <div className="scan-progress-header">
          <span className="scan-pulse" />
          <div>
            <p className="eyebrow">{result.status === "queued" ? "Waiting for worker" : "Limited check running"}</p>
            <h1>Reviewing the public repository snapshot…</h1>
            <p>No repository code, scripts, packages, builds, or tests are executed.</p>
          </div>
        </div>
        <div className="scan-stage-list">
          {FREE_SCAN_COMPONENTS.map((stage, index) => (
            <div className="scan-stage" key={stage}>
              {result.status === "running" && index === 0 ? <CircleDashed className="spin" size={18} /> : <CircleDashed size={18} />}
              <span><strong>{stage}</strong><small>Limited free-scan coverage</small></span>
              <span className="badge badge-neutral">{result.status}</span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (result.status === "failed" || result.status === "expired") {
    return (
      <section className="empty-state">
        <TriangleAlert size={24} color="var(--red)" />
        <h2>{result.status === "expired" ? "This free report has expired" : "The check did not complete"}</h2>
        <p>{result.error ?? "Required coverage was not completed, so RepoSec will not present a partial result as a finished scan."}</p>
        <ButtonLink href="/#free-check">Start another check</ButtonLink>
      </section>
    );
  }

  return (
    <div className="free-result">
      <section className="free-result-header">
        <div>
          <p className="eyebrow">Limited public check</p>
          {result.verdict && <VerdictBadge verdict={result.verdict} />}
          <h1>{result.repository}</h1>
          <p>Automated checks completed as of {result.completedAt ? new Intl.DateTimeFormat("en", { dateStyle: "long", timeStyle: "short" }).format(new Date(result.completedAt)) : "now"}.</p>
        </div>
        <CheckCircle2 size={28} color="var(--forest)" />
      </section>
      <section className="free-result-findings">
        <div className="report-section-heading"><h2>Findings preview</h2><p>Up to three findings are shown on the free check.</p></div>
        {(result.findings ?? []).length === 0 ? (
          <div className="success-banner"><CheckCircle2 size={16} /> No findings were observed in the limited scope. This does not mean the project is secure.</div>
        ) : (result.findings ?? []).map((finding) => (
          <article className="detail-block" key={finding.id}>
            <SeverityBadge severity={finding.severity} />
            <h3 style={{ marginTop: 10 }}>{finding.title}</h3>
            <p>{finding.explanation}</p>
            <pre className="evidence">{finding.evidence}</pre>
          </article>
        ))}
      </section>
      <section className="free-upgrade">
        <p className="eyebrow">Continue the launch review</p>
        <h2>Save the report and see the complete evidence.</h2>
        <p>The Launch Pack adds full scanner coverage, every prioritized finding, copy-ready fix prompts, verified site checks, rescan, comparison, and a printable client report.</p>
        <div>
          <ButtonLink href="/signin?next=/dashboard">Create free account</ButtonLink>
          <ButtonLink href="/pricing" variant="secondary">See Launch Pack</ButtonLink>
        </div>
      </section>
      <p className="free-disclaimer">This limited automated check is not a penetration test or security certification. It covers only the scope listed in the result and never proves that a project is secure.</p>
    </div>
  );
}
