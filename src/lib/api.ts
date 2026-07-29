import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";
import type { ZodType } from "zod";
import { redactText } from "@/lib/security/redact";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = "request_failed",
  ) {
    super(message);
  }
}

export async function readJson<T>(request: NextRequest, schema: ZodType<T>, maxBytes = 32_768): Promise<T> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes) throw new ApiError(413, "Request body is too large.", "body_too_large");
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > maxBytes) throw new ApiError(413, "Request body is too large.", "body_too_large");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError(400, "Request body must be valid JSON.", "invalid_json");
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new ApiError(400, result.error.issues[0]?.message ?? "Request validation failed.", "validation_failed");
  }
  return result.data;
}

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: {
      "cache-control": "no-store",
      ...init?.headers,
    },
  });
}

export async function apiHandler(work: () => Promise<Response>) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ApiError) {
      return json({ error: error.message, code: error.code }, { status: error.status });
    }
    Sentry.captureException(error);
    const safeMessage = process.env.NODE_ENV === "development" && error instanceof Error
      ? redactText(error.message, 300)
      : "The request could not be completed.";
    return json({ error: safeMessage, code: "internal_error" }, { status: 500 });
  }
}

export function requestIp(request: NextRequest) {
  return (
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown"
  );
}
