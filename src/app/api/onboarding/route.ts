import { NextResponse, type NextRequest } from "next/server";
import { apiHandler, ApiError } from "@/lib/api";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  return apiHandler(async () => {
    const fetchSite = request.headers.get("sec-fetch-site");
    if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
      throw new ApiError(403, "Cross-site request rejected.");
    }
    const supabase = await createServerSupabaseClient();
    if (!supabase) throw new ApiError(503, "Authentication is not configured.");
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new ApiError(401, "Sign in is required.");
    const { error } = await supabase.rpc("ensure_user_workspace");
    if (error) throw new Error("Workspace could not be initialized.");
    return NextResponse.redirect(new URL("/dashboard", request.url), { status: 303 });
  });
}
