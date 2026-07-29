import type { Metadata } from "next";
import { CircleAlert } from "lucide-react";
import { PrintButton } from "@/components/print-button";
import { ReportView } from "@/components/report-view";
import { PublicPage } from "@/components/site-shell";
import { sampleReport } from "@/lib/sample-report";

export const metadata: Metadata = {
  title: "Sample launch-readiness report",
  description: "See how RepoSec explains launch blockers, redacted evidence, and copy-ready fix prompts.",
  alternates: { canonical: "/sample-report" },
};

export default function SampleReportPage() {
  return (
    <PublicPage>
      <section className="page-hero">
        <div className="container">
          <p className="eyebrow">Sample report</p>
          <h1>Evidence your client can understand.</h1>
          <p>A complete example of the Launch Pack output, using clearly labelled fictional project data.</p>
        </div>
      </section>
      <div className="page-content">
        <div className="container">
          <div className="sample-banner">
            <CircleAlert size={17} aria-hidden="true" />
            <span><strong>Sample data:</strong> This report is illustrative. It is not the result of a scan against the linked example domains or repository.</span>
          </div>
          <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
            <PrintButton />
          </div>
          <ReportView report={sampleReport} findingBasePath="/sample-report/findings" />
        </div>
      </div>
    </PublicPage>
  );
}
