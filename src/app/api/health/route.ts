import { json } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  return json({
    status: "ok",
    service: "reposec-web",
    revision: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null,
    time: new Date().toISOString(),
  });
}
