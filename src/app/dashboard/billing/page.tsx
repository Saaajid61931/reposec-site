import type { Metadata } from "next";
import { CheckCircle2, CreditCard, ReceiptText } from "lucide-react";
import { BillingPortalButton } from "@/components/billing-actions";
import { CheckoutButton } from "@/components/checkout-button";
import { requireUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; project?: string; success?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const [{ data: subscriptions }, { data: purchases }] = supabase
    ? await Promise.all([
        supabase.from("subscriptions").select("id,kind,status,current_period_end,projects(name)").order("created_at", { ascending: false }),
        supabase.from("purchases").select("id,kind,status,amount_cents,currency,credits_remaining,created_at,projects(name)").order("created_at", { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }];

  return (
    <>
      <header className="dashboard-header compact">
        <div><p className="eyebrow">Billing</p><h1>Plans and entitlements</h1><p>Stripe hosts payment collection and billing details. RepoSec stores only identifiers and entitlement state.</p></div>
        <BillingPortalButton />
      </header>

      {params.success && <div className="success-banner"><CheckCircle2 size={17} /> Payment received. Entitlement appears after the signed Stripe webhook is processed.</div>}

      <div className="billing-grid">
        <article className={`surface-card ${params.plan === "launch_pack" ? "selected-plan" : ""}`}>
          <p className="pricing-kicker">Launch Pack</p><h3>$49 one time</h3>
          <p>Full scan, every finding and prompt, rescan, comparison, and printable client report.</p>
          <CheckoutButton label="Buy Launch Pack" plan="launch_pack" />
        </article>
        <article className={`surface-card ${params.plan === "monitoring" ? "selected-plan" : ""}`}>
          <p className="pricing-kicker">Monitoring</p><h3>$19 / project / month</h3>
          <p>Weekly and selected default-branch push rescans with regression-focused email alerts.</p>
          <CheckoutButton label="Add monitoring" plan="monitoring" projectId={params.project} variant="secondary" />
        </article>
        <article className={`surface-card ${params.plan === "agency" ? "selected-plan" : ""}`}>
          <p className="pricing-kicker">Agency</p><h3>$99 / month</h3>
          <p>Up to 10 active projects, agency report identity, and client-safe share links.</p>
          <CheckoutButton label="Start Agency" plan="agency" variant="secondary" />
        </article>
      </div>

      <section className="dashboard-section">
        <div className="dashboard-section-heading"><div><h2>Active subscriptions</h2><p>Access follows verified webhook state, including cancellation and payment failure.</p></div></div>
        <div className="data-list">
          {(subscriptions ?? []).length === 0 ? <p className="inline-note">No active subscriptions.</p> : (subscriptions ?? []).map((subscription) => (
            <div key={subscription.id as string}>
              <CreditCard size={17} />
              <span><strong>{String(subscription.kind).replaceAll("_", " ")}</strong><small>{String(subscription.status)} · period ends {subscription.current_period_end ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(subscription.current_period_end as string)) : "—"}</small></span>
            </div>
          ))}
        </div>
      </section>

      <section className="dashboard-section">
        <div className="dashboard-section-heading"><div><h2>Purchases</h2><p>One-time report credits and their current consumption state.</p></div></div>
        <div className="data-list">
          {(purchases ?? []).length === 0 ? <p className="inline-note">No completed purchases.</p> : (purchases ?? []).map((purchase) => (
            <div key={purchase.id as string}>
              <ReceiptText size={17} />
              <span><strong>{String(purchase.kind).replaceAll("_", " ")}</strong><small>{String(purchase.status)} · {String(purchase.currency).toUpperCase()} {(Number(purchase.amount_cents) / 100).toFixed(2)} · {String(purchase.credits_remaining)} credit(s) remaining</small></span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
