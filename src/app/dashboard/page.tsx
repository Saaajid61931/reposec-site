import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarClock, FolderKanban, Plus } from "lucide-react";
import { EmptyState, ButtonLink, VerdictBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getProjects } from "@/lib/data";

export const metadata: Metadata = { title: "Projects" };

export default async function DashboardPage() {
  const user = await requireUser();
  const projects = await getProjects();
  const firstName = (user.user_metadata.full_name as string | undefined)?.split(" ")[0] ?? "there";

  return (
    <>
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Workspace overview</p>
          <h1>Good to see you, {firstName}.</h1>
          <p>Review active launch checks and projects that need attention.</p>
        </div>
        <ButtonLink href="/dashboard/new"><Plus size={16} /> New project</ButtonLink>
      </header>

      {projects.length === 0 ? (
        <EmptyState
          title="Create your first launch check"
          body="Connect a repository, optionally verify a deployed site, and RepoSec will keep every finding tied to redacted evidence."
          action={<ButtonLink href="/dashboard/new">Create project <ArrowRight size={16} /></ButtonLink>}
        />
      ) : (
        <>
          <div className="summary-grid">
            <div className="summary-card">
              <span><FolderKanban size={17} /> Active projects</span>
              <strong>{projects.filter((project) => project.status === "active").length}</strong>
              <small>Projects in this workspace</small>
            </div>
            <div className="summary-card">
              <span><CalendarClock size={17} /> Needs attention</span>
              <strong>{projects.filter((project) => project.latestScan?.verdict === "BLOCKED" || project.latestScan?.verdict === "NEEDS WORK").length}</strong>
              <small>Based on latest completed scans</small>
            </div>
            <div className="summary-card">
              <span><CalendarClock size={17} /> Scans in progress</span>
              <strong>{projects.filter((project) => project.latestScan?.status === "queued" || project.latestScan?.status === "running").length}</strong>
              <small>Queued or currently processing</small>
            </div>
          </div>

          <section className="dashboard-section">
            <div className="dashboard-section-heading">
              <div><h2>Projects</h2><p>Latest scan state for repositories you can access.</p></div>
            </div>
            <div className="project-table">
              <div className="project-table-head">
                <span>Project</span><span>Repository</span><span>Last result</span><span>Updated</span><span />
              </div>
              {projects.map((project) => (
                <Link className="project-table-row" href={`/dashboard/projects/${project.id}`} key={project.id}>
                  <span><strong>{project.name}</strong><small>{project.status}</small></span>
                  <span><strong>{project.repository?.fullName ?? "Not connected"}</strong><small>{project.repository?.visibility ?? "—"}</small></span>
                  <span>{project.latestScan?.verdict ? <VerdictBadge verdict={project.latestScan.verdict} /> : <span className="badge badge-neutral">Not scanned</span>}</span>
                  <span>{project.latestScan?.completedAt ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(project.latestScan.completedAt)) : "—"}</span>
                  <ArrowRight size={16} />
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}
