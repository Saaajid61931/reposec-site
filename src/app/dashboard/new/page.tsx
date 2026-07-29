import type { Metadata } from "next";
import { NewProjectForm } from "@/components/new-project-form";
import { requireUser } from "@/lib/auth";
import { getOrganizations } from "@/lib/data";
import { serverEnv } from "@/lib/env";

export const metadata: Metadata = { title: "New project" };

export default async function NewProjectPage() {
  const user = await requireUser();
  const organizations = await getOrganizations(user.id);
  const githubAppSlug = serverEnv().GITHUB_APP_SLUG;

  return (
    <>
      <header className="dashboard-header compact">
        <div>
          <p className="eyebrow">New project</p>
          <h1>What are you preparing to ship?</h1>
          <p>RepoSec will inspect the default branch without executing its code.</p>
        </div>
      </header>
      <NewProjectForm
        githubAppSlug={githubAppSlug}
        organizations={organizations.map(({ id, name }) => ({ id, name }))}
      />
    </>
  );
}
