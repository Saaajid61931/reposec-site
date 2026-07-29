"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import type { FindingStatus } from "@/lib/types";

export function FindingStatusControl({
  findingId,
  currentStatus,
}: {
  findingId: string;
  currentStatus: FindingStatus;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<FindingStatus>(currentStatus);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setPending(true);
    setMessage(null);
    const response = await fetch(`/api/findings/${findingId}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status, reason }),
    });
    const result = (await response.json()) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setMessage(result.error ?? "Status could not be updated.");
      return;
    }
    setMessage("Status saved in the audit trail.");
    router.refresh();
  }

  return (
    <section className="detail-block no-print">
      <h2>Update status</h2>
      <div className="field-group" style={{ marginTop: 12 }}>
        <label htmlFor="finding-status">Status</label>
        <select id="finding-status" value={status} onChange={(event) => setStatus(event.target.value as FindingStatus)}>
          <option value="open">Open</option>
          <option value="fixed">Marked fixed</option>
          <option value="dismissed">Dismissed as false positive</option>
          <option value="accepted">Risk accepted</option>
        </select>
      </div>
      <div className="field-group">
        <label htmlFor="finding-reason">Reason {status === "open" ? "or note" : "(required)"}</label>
        <textarea
          id="finding-reason"
          maxLength={1000}
          onChange={(event) => setReason(event.target.value)}
          placeholder="What changed, or why is this result being dismissed?"
          rows={4}
          value={reason}
        />
      </div>
      <Button disabled={pending || (status !== "open" && reason.trim().length < 8)} onClick={save} size="small">
        {pending ? "Saving…" : "Save status"}
      </Button>
      {message && <p style={{ marginTop: 9 }}>{message}</p>}
    </section>
  );
}
