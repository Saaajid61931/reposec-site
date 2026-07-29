import { z } from "zod";
import { apiHandler, ApiError, json, readJson, requestIp } from "@/lib/api";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { requireEnv } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/security/csrf";
import { hashSensitive } from "@/lib/security/crypto";
import type { NextRequest } from "next/server";

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().email().max(320),
  topic: z.enum(["product", "billing", "privacy", "security"]),
  message: z.string().trim().min(10).max(5000),
  website: z.string().max(0).optional(),
}).strict();

export async function POST(request: NextRequest) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const input = await readJson(request, schema);
    if (input.website) return json({ accepted: true });
    const ip = requestIp(request);
    await enforceRateLimit({ identifier: ip, action: "contact", limit: 5, windowSeconds: 3600 });
    const { SUPPORT_EMAIL } = requireEnv("SUPPORT_EMAIL");
    await sendEmail({
      to: SUPPORT_EMAIL,
      template: "welcome",
      subject: `[RepoSec ${input.topic}] Message from ${input.name}`,
      preheader: `Contact request from ${input.email}`,
      heading: `${input.topic} request`,
      body: `From: ${input.name} <${input.email}>\n\n${input.message}`,
      dedupeKey: `contact:${hashSensitive(`${input.email}:${input.message}`)}`,
    });
    const admin = createAdminSupabaseClient();
    const { error } = await admin.from("contact_requests").insert({
      name: input.name,
      email: input.email,
      topic: input.topic,
      message: input.message,
      requester_ip_hash: hashSensitive(ip),
    });
    if (error) throw new ApiError(500, "Message was delivered but could not be recorded.");
    return json({ accepted: true }, { status: 201 });
  });
}
