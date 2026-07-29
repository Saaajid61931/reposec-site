"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

export function AcceptInvitationButton({ token }: { token: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setPending(true);
    setError(null);
    const response = await fetch("/api/invitations/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(result.error ?? "Invitation could not be accepted.");
      setPending(false);
      return;
    }
    window.location.assign("/dashboard");
  }

  return (
    <>
      <Button disabled={pending} onClick={accept} size="large">{pending ? "Joining…" : "Accept invitation"}</Button>
      {error && <p className="form-error" role="alert" style={{ marginTop: 12 }}>{error}</p>}
    </>
  );
}
