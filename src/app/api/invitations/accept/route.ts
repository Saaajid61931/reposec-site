import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiHandler, ApiError, json, readJson } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { assertSameOrigin } from "@/lib/security/csrf";
import { sha256 } from "@/lib/security/crypto";

const schema = z.object({ token: z.string().min(30).max(100) }).strict();

export async function POST(request: NextRequest) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const user = await currentUser();
    if (!user) throw new ApiError(401, "Sign in is required.");
    const input = await readJson(request, schema);
    const admin = createAdminSupabaseClient();
    const { data: invitation } = await admin
      .from("organization_invitations")
      .select("id,organization_id,email,role,expires_at,accepted_at")
      .eq("token_hash", sha256(input.token))
      .maybeSingle();
    if (
      !invitation
      || invitation.accepted_at
      || new Date(invitation.expires_at as string) <= new Date()
      || String(invitation.email).toLowerCase() !== (user.email ?? "").toLowerCase()
    ) {
      throw new ApiError(400, "Invitation is invalid, expired, or addressed to a different email.");
    }

    const { error } = await admin.from("organization_members").upsert({
      organization_id: invitation.organization_id,
      user_id: user.id,
      role: invitation.role,
    }, { onConflict: "organization_id,user_id" });
    if (error) throw new Error("Membership could not be created.");
    await Promise.all([
      admin.from("organization_invitations").update({ accepted_at: new Date().toISOString() }).eq("id", invitation.id),
      admin.from("audit_events").insert({
        organization_id: invitation.organization_id,
        actor_user_id: user.id,
        actor_type: "user",
        action: "organization.invitation_accepted",
        target_type: "organization_member",
        target_id: user.id,
        after_state: { role: invitation.role },
      }),
    ]);
    return json({ accepted: true });
  });
}
