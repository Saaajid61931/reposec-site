import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DeleteProjectButton } from "@/components/danger-actions";
import { getProject } from "@/lib/data";

export const metadata: Metadata = { title: "Project settings" };

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProject(projectId);

  return (
    <>
      <div className="dashboard-breadcrumb"><Link href={`/dashboard/projects/${projectId}`}><ArrowLeft size={14} /> Project overview</Link></div>
      <header className="dashboard-header compact">
        <div><p className="eyebrow">Project settings</p><h1>{project.name}</h1><p>Privacy, repository access, and deletion controls.</p></div>
      </header>
      <section className="settings-card danger-zone">
        <div className="dashboard-section-heading"><div><h2>Delete project</h2><p>This removes retained findings, reports, share links, site targets, and queued scans. Repository source is never retained by RepoSec.</p></div></div>
        <DeleteProjectButton projectId={project.id} projectName={project.name} />
      </section>
    </>
  );
}
