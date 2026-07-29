import { z } from "zod";
import { apiHandler, ApiError, json, readJson } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { assertSameOrigin } from "@/lib/security/csrf";
import type { NextRequest } from "next/server";

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  agencyName: z.string().trim().max(100).nullable(),
  logoUrl: z.string().url().max(1000).nullable(),
}).strict();

export async function PATCH(
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
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase!.from("organizations").update({
      name: input.name,
      agency_name: input.agencyName,
      logo_url: input.logoUrl,
    }).eq("id", organizationId);
    if (error) throw new ApiError(403, "Only an organization owner or admin can change settings.");
    return json({ updated: true });
  });
}
