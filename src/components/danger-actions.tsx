"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";

export function DeleteProjectButton({ projectId, projectName }: { projectId: string; projectName: string }) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setPending(true);
    const response = await fetch(`/api/projects/${projectId}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmation }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(result.error ?? "Project could not be deleted.");
      setPending(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div>
      <div className="field-group">
        <label htmlFor="delete-project-confirmation">Type {projectName} to confirm</label>
        <input id="delete-project-confirmation" onChange={(event) => setConfirmation(event.target.value)} value={confirmation} />
      </div>
      <Button disabled={confirmation !== projectName || pending} onClick={remove} variant="danger">
        {pending ? "Deleting…" : "Delete project and retained findings"}
      </Button>
      {error && <p className="form-error" role="alert" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}

export function DeleteAccountButton({ email }: { email: string }) {
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setPending(true);
    const response = await fetch("/api/account", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmation }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(result.error ?? "Account could not be deleted.");
      setPending(false);
      return;
    }
    window.location.assign("/");
  }

  return (
    <div>
      <div className="field-group">
        <label htmlFor="delete-account-confirmation">Type {email} to confirm</label>
        <input id="delete-account-confirmation" onChange={(event) => setConfirmation(event.target.value)} value={confirmation} />
      </div>
      <Button disabled={confirmation !== email || pending} onClick={remove} variant="danger">
        {pending ? "Deleting…" : "Delete account"}
      </Button>
      {error && <p className="form-error" role="alert" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}
