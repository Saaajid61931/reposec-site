import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiHandler, ApiError, json, readJson } from "@/lib/api";
import { requireApiAdmin } from "@/lib/admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { assertSameOrigin } from "@/lib/security/csrf";
import { stripe } from "@/lib/stripe";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rerun_component"), componentId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("refund_purchase"), purchaseId: z.string().uuid() }).strict(),
  z.object({
    action: z.literal("grant_credit"),
    organizationId: z.string().uuid(),
    projectId: z.string().uuid().optional(),
    credits: z.number().int().min(1).max(10),
    reason: z.string().trim().min(8).max(1000),
  }).strict(),
  z.object({
    action: z.literal("suspend_user"),
    userId: z.string().uuid(),
    reason: z.string().trim().min(8).max(1000),
  }).strict(),
  z.object({ action: z.literal("unsuspend_user"), userId: z.string().uuid() }).strict(),
]);

export async function POST(request: NextRequest) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const adminUser = await requireApiAdmin();
    const input = await readJson(request, schema);
    const admin = createAdminSupabaseClient();

    if (input.action === "rerun_component") {
      const { data: component } = await admin
        .from("scan_components")
        .select("id,scan_id,scanner")
        .eq("id", input.componentId)
        .maybeSingle();
      if (!component) throw new ApiError(404, "Scan component not found.");

      const { data: sourceScan } = await admin
        .from("scans")
        .select("id,project_id")
        .eq("id", component.scan_id)
        .maybeSingle();
      if (!sourceScan?.project_id) throw new ApiError(400, "Only project scans can be re-run.");

      const { data: queuedScanId, error: queueError } = await admin.rpc("enqueue_admin_retry", {
        p_source_scan_id: sourceScan.id,
        p_admin_user_id: adminUser.id,
      });
      if (queueError || !queuedScanId) {
        if (queueError?.message.includes("already active")) {
          throw new ApiError(409, "This project already has a queued or running scan.");
        }
        throw new Error("The scan could not be queued.");
      }

      const { data: project } = await admin
        .from("projects")
        .select("organization_id")
        .eq("id", sourceScan.project_id)
        .single();
      await admin.from("audit_events").insert({
        organization_id: project?.organization_id,
        actor_user_id: adminUser.id,
        actor_type: "admin",
        action: "scan.admin_retry_queued",
        target_type: "scan",
        target_id: queuedScanId,
        before_state: { sourceScanId: sourceScan.id, failedScanner: component.scanner },
        after_state: { trigger: "admin_retry", commitPinned: true },
      });
      return json({ queued: true, scanId: queuedScanId });
    }

    if (input.action === "grant_credit") {
      if (input.projectId) {
        const { data: project } = await admin
          .from("projects")
          .select("id")
          .eq("id", input.projectId)
          .eq("organization_id", input.organizationId)
          .maybeSingle();
        if (!project) throw new ApiError(400, "Project does not belong to the organization.");
      }
      const { data: grant, error } = await admin.from("report_credit_grants").insert({
        organization_id: input.organizationId,
        project_id: input.projectId ?? null,
        granted_by: adminUser.id,
        reason: input.reason,
        credits_total: input.credits,
        credits_remaining: input.credits,
      }).select("id").single();
      if (error || !grant) throw new Error("Credit grant could not be recorded.");
      await admin.from("audit_events").insert({
        organization_id: input.organizationId,
        actor_user_id: adminUser.id,
        actor_type: "admin",
        action: "report_credit.granted",
        target_type: "report_credit_grant",
        target_id: grant.id,
        after_state: { projectId: input.projectId ?? null, credits: input.credits, reason: input.reason },
      });
      return json({ granted: true });
    }

    if (input.action === "refund_purchase") {
      const { data: purchase } = await admin
        .from("purchases")
        .select("id,organization_id,stripe_payment_intent_id,status")
        .eq("id", input.purchaseId)
        .maybeSingle();
      if (!purchase) throw new ApiError(404, "Purchase not found.");
      if (purchase.status === "refunded") return json({ refunded: true, duplicate: true });
      if (!purchase.stripe_payment_intent_id) throw new ApiError(409, "Purchase has no refundable payment intent.");
      await stripe().refunds.create({
        payment_intent: purchase.stripe_payment_intent_id as string,
        reason: "requested_by_customer",
        metadata: { repoSecAdminId: adminUser.id, repoSecPurchaseId: purchase.id },
      }, { idempotencyKey: `admin-refund:${purchase.id}` });
      await admin.rpc("record_purchase_refund", { p_payment_intent_id: purchase.stripe_payment_intent_id });
      await admin.from("audit_events").insert({
        organization_id: purchase.organization_id,
        actor_user_id: adminUser.id,
        actor_type: "admin",
        action: "purchase.refunded",
        target_type: "purchase",
        target_id: purchase.id,
      });
      return json({ refunded: true });
    }

    if (input.action === "suspend_user") {
      if (input.userId === adminUser.id) throw new ApiError(400, "You cannot suspend your own account.");
      const suspendedAt = new Date().toISOString();
      const { error } = await admin.auth.admin.updateUserById(input.userId, { ban_duration: "876000h" });
      if (error) throw new Error("Auth account could not be suspended.");
      await admin.from("users").update({ suspended_at: suspendedAt, suspension_reason: input.reason }).eq("id", input.userId);
      await admin.from("audit_events").insert({
        actor_user_id: adminUser.id,
        actor_type: "admin",
        action: "user.suspended",
        target_type: "user",
        target_id: input.userId,
        after_state: { suspendedAt, reason: input.reason },
      });
      return json({ suspended: true });
    }

    const { error } = await admin.auth.admin.updateUserById(input.userId, { ban_duration: "none" });
    if (error) throw new Error("Auth account could not be unsuspended.");
    await admin.from("users").update({ suspended_at: null, suspension_reason: null }).eq("id", input.userId);
    await admin.from("audit_events").insert({
      actor_user_id: adminUser.id,
      actor_type: "admin",
      action: "user.unsuspended",
      target_type: "user",
      target_id: input.userId,
    });
    return json({ suspended: false });
  });
}
