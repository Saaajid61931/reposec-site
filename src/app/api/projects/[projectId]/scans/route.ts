import { z } from "zod";
import { apiHandler, ApiError, json, readJson } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { assertSameOrigin } from "@/lib/security/csrf";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { NextRequest } from "next/server";

const schema = z.object({
  trigger: z.enum(["manual", "manual_rescan"]),
}).strict();

export async function POST(
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
    await enforceRateLimit({ identifier: user.id, action: "create_scan_user", limit: 10, windowSeconds: 3600 });
    await enforceRateLimit({ identifier: projectId, action: "create_scan_project", limit: 4, windowSeconds: 3600 });

    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase.rpc("enqueue_project_scan", {
      p_project_id: projectId,
      p_user_id: user.id,
      p_trigger: input.trigger,
    });
    if (error || !data) {
      if (error?.message.includes("entitlement")) throw new ApiError(402, "A Launch Pack, Monitoring, or Agency plan is required.", "payment_required");
      if (error?.message.includes("already active")) throw new ApiError(409, "A scan is already queued or running.");
      if (error?.message.includes("Not authorized")) throw new ApiError(403, "You cannot scan this project.");
      throw new Error("Scan could not be queued.");
    }
    return json({ scanId: data }, { status: 202 });
  });
}
