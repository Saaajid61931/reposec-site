"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui";

export function BillingPortalButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    setPending(true);
    setError(null);
    const response = await fetch("/api/stripe/portal", { method: "POST" });
    const result = (await response.json()) as { url?: string; error?: string };
    if (!response.ok || !result.url) {
      setError(result.error ?? "Billing portal could not be opened.");
      setPending(false);
      return;
    }
    window.location.assign(result.url);
  }

  return (
    <div>
      <Button disabled={pending} onClick={openPortal} variant="secondary">
        {pending ? "Opening portal…" : "Manage billing"} <ExternalLink size={14} />
      </Button>
      {error && <p className="form-error" role="alert" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}
