import type { Metadata } from "next";
import { UserRound } from "lucide-react";
import { DeleteAccountButton } from "@/components/danger-actions";
import { InviteMemberForm, OrganizationSettingsForm } from "@/components/organization-settings";
import { requireUser } from "@/lib/auth";
import { getOrganizations } from "@/lib/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Organization" };

export default async function OrganizationPage() {
  const user = await requireUser();
  const organizations = await getOrganizations(user.id);
  const organization = organizations[0]!;
  const supabase = await createServerSupabaseClient();
  const { data: members } = supabase
    ? await supabase
        .from("organization_members")
        .select("id,role,created_at,users!inner(id,email,display_name,avatar_url)")
        .eq("organization_id", organization.id)
        .order("created_at")
    : { data: [] };

  return (
    <>
      <header className="dashboard-header compact">
        <div><p className="eyebrow">Organization</p><h1>{organization.name}</h1><p>Manage members and the optional agency identity used on private client reports.</p></div>
      </header>

      <div className="settings-grid">
        <section className="settings-card">
          <div className="dashboard-section-heading"><div><h2>Workspace settings</h2><p>Agency fields require an active Agency entitlement to appear on generated reports.</p></div></div>
          <OrganizationSettingsForm
            initialAgencyName={organization.agencyName ?? ""}
            initialLogoUrl={organization.logoUrl ?? ""}
            initialName={organization.name}
            organizationId={organization.id}
          />
        </section>

        <section className="settings-card">
          <div className="dashboard-section-heading"><div><h2>Invite a member</h2><p>Invitations expire and do not grant access until accepted by the addressed account.</p></div></div>
          <InviteMemberForm organizationId={organization.id} />
        </section>
      </div>

      <section className="dashboard-section">
        <div className="dashboard-section-heading"><div><h2>Members</h2><p>Organization membership controls every project and report query through Row Level Security.</p></div></div>
        <div className="member-list">
          {(members ?? []).map((membership) => {
            const member = membership.users as unknown as { id: string; email: string; display_name: string | null };
            return (
              <div key={membership.id as string}>
                <span className="member-avatar"><UserRound size={16} /></span>
                <span><strong>{member.display_name ?? member.email}</strong><small>{member.email}</small></span>
                <span className="badge badge-neutral">{String(membership.role)}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="settings-card danger-zone">
        <div className="dashboard-section-heading"><div><h2>Delete account</h2><p>Personal data and sole-owner workspaces are queued for deletion. GitHub installations are revoked where possible.</p></div></div>
        <DeleteAccountButton email={user.email ?? ""} />
      </section>
    </>
  );
}
