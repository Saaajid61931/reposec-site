import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiHandler, ApiError, json, readJson } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { appUrl } from "@/lib/env";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { assertSameOrigin } from "@/lib/security/csrf";
import { randomToken, sha256 } from "@/lib/security/crypto";

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  role: z.enum(["admin", "member", "viewer"]),
}).strict();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const user = await currentUser();
    if (!user) throw new ApiError(401, "Sign in is required.");
    const input = await readJson(request, schema);
    const { organizationId } = await params;
    if (!z.string().uuid().safeParse(organizationId).success) throw new ApiError(404, "Organization not found.");

    const userClient = await createServerSupabaseClient();
    const { data: membership } = await userClient!
      .from("organization_members")
      .select("role,organizations!inner(name)")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .in("role", ["owner", "admin"])
      .maybeSingle();
    if (!membership) throw new ApiError(403, "Only an owner or admin can invite members.");

    const token = randomToken();
    const admin = createAdminSupabaseClient();
    const { data: invitation, error } = await admin.from("organization_invitations").insert({
      organization_id: organizationId,
      email: input.email,
      role: input.role,
      token_hash: sha256(token),
      invited_by: user.id,
      expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    }).select("id").single();
    if (error?.code === "23505") throw new ApiError(409, "A pending invitation already exists for this email.");
    if (error || !invitation) throw new Error("Invitation could not be recorded.");

    const organization = membership.organizations as unknown as { name: string };
    try {
      await sendEmail({
        to: input.email,
        organizationId,
        template: "organization_invitation",
        subject: `You were invited to ${organization.name} on RepoSec`,
        preheader: "Review and accept your RepoSec organization invitation.",
        heading: `Join ${organization.name} on RepoSec`,
        body: `You were invited as ${input.role}. Sign in using this exact email address before accepting. The invitation expires in seven days.`,
        actionLabel: "Review invitation",
        actionUrl: `${appUrl()}/invite/${token}`,
        dedupeKey: `organization-invite:${invitation.id}`,
      });
    } catch {
      await admin.from("organization_invitations").delete().eq("id", invitation.id);
      throw new Error("Invitation email could not be sent.");
    }
    return json({ invited: true }, { status: 201 });
  });
}
