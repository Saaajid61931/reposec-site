import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next");
  const nextPath = requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
    ? requestedNext
    : "/dashboard";

  if (code) {
    const supabase = await createServerSupabaseClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        const { error: workspaceError } = await supabase.rpc("ensure_user_workspace");
        if (!workspaceError) return NextResponse.redirect(new URL(nextPath, url.origin));
      }
    }
  }

  return NextResponse.redirect(new URL("/signin?error=oauth", url.origin));
}
