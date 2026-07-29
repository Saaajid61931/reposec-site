import "server-only";

import Stripe from "stripe";
import { requireEnv } from "@/lib/env";

let stripeClient: Stripe | null = null;

export function stripe() {
  if (!stripeClient) {
    const { STRIPE_SECRET_KEY } = requireEnv("STRIPE_SECRET_KEY");
    stripeClient = new Stripe(STRIPE_SECRET_KEY, {
      maxNetworkRetries: 2,
      timeout: 20_000,
      telemetry: false,
      appInfo: { name: "RepoSec", version: "0.1.0", url: "https://reposec.site" },
    });
  }
  return stripeClient;
}

export function priceForPlan(plan: "launch_pack" | "monitoring" | "agency") {
  const env = requireEnv(
    "STRIPE_LAUNCH_PACK_PRICE_ID",
    "STRIPE_MONITORING_PRICE_ID",
    "STRIPE_AGENCY_PRICE_ID",
  );
  return {
    launch_pack: env.STRIPE_LAUNCH_PACK_PRICE_ID,
    monitoring: env.STRIPE_MONITORING_PRICE_ID,
    agency: env.STRIPE_AGENCY_PRICE_ID,
  }[plan];
}
