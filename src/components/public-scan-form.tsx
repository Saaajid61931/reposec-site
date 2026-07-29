"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowRight, CircleAlert } from "lucide-react";
import { Github } from "@/components/github-icon";
import { Button } from "@/components/ui";

export function PublicScanForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const data = new FormData(event.currentTarget);
    const payload = {
      repositoryUrl: data.get("repositoryUrl"),
      siteUrl: data.get("siteUrl") || undefined,
      authorized: data.get("authorized") === "on",
    };

    try {
      const response = await fetch("/api/public-scans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { token?: string; error?: string };

      if (!response.ok || !result.token) {
        throw new Error(result.error ?? "The scan could not be started.");
      }

      router.push(`/scan/${encodeURIComponent(result.token)}`);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "The scan could not be started.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="scan-form" onSubmit={submit}>
      <div className="field-group">
        <label htmlFor="repositoryUrl">Public GitHub repository</label>
        <div className="input-with-icon">
          <Github size={18} aria-hidden="true" />
          <input
            id="repositoryUrl"
            name="repositoryUrl"
            type="url"
            inputMode="url"
            placeholder="https://github.com/owner/repository"
            pattern="https://github\.com/[^/]+/[^/]+/?"
            autoComplete="url"
            required
          />
        </div>
      </div>
      <div className="field-group optional-field">
        <label htmlFor="siteUrl">Public root URL <span>optional</span></label>
        <input
          id="siteUrl"
          name="siteUrl"
          type="url"
          inputMode="url"
          placeholder="https://your-app.com"
          autoComplete="url"
        />
        <p>Unverified checks request the root page only. Deeper checks require domain verification.</p>
      </div>
      <label className="checkbox-row">
        <input name="authorized" type="checkbox" required />
        <span>I own this target or have permission to run defensive checks on it.</span>
      </label>
      {error && (
        <p className="form-error" role="alert">
          <CircleAlert size={16} aria-hidden="true" /> {error}
        </p>
      )}
      <Button className="scan-submit" size="large" type="submit" disabled={pending}>
        {pending ? "Starting check…" : "Run a free launch check"}
        {!pending && <ArrowRight size={18} aria-hidden="true" />}
      </Button>
      <p className="form-footnote">No code is executed. Public repositories only. Rate limits apply.</p>
    </form>
  );
}
