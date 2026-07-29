"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui";

type CheckoutPlan = "launch_pack" | "monitoring" | "agency";

export function CheckoutButton({
  plan,
  projectId,
  label,
  variant = "primary",
}: {
  plan: CheckoutPlan;
  projectId?: string;
  label: string;
  variant?: "primary" | "secondary";
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkout() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan, projectId }),
      });
      const result = (await response.json()) as { url?: string; error?: string };
      if (response.status === 401) {
        window.location.assign(`/signin?plan=${plan}`);
        return;
      }
      if (!response.ok || !result.url) throw new Error(result.error ?? "Checkout could not be started.");
      window.location.assign(result.url);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Checkout could not be started.");
      setPending(false);
    }
  }

  return (
    <div>
      <Button disabled={pending} onClick={checkout} variant={variant}>
        {pending ? "Opening checkout…" : label} {!pending && <ArrowRight size={15} />}
      </Button>
      {error && <p className="form-error" role="alert" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}
