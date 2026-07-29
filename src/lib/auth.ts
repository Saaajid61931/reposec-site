import "server-only";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function currentUser() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/signin");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/signin");

  const { data } = await supabase
    .from("users")
    .select("is_platform_admin,suspended_at")
    .eq("id", user.id)
    .maybeSingle();

  if (!data?.is_platform_admin || data.suspended_at) redirect("/dashboard");
  return user;
}
