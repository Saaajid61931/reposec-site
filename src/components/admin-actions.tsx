"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui";

type AdminAction =
  | { action: "rerun_component"; componentId: string }
  | { action: "refund_purchase"; purchaseId: string }
  | { action: "suspend_user"; userId: string; reason: string }
  | { action: "unsuspend_user"; userId: string };

export function AdminActionButton({
  payload,
  label,
  confirm,
  variant = "secondary",
}: {
  payload: AdminAction;
  label: string;
  confirm?: string;
  variant?: "secondary" | "danger";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (confirm && !window.confirm(confirm)) return;
    setPending(true);
    setError(null);
    const response = await fetch("/api/admin/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = (await response.json()) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setError(result.error ?? "Admin action failed.");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <Button disabled={pending} onClick={run} size="small" variant={variant}>{pending ? "Working…" : label}</Button>
      {error && <p className="form-error" role="alert" style={{ marginTop: 6 }}>{error}</p>}
    </div>
  );
}

export function GrantCreditForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const response = await fetch("/api/admin/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "grant_credit",
        organizationId: data.get("organizationId"),
        projectId: data.get("projectId") || undefined,
        credits: Number(data.get("credits")),
        reason: data.get("reason"),
      }),
    });
    const result = (await response.json()) as { error?: string };
    setPending(false);
    setMessage(response.ok ? "Report credit granted and audited." : result.error ?? "Credit could not be granted.");
    if (response.ok) {
      form.reset();
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="field-group"><label htmlFor="grant-org">Organization UUID</label><input id="grant-org" name="organizationId" required /></div>
      <div className="field-group"><label htmlFor="grant-project">Project UUID <span>optional restriction</span></label><input id="grant-project" name="projectId" /></div>
      <div className="field-group"><label htmlFor="grant-count">Credits</label><input defaultValue="1" id="grant-count" max="10" min="1" name="credits" type="number" /></div>
      <div className="field-group"><label htmlFor="grant-reason">Reason</label><textarea id="grant-reason" maxLength={1000} minLength={8} name="reason" required rows={3} /></div>
      <Button disabled={pending} type="submit">{pending ? "Granting…" : "Grant report credit"}</Button>
      {message && <p className="inline-note" role="status">{message}</p>}
    </form>
  );
}

export function FindingOverrideForm({
  findingId,
}: {
  findingId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const data = new FormData(event.currentTarget);
    const response = await fetch(`/api/admin/findings/${findingId}/overrides`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        classification: data.get("classification") || null,
        customerExplanation: data.get("customerExplanation") || null,
        customerRemediation: data.get("customerRemediation") || null,
        reason: data.get("reason"),
      }),
    });
    const result = (await response.json()) as { error?: string };
    setPending(false);
    setMessage(response.ok ? "Override appended. Original machine evidence is unchanged." : result.error ?? "Override could not be saved.");
    if (response.ok) router.refresh();
  }

  return (
    <form onSubmit={submit}>
      <div className="field-group">
        <label htmlFor="override-classification">Classification</label>
        <select defaultValue="" id="override-classification" name="classification">
          <option value="">No classification override</option>
          <option value="confirmed">Confirmed</option>
          <option value="false_positive">False positive</option>
          <option value="needs_review">Needs review</option>
        </select>
      </div>
      <div className="field-group"><label htmlFor="override-explanation">Customer-facing explanation</label><textarea id="override-explanation" maxLength={5000} name="customerExplanation" rows={5} /></div>
      <div className="field-group"><label htmlFor="override-remediation">Customer-facing remediation</label><textarea id="override-remediation" maxLength={5000} name="customerRemediation" rows={5} /></div>
      <div className="field-group"><label htmlFor="override-reason">Audit reason</label><textarea id="override-reason" maxLength={2000} minLength={8} name="reason" required rows={3} /></div>
      <Button disabled={pending} type="submit">{pending ? "Saving…" : "Append override"}</Button>
      {message && <p className="inline-note" role="status">{message}</p>}
    </form>
  );
}
