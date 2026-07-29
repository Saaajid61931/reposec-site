import type { Metadata } from "next";
import { FreeScanStatus } from "@/components/free-scan-status";
import { PublicPage } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Free launch check",
  robots: { index: false, follow: false, nocache: true },
};

export default async function FreeScanPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <PublicPage>
      <div className="page-content">
        <div className="container">
          <FreeScanStatus token={token} />
        </div>
      </div>
    </PublicPage>
  );
}
