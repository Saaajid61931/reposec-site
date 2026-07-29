import "server-only";

import { Resend } from "resend";
import { appUrl, requireEnv } from "@/lib/env";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hashSensitive } from "@/lib/security/crypto";

export type EmailTemplate =
  | "welcome"
  | "scan_started"
  | "scan_complete"
  | "scan_failed"
  | "new_high_finding"
  | "monitoring_summary"
  | "payment_receipt"
  | "domain_verification"
  | "organization_invitation";

interface EmailInput {
  to: string;
  template: EmailTemplate;
  subject: string;
  preheader: string;
  heading: string;
  body: string;
  actionLabel?: string;
  actionUrl?: string;
  organizationId?: string;
  userId?: string;
  dedupeKey?: string;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderEmail(input: EmailInput) {
  const action = input.actionLabel && input.actionUrl
    ? `<p style="margin:28px 0"><a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#235f4b;color:#fff;text-decoration:none;font-weight:700">${escapeHtml(input.actionLabel)}</a></p>`
    : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(input.subject)}</title></head>
<body style="margin:0;background:#f6f4ee;color:#202522;font-family:Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(input.preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:36px 16px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:auto;border:1px solid #d9ddd6;border-radius:14px;background:#fffdf8">
<tr><td style="padding:24px 30px;border-bottom:1px solid #d9ddd6;font-size:20px;font-weight:750">RepoSec</td></tr>
<tr><td style="padding:34px 30px"><p style="margin:0 0 10px;color:#235f4b;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">Automated launch checks</p>
<h1 style="margin:0 0 16px;font-family:Georgia,serif;font-size:34px;line-height:1.1;font-weight:500">${escapeHtml(input.heading)}</h1>
<p style="margin:0;color:#626b65;font-size:15px;line-height:1.65">${escapeHtml(input.body)}</p>${action}
<p style="margin:30px 0 0;padding-top:18px;border-top:1px solid #e3e5e0;color:#8c938e;font-size:11px;line-height:1.5">RepoSec performs limited automated checks. A report is not a penetration test, certification, or proof that a project is secure.</p>
</td></tr></table>
<p style="max-width:620px;margin:16px auto 0;color:#8c938e;font-size:10px;text-align:center">RepoSec · ${escapeHtml(appUrl())}</p>
</td></tr></table></body></html>`;
}

export async function sendEmail(input: EmailInput) {
  const { RESEND_API_KEY, EMAIL_FROM } = requireEnv("RESEND_API_KEY", "EMAIL_FROM");
  const resend = new Resend(RESEND_API_KEY);
  const supabase = createAdminSupabaseClient();
  const delivery = {
    organization_id: input.organizationId ?? null,
    user_id: input.userId ?? null,
    template: input.template,
    recipient_hash: hashSensitive(input.to.toLowerCase()),
    status: "sending",
    dedupe_key: input.dedupeKey ?? null,
  };

  const { data: inserted, error: insertError } = await supabase
    .from("email_deliveries")
    .insert(delivery)
    .select("id")
    .single();
  if (insertError?.code === "23505") return { deduplicated: true };
  if (insertError || !inserted) throw new Error("Email delivery could not be recorded.");

  const { data, error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: input.to,
    subject: input.subject,
    html: renderEmail(input),
  });

  if (error) {
    const { error: failureRecordError } = await supabase.from("email_deliveries").update({
      status: "failed",
      last_error_redacted: String(error.name ?? "provider_error").slice(0, 200),
    }).eq("id", inserted.id);
    if (failureRecordError) throw new Error("Transactional email failure could not be recorded.");
    throw new Error("Transactional email could not be sent.");
  }

  const { error: sentRecordError } = await supabase.from("email_deliveries").update({
    status: "sent",
    provider_message_id: data?.id ?? null,
    sent_at: new Date().toISOString(),
  }).eq("id", inserted.id);
  if (sentRecordError) throw new Error("Transactional email success could not be recorded.");

  return { id: data?.id };
}
