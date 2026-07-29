import type { Metadata } from "next";
import { FindingStatusControl } from "@/components/finding-status-control";
import { FindingView } from "@/components/finding-view";
import { getFinding } from "@/lib/data";

export const metadata: Metadata = { title: "Finding detail" };

export default async function FindingDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; findingId: string }>;
}) {
  const { projectId, findingId } = await params;
  const finding = await getFinding(findingId);

  return (
    <>
      <FindingView finding={finding} backHref={`/dashboard/projects/${projectId}`} />
      <div style={{ maxWidth: 820, marginTop: 24 }}>
        <FindingStatusControl currentStatus={finding.status} findingId={finding.id} />
      </div>
    </>
  );
}
