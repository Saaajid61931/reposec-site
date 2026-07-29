import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, CircleDashed, Clock3, TriangleAlert } from "lucide-react";
import { PrintButton } from "@/components/print-button";
import { ReportView } from "@/components/report-view";
import { ScanAutoRefresh } from "@/components/project-actions";
import { ButtonLink } from "@/components/ui";
import { getScanComponents, getScanReport } from "@/lib/data";
import { SCAN_COMPONENTS } from "@/lib/scan-components";

export const metadata: Metadata = { title: "Scan report" };


export default async function ScanPage({
  params,
}: {
  params: Promise<{ projectId: string; scanId: string }>;
}) {
  const { projectId, scanId } = await params;
  const { scan, report } = await getScanReport(scanId);
  const terminal = ["completed", "failed", "canceled"].includes(scan.status);
  const components = report ? [] : await getScanComponents(scanId);

  return (
    <>
      <ScanAutoRefresh terminal={terminal} />
      <div className="dashboard-breadcrumb">
        <Link href={`/dashboard/projects/${projectId}`}><ArrowLeft size={14} /> Project overview</Link>
      </div>

      {report ? (
        <>
          <div className="report-actions no-print">
            <div>
              <p className="eyebrow">Completed scan</p>
              <p>Report fingerprint {report.fingerprint}</p>
            </div>
            <PrintButton />
          </div>
          <ReportView report={report} findingBasePath={`/dashboard/projects/${projectId}/findings`} />
        </>
      ) : (
        <section className="scan-progress-card">
          <div className="scan-progress-header">
            <span className={`scan-pulse ${terminal ? "failed" : ""}`} />
            <div>
              <p className="eyebrow">{terminal ? "Scan stopped" : "Scan in progress"}</p>
              <h1>{terminal ? "The required checks did not complete." : "Reviewing the repository snapshot…"}</h1>
              <p>
                {terminal
                  ? "The report is marked incomplete. No successful component is silently treated as full coverage."
                  : "The worker never installs dependencies or executes repository code."}
              </p>
            </div>
          </div>
          <div className="scan-stage-list">
            {SCAN_COMPONENTS.map((name) => {
              const component = components.find((item) => item.scanner === name);
              const status = component?.status ?? "queued";
              const Icon = status === "passed" ? CheckCircle2 : status === "failed" || status === "timed_out" ? TriangleAlert : status === "running" ? Clock3 : CircleDashed;
              return (
                <div className={`scan-stage ${status}`} key={name}>
                  <Icon size={18} />
                  <span><strong>{name}</strong><small>{component?.summary ?? (status === "queued" ? "Waiting for worker" : status)}</small></span>
                  <span className="badge badge-neutral">{status.replace("_", " ")}</span>
                </div>
              );
            })}
          </div>
          {terminal && (
            <ButtonLink href={`/dashboard/projects/${projectId}`} variant="secondary">
              Return to project
            </ButtonLink>
          )}
        </section>
      )}
    </>
  );
}
