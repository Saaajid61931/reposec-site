import { z } from "zod";
import { apiHandler, ApiError, json, readJson } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { assertSameOrigin } from "@/lib/security/csrf";
import type { NextRequest } from "next/server";

const schema = z.object({ confirmation: z.string().max(100) }).strict();

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const user = await currentUser();
    if (!user) throw new ApiError(401, "Sign in is required.");
    const input = await readJson(request, schema);
    const { projectId } = await params;
    if (!z.string().uuid().safeParse(projectId).success) throw new ApiError(404, "Project not found.");

    const userClient = await createServerSupabaseClient();
    const { data: project } = await userClient!
      .from("projects")
      .select("id,name,organization_id")
      .eq("id", projectId)
      .maybeSingle();
    if (!project) throw new ApiError(404, "Project not found.");
    if (input.confirmation !== project.name) throw new ApiError(400, "Project name confirmation does not match.");

    const { data: membership } = await userClient!
      .from("organization_members")
      .select("role")
      .eq("organization_id", project.organization_id)
      .eq("user_id", user.id)
      .in("role", ["owner", "admin"])
      .maybeSingle();
    if (!membership) throw new ApiError(403, "Only an organization owner or admin can delete a project.");

    const admin = createAdminSupabaseClient();
    await admin.from("audit_events").insert({
      organization_id: project.organization_id,
      actor_user_id: user.id,
      actor_type: "user",
      action: "project.deleted",
      target_type: "project",
      target_id: project.id,
      before_state: { name: project.name },
    });
    const { error } = await admin.from("projects").delete().eq("id", project.id);
    if (error) throw new Error("Project deletion failed.");

    return json({ deleted: true });
  });
}
