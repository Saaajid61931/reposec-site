import "server-only";

import { ApiError } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function requireApiAdmin() {
  const user = await currentUser();
  if (!user) throw new ApiError(401, "Sign in is required.");
  const admin = createAdminSupabaseClient();
  const { data } = await admin
    .from("users")
    .select("is_platform_admin,suspended_at")
    .eq("id", user.id)
    .maybeSingle();
  if (!data?.is_platform_admin || data.suspended_at) throw new ApiError(403, "Platform administrator access is required.");
  return user;
}
