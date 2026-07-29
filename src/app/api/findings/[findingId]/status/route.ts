import { z } from "zod";
import { apiHandler, ApiError, json, readJson } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { assertSameOrigin } from "@/lib/security/csrf";
import type { NextRequest } from "next/server";

const schema = z.object({
  status: z.enum(["open", "fixed", "dismissed", "accepted"]),
  reason: z.string().trim().max(1000),
}).strict();

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ findingId: string }> },
) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const user = await currentUser();
    if (!user) throw new ApiError(401, "Sign in is required.");
    const input = await readJson(request, schema);
    const { findingId } = await params;
    if (!z.string().uuid().safeParse(findingId).success) throw new ApiError(404, "Finding not found.");

    const supabase = await createServerSupabaseClient();
    const { error } = await supabase!.rpc("set_finding_status", {
      p_finding_id: findingId,
      p_status: input.status,
      p_reason: input.reason,
    });
    if (error) {
      if (error.message.includes("reason")) throw new ApiError(400, "A meaningful reason is required.");
      throw new ApiError(403, "Finding status could not be changed.");
    }
    return json({ updated: true });
  });
}
