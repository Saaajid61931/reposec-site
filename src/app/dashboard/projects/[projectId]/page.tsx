import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarClock, GitCompareArrows, Globe2, Radio, Settings, ShieldCheck } from "lucide-react";
import { DomainVerification } from "@/components/domain-verification";
import { Github } from "@/components/github-icon";
import { StartScanButton } from "@/components/project-actions";
import { ButtonLink, VerdictBadge } from "@/components/ui";
import { getProject } from "@/lib/data";

export const metadata: Metadata = { title: "Project overview" };

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProject(projectId);

  return (
    <>
      <header className="dashboard-header project-header">
        <div>
          <p className="eyebrow">Project</p>
          <h1>{project.name}</h1>
          <p>{project.repository?.fullName ?? "Repository not connected"}</p>
        </div>
        <div className="dashboard-actions">
          <ButtonLink href={`/dashboard/projects/${project.id}/settings`} variant="secondary">
            <Settings size={15} /> Settings
          </ButtonLink>
          {project.scans.length > 1 && (
            <ButtonLink href={`/dashboard/projects/${project.id}/compare`} variant="secondary">
              <GitCompareArrows size={15} /> Compare scans
            </ButtonLink>
          )}
          <StartScanButton isRescan={project.scans.length > 0} projectId={project.id} />
        </div>
      </header>

      <div className="project-overview-grid">
        <section className="project-primary">
          <article className="surface-card latest-result-card">
            <div className="card-heading-row">
              <div><p className="eyebrow">Latest result</p><h2>Launch-readiness report</h2></div>
              {project.latestScan?.verdict ? <VerdictBadge verdict={project.latestScan.verdict} /> : <span className="badge badge-neutral">Not scanned</span>}
            </div>
            {project.latestScan ? (
              <>
                <p>
                  {project.latestScan.status === "completed"
                    ? "Automated checks completed. Review the scope and prioritized findings before changing launch status."
                    : `This scan is currently ${project.latestScan.status}.`}
                </p>
                <ButtonLink href={`/dashboard/projects/${project.id}/scans/${project.latestScan.id}`} size="small" variant="secondary">
                  Open latest scan <ArrowRight size={14} />
                </ButtonLink>
              </>
            ) : (
              <p>Run the first launch check to establish scanner coverage and a baseline for future comparisons.</p>
            )}
          </article>

          <section className="dashboard-section">
            <div className="dashboard-section-heading"><div><h2>Scan history</h2><p>Machine results are immutable; status changes are audited separately.</p></div></div>
            {project.scans.length > 0 ? (
              <div className="scan-history">
                {project.scans.map((scan) => (
                  <Link href={`/dashboard/projects/${project.id}/scans/${scan.id}`} key={scan.id}>
                    <span className="scan-history-icon"><ShieldCheck size={16} /></span>
                    <span><strong>{scan.trigger.replaceAll("_", " ")}</strong><small>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(scan.createdAt))}</small></span>
                    <span>{scan.verdict ? <VerdictBadge verdict={scan.verdict} /> : <span className="badge badge-neutral">{scan.status}</span>}</span>
                    <ArrowRight size={15} />
                  </Link>
                ))}
              </div>
            ) : <p className="inline-note">No scans have been run for this project.</p>}
          </section>
        </section>

        <aside className="project-aside">
          <article className="surface-card">
            <h3><Github size={16} /> Repository</h3>
            <p>{project.repository?.fullName ?? "Not connected"}</p>
            <dl className="mini-meta">
              <div><dt>Visibility</dt><dd>{project.repository?.visibility ?? "—"}</dd></div>
              <div><dt>Access</dt><dd>Read only</dd></div>
            </dl>
          </article>

          <article className="surface-card">
            <h3><Globe2 size={16} /> Deployed site</h3>
            {project.site ? (
              <>
                <p>{project.site.hostname}</p>
                <DomainVerification
                  hostname={project.site.hostname}
                  projectId={project.id}
                  siteId={project.site.id}
                  verified={Boolean(project.site.verifiedAt)}
                />
              </>
            ) : <p>No deployed target added.</p>}
          </article>

          <article className="surface-card">
            <h3><Radio size={16} /> Monitoring</h3>
            <p>{project.monitoringEnabled ? "Weekly and selected push rescans are active." : "Monitoring is not active for this project."}</p>
            {!project.monitoringEnabled && <ButtonLink href={`/dashboard/billing?plan=monitoring&project=${project.id}`} size="small" variant="secondary">Add monitoring</ButtonLink>}
          </article>

          <article className="surface-card">
            <h3><CalendarClock size={16} /> Created</h3>
            <p>{new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(new Date(project.createdAt))}</p>
          </article>
        </aside>
      </div>
    </>
  );
}
