import type { NextRequest } from "next/server";
import { apiHandler, ApiError, json } from "@/lib/api";
import { requireEnv } from "@/lib/env";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  return apiHandler(async () => {
    const { CRON_SECRET } = requireEnv("CRON_SECRET");
    if (request.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) {
      throw new ApiError(401, "Cron authorization failed.");
    }
    const admin = createAdminSupabaseClient();
    const { data: entitlements, error } = await admin
      .from("project_entitlements")
      .select("project_id,organization_id,kind")
      .eq("active", true)
      .in("kind", ["monitoring", "agency"])
      .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`);
    if (error) throw new Error("Monitoring entitlements could not be loaded.");

    const projectIds = new Set<string>();
    for (const entitlement of entitlements ?? []) {
      if (entitlement.project_id) {
        projectIds.add(entitlement.project_id as string);
      } else if (entitlement.kind === "agency") {
        const { data: projects } = await admin
          .from("projects")
          .select("id")
          .eq("organization_id", entitlement.organization_id)
          .eq("status", "active")
          .limit(10);
        for (const project of projects ?? []) projectIds.add(project.id as string);
      }
    }

    let queued = 0;
    for (const projectId of projectIds) {
      const { data } = await admin.rpc("enqueue_monitoring_scan", {
        p_project_id: projectId,
        p_trigger: "schedule",
        p_commit_sha: null,
      });
      if (data) queued += 1;
    }
    return json({ queued });
  });
}
