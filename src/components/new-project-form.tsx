"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowRight, CircleAlert, Globe2, ShieldCheck } from "lucide-react";
import { Github } from "@/components/github-icon";
import { Button } from "@/components/ui";

export function NewProjectForm({
  organizations,
  githubAppSlug,
}: {
  organizations: Array<{ id: string; name: string }>;
  githubAppSlug?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const data = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationId: data.get("organizationId"),
          name: data.get("name"),
          repositoryUrl: data.get("repositoryUrl"),
          siteUrl: data.get("siteUrl") || undefined,
          authorized: data.get("authorized") === "on",
        }),
      });
      const result = (await response.json()) as { projectId?: string; error?: string };
      if (!response.ok || !result.projectId) throw new Error(result.error ?? "Project could not be created.");
      router.push(`/dashboard/projects/${result.projectId}`);
      router.refresh();
    } catch (projectError) {
      setError(projectError instanceof Error ? projectError.message : "Project could not be created.");
      setPending(false);
    }
  }

  return (
    <form className="wizard-card" onSubmit={submit}>
      <div className="wizard-progress" aria-label="Project setup steps">
        <span className="active"><b>1</b> Project</span>
        <span><b>2</b> Verify</span>
        <span><b>3</b> Scan</span>
      </div>

      <div className="wizard-section">
        <div className="wizard-section-heading">
          <span className="wizard-icon"><Github size={18} /></span>
          <div><h2>Repository</h2><p>Start with a public repository URL. Private repositories become selectable after GitHub App installation.</p></div>
        </div>
        <div className="field-group">
          <label htmlFor="organizationId">Organization</label>
          <select id="organizationId" name="organizationId" defaultValue={organizations[0]?.id} required>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>{organization.name}</option>
            ))}
          </select>
        </div>
        <div className="field-group">
          <label htmlFor="name">Project name</label>
          <input id="name" name="name" maxLength={80} placeholder="Northstar client portal" required />
        </div>
        <div className="field-group">
          <label htmlFor="repositoryUrl">GitHub repository URL</label>
          <input
            id="repositoryUrl"
            name="repositoryUrl"
            type="url"
            placeholder="https://github.com/owner/repository"
            pattern="https://github\.com/[^/]+/[^/]+/?"
            required
          />
        </div>
        {githubAppSlug && organizations[0] && (
          <p className="inline-note">
            Private repository? <a href={`/api/github/install?organizationId=${encodeURIComponent(organizations[0].id)}`}>Install the read-only GitHub App</a>, then return to select it.
          </p>
        )}
      </div>

      <div className="wizard-section">
        <div className="wizard-section-heading">
          <span className="wizard-icon"><Globe2 size={18} /></span>
          <div><h2>Deployed site</h2><p>Optional now. Full site checks start only after DNS or well-known-file verification.</p></div>
        </div>
        <div className="field-group">
          <label htmlFor="siteUrl">Production root URL <span>optional</span></label>
          <input id="siteUrl" name="siteUrl" type="url" placeholder="https://app.example.com" />
        </div>
      </div>

      <label className="checkbox-row" style={{ fontSize: 13 }}>
        <input name="authorized" type="checkbox" required />
        <span>I own these targets or have explicit authorization from their owner to run RepoSec&apos;s defensive checks.</span>
      </label>

      <div className="permission-strip">
        <ShieldCheck size={17} />
        <span>RepoSec never executes repository code and never requests repository write access.</span>
      </div>

      {error && <p className="form-error" role="alert"><CircleAlert size={16} /> {error}</p>}

      <div className="wizard-actions">
        <Button disabled={pending} size="large" type="submit">
          {pending ? "Creating project…" : "Create project"} {!pending && <ArrowRight size={17} />}
        </Button>
      </div>
    </form>
  );
}
