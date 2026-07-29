import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiHandler, ApiError, json, readJson } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { assertSameOrigin } from "@/lib/security/csrf";
import { revokeInstallation } from "@/lib/github";

const schema = z.object({ confirmation: z.string().email() }).strict();

export async function DELETE(request: NextRequest) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const user = await currentUser();
    if (!user) throw new ApiError(401, "Sign in is required.");
    const input = await readJson(request, schema);
    if (input.confirmation.toLowerCase() !== (user.email ?? "").toLowerCase()) {
      throw new ApiError(400, "Email confirmation does not match.");
    }

    const admin = createAdminSupabaseClient();
    const { data: ownedOrganizations } = await admin
      .from("organizations")
      .select("id,name,organization_members(user_id),github_installations(installation_id)")
      .eq("owner_id", user.id);
    for (const organization of ownedOrganizations ?? []) {
      const members = organization.organization_members as unknown as Array<{ user_id: string }>;
      if (members.some((member) => member.user_id !== user.id)) {
        throw new ApiError(409, `Transfer ownership of ${organization.name as string} before deleting your account.`);
      }
    }

    for (const organization of ownedOrganizations ?? []) {
      const installations = organization.github_installations as unknown as Array<{ installation_id: number }>;
      for (const installation of installations) {
        try {
          await revokeInstallation(installation.installation_id);
        } catch {
          await admin.from("audit_events").insert({
            organization_id: organization.id,
            actor_user_id: user.id,
            actor_type: "system",
            action: "github.revocation_failed_during_deletion",
            target_type: "github_installation",
            target_id: String(installation.installation_id),
          });
        }
      }
      await admin.from("organizations").delete().eq("id", organization.id);
    }

    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw new Error("Account deletion failed.");
    return json({ deleted: true });
  });
}
