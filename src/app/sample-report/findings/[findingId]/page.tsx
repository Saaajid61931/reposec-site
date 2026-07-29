import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FindingView } from "@/components/finding-view";
import { PublicPage } from "@/components/site-shell";
import { sampleReport } from "@/lib/sample-report";

export const metadata: Metadata = {
  title: "Sample finding",
  robots: { index: false, follow: false },
};

export default async function SampleFindingPage({
  params,
}: {
  params: Promise<{ findingId: string }>;
}) {
  const { findingId } = await params;
  const finding = sampleReport.findings.find((item) => item.id === findingId);
  if (!finding) return notFound();

  return (
    <PublicPage>
      <div className="page-content" style={{ paddingTop: 52 }}>
        <div className="container">
          <div className="sample-banner">Sample data · no real repository or customer secret is shown.</div>
          <FindingView finding={finding} backHref="/sample-report" />
        </div>
      </div>
    </PublicPage>
  );
}
