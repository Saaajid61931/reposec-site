import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Ban, CircleDollarSign, ListChecks, ScanLine, UsersRound } from "lucide-react";
import { AdminActionButton, GrantCreditForm } from "@/components/admin-actions";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SeverityBadge } from "@/components/ui";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  await requireAdmin();
  const supabase = await createServerSupabaseClient();
  const [
    scansCount,
    failuresCount,
    usersCount,
    { data: failedComponents },
    { data: findings },
    { data: purchases },
    { data: users },
    { data: auditEvents },
  ] = await Promise.all([
    supabase!.from("scans").select("id", { count: "exact", head: true }),
    supabase!.from("scan_jobs").select("id", { count: "exact", head: true }).in("status", ["failed", "dead"]),
    supabase!.from("users").select("id", { count: "exact", head: true }),
    supabase!.from("scan_components").select("id,scan_id,scanner,status,error_code,created_at").in("status", ["failed", "timed_out"]).order("created_at", { ascending: false }).limit(20),
    supabase!.from("findings").select("id,title,severity,confidence,rule_id,project_id,created_at").order("created_at", { ascending: false }).limit(20),
    supabase!.from("purchases").select("id,organization_id,status,amount_cents,currency,created_at").order("created_at", { ascending: false }).limit(12),
    supabase!.from("users").select("id,email,display_name,suspended_at,created_at").order("created_at", { ascending: false }).limit(12),
    supabase!.from("audit_events").select("id,actor_type,action,target_type,target_id,created_at").order("created_at", { ascending: false }).limit(25),
  ]);

  return (
    <>
      <header className="dashboard-header compact">
        <div><p className="eyebrow">Platform administration</p><h1>Scanner operations and audit</h1><p>Administrative changes are append-only overrides. Original machine evidence is never edited.</p></div>
      </header>

      <div className="summary-grid">
        <div className="summary-card"><span><ScanLine size={17} /> Scans</span><strong>{scansCount.count ?? 0}</strong><small>All recorded scan attempts</small></div>
        <div className="summary-card"><span><AlertTriangle size={17} /> Failed jobs</span><strong>{failuresCount.count ?? 0}</strong><small>Failed or dead durable jobs</small></div>
        <div className="summary-card"><span><UsersRound size={17} /> Users</span><strong>{usersCount.count ?? 0}</strong><small>Account profiles</small></div>
      </div>

      <div className="admin-grid">
        <section className="settings-card">
          <div className="dashboard-section-heading"><div><h2>Failed scanner components</h2><p>Re-run the full scan after a component failure so every result belongs to one consistent repository snapshot.</p></div></div>
          <div className="admin-list">
            {(failedComponents ?? []).length === 0 ? <p className="inline-note">No failed components.</p> : (failedComponents ?? []).map((component) => (
              <div key={component.id as string}>
                <span><strong>{String(component.scanner)}</strong><small>{String(component.status)} · {String(component.error_code ?? "no error code")}</small></span>
                <AdminActionButton label="Re-run scan" payload={{ action: "rerun_component", componentId: component.id as string }} />
              </div>
            ))}
          </div>
        </section>

        <section className="settings-card">
          <div className="dashboard-section-heading"><div><h2>Grant report credit</h2><p>Credits are separate from Stripe purchases and always require an audit reason.</p></div></div>
          <GrantCreditForm />
        </section>
      </div>

      <section className="dashboard-section">
        <div className="dashboard-section-heading"><div><h2>Recent findings</h2><p>Review classification or append customer-facing wording without changing machine text.</p></div></div>
        <div className="project-table">
          {(findings ?? []).map((finding) => (
            <Link className="admin-finding-row" href={`/dashboard/admin/findings/${finding.id as string}`} key={finding.id as string}>
              <SeverityBadge severity={finding.severity as "critical" | "high" | "medium" | "low" | "info"} />
              <span><strong>{String(finding.title)}</strong><small>{String(finding.rule_id)} · {String(finding.confidence)} confidence</small></span>
              <ArrowRight size={15} />
            </Link>
          ))}
        </div>
      </section>

      <div className="admin-grid">
        <section className="dashboard-section">
          <div className="dashboard-section-heading"><div><h2>Recent purchases</h2><p>Refunds call Stripe and revoke the linked entitlement.</p></div></div>
          <div className="admin-list">
            {(purchases ?? []).map((purchase) => (
              <div key={purchase.id as string}>
                <CircleDollarSign size={16} />
                <span><strong>{String(purchase.currency).toUpperCase()} {(Number(purchase.amount_cents) / 100).toFixed(2)}</strong><small>{String(purchase.status)}</small></span>
                {purchase.status !== "refunded" && (
                  <AdminActionButton
                    confirm="Issue this refund in Stripe and revoke its report entitlement?"
                    label="Refund"
                    payload={{ action: "refund_purchase", purchaseId: purchase.id as string }}
                    variant="danger"
                  />
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="dashboard-section">
          <div className="dashboard-section-heading"><div><h2>Recent users</h2><p>Suspension blocks authentication and organization access.</p></div></div>
          <div className="admin-list">
            {(users ?? []).map((user) => (
              <div key={user.id as string}>
                <Ban size={16} />
                <span><strong>{String(user.display_name ?? user.email)}</strong><small>{String(user.email)} · {user.suspended_at ? "suspended" : "active"}</small></span>
                {user.suspended_at ? (
                  <AdminActionButton label="Unsuspend" payload={{ action: "unsuspend_user", userId: user.id as string }} />
                ) : (
                  <AdminActionButton
                    confirm="Suspend this user for abuse? A fixed audit reason will be recorded."
                    label="Suspend"
                    payload={{ action: "suspend_user", userId: user.id as string, reason: "Manual platform-admin suspension for suspected abuse." }}
                    variant="danger"
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="dashboard-section">
        <div className="dashboard-section-heading"><div><h2>Immutable audit trail</h2><p>Rows cannot be updated or deleted, including by normal platform-admin flows.</p></div></div>
        <div className="audit-list">
          {(auditEvents ?? []).map((event) => (
            <div key={event.id as string}>
              <ListChecks size={15} />
              <span><strong>{String(event.action)}</strong><small>{String(event.actor_type)} · {String(event.target_type)} {String(event.target_id ?? "")}</small></span>
              <time>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.created_at as string))}</time>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
