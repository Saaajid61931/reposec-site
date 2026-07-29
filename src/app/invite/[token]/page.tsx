import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AcceptInvitationButton } from "@/components/accept-invitation-button";
import { Logo } from "@/components/logo";
import { currentUser } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { sha256 } from "@/lib/security/crypto";

export const metadata: Metadata = { title: "Organization invitation", robots: { index: false, follow: false } };

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const user = await currentUser();
  if (!user) redirect(`/signin?next=${encodeURIComponent(`/invite/${token}`)}`);

  const admin = createAdminSupabaseClient();
  const { data: invitation } = await admin
    .from("organization_invitations")
    .select("email,role,expires_at,accepted_at,organizations!inner(name)")
    .eq("token_hash", sha256(token))
    .maybeSingle();
  const valid = invitation
    && !invitation.accepted_at
    && new Date(invitation.expires_at as string) > new Date()
    && (user.email ?? "").toLowerCase() === String(invitation.email).toLowerCase();
  const organization = invitation?.organizations as unknown as { name: string } | undefined;

  return (
    <main className="auth-panel" style={{ minHeight: "100vh" }}>
      <div className="auth-card">
        <Logo />
        <div style={{ marginTop: 45 }}>
          <p className="eyebrow">Organization invitation</p>
          <h1>{valid ? `Join ${organization?.name}` : "Invitation unavailable"}</h1>
          <p>
            {valid
              ? `You are signed in as ${user.email} and will join as ${String(invitation.role)}.`
              : "This invitation is invalid, expired, already accepted, or addressed to a different email."}
          </p>
          {valid && <AcceptInvitationButton token={token} />}
        </div>
      </div>
    </main>
  );
}
