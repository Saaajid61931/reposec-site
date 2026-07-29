import type { NextRequest } from "next/server";
import { apiHandler, ApiError, json } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { appUrl } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { assertSameOrigin } from "@/lib/security/csrf";
import { stripe } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const user = await currentUser();
    if (!user) throw new ApiError(401, "Sign in is required.");
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase!
      .from("billing_customers")
      .select("stripe_customer_id,organizations!inner(organization_members!inner(user_id))")
      .eq("organizations.organization_members.user_id", user.id)
      .limit(1)
      .maybeSingle();
    if (!data) throw new ApiError(404, "No billing account exists yet.");
    const session = await stripe().billingPortal.sessions.create({
      customer: data.stripe_customer_id as string,
      return_url: `${appUrl()}/dashboard/billing`,
    });
    return json({ url: session.url });
  });
}
