import type { NextRequest } from "next/server";
import { ApiError } from "@/lib/api";
import { appUrl } from "@/lib/env";

export function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  const expectedOrigin = new URL(appUrl()).origin;
  const requestOrigin = new URL(request.url).origin;

  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    throw new ApiError(403, "Cross-site request rejected.", "csrf_rejected");
  }
  if (origin && origin !== expectedOrigin && origin !== requestOrigin) {
    throw new ApiError(403, "Request origin rejected.", "csrf_rejected");
  }
  if (!origin && fetchSite !== "same-origin" && process.env.NODE_ENV === "production") {
    throw new ApiError(403, "Request origin is required.", "csrf_rejected");
  }
}
