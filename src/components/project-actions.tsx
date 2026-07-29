"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CircleAlert, Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";

export function StartScanButton({
  projectId,
  isRescan = false,
}: {
  projectId: string;
  isRescan?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/scans`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trigger: isRescan ? "manual_rescan" : "manual" }),
      });
      const result = (await response.json()) as { scanId?: string; error?: string };
      if (!response.ok || !result.scanId) throw new Error(result.error ?? "Scan could not be started.");
      router.push(`/dashboard/projects/${projectId}/scans/${result.scanId}`);
      router.refresh();
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Scan could not be started.");
      setPending(false);
    }
  }

  return (
    <div>
      <Button disabled={pending} onClick={start}>
        {pending ? <RefreshCw className="spin" size={15} /> : <Play size={15} />}
        {pending ? "Queueing scan…" : isRescan ? "Run rescan" : "Run launch check"}
      </Button>
      {error && <p className="form-error" role="alert" style={{ marginTop: 8 }}><CircleAlert size={15} /> {error}</p>}
    </div>
  );
}

export function ScanAutoRefresh({ terminal }: { terminal: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (terminal) return;
    const timer = window.setInterval(() => router.refresh(), 4000);
    return () => window.clearInterval(timer);
  }, [router, terminal]);

  return null;
}
