import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiHandler, ApiError, json, readJson } from "@/lib/api";
import { requireApiAdmin } from "@/lib/admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { assertSameOrigin } from "@/lib/security/csrf";

const schema = z.object({
  classification: z.enum(["confirmed", "false_positive", "needs_review"]).nullable(),
  customerExplanation: z.string().trim().max(5000).nullable(),
  customerRemediation: z.string().trim().max(5000).nullable(),
  reason: z.string().trim().min(8).max(2000),
}).strict().refine(
  (value) => value.classification || value.customerExplanation || value.customerRemediation,
  { message: "Provide at least one override field." },
);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ findingId: string }> },
) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const user = await requireApiAdmin();
    const input = await readJson(request, schema);
    const { findingId } = await params;
    if (!z.string().uuid().safeParse(findingId).success) throw new ApiError(404, "Finding not found.");
    const admin = createAdminSupabaseClient();
    const { data: finding } = await admin.from("findings").select("id,project_id").eq("id", findingId).maybeSingle();
    if (!finding) throw new ApiError(404, "Finding not found.");
    const { data: previous } = await admin
      .from("finding_overrides")
      .select("id")
      .eq("finding_id", findingId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: override, error } = await admin.from("finding_overrides").insert({
      finding_id: findingId,
      admin_user_id: user.id,
      classification: input.classification,
      customer_explanation: input.customerExplanation,
      customer_remediation: input.customerRemediation,
      reason: input.reason,
      supersedes_id: previous?.id ?? null,
    }).select("id").single();
    if (error || !override) throw new Error("Finding override could not be recorded.");
    const { data: project } = await admin.from("projects").select("organization_id").eq("id", finding.project_id).single();
    await admin.from("audit_events").insert({
      organization_id: project?.organization_id,
      actor_user_id: user.id,
      actor_type: "admin",
      action: "finding.override_appended",
      target_type: "finding_override",
      target_id: override.id,
      after_state: {
        findingId,
        classification: input.classification,
        explanationChanged: Boolean(input.customerExplanation),
        remediationChanged: Boolean(input.customerRemediation),
        reason: input.reason,
      },
    });
    return json({ overrideId: override.id }, { status: 201 });
  });
}
