import type { Metadata } from "next";
import { Check, Minus } from "lucide-react";
import { CheckoutButton } from "@/components/checkout-button";
import { PublicPage } from "@/components/site-shell";
import { ButtonLink, SectionHeading } from "@/components/ui";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Free public repository checks, a $49 Launch Pack, monitoring, and an agency workspace.",
  alternates: { canonical: "/pricing" },
};

const tiers = [
  {
    name: "Free check",
    price: "$0",
    term: "",
    description: "A useful first pass on a public repository.",
    features: ["Limited repository posture checks", "Optional public root URL", "Verdict and up to three findings", "No saved report without an account"],
    cta: <ButtonLink href="/#free-check" variant="secondary">Run free check</ButtonLink>,
  },
  {
    name: "Launch Pack",
    price: "$49",
    term: "one time",
    description: "The complete pre-handoff launch review.",
    features: ["Public or private repository", "Full deterministic scanner coverage", "All evidence and fix prompts", "Domain verification and passive site checks", "Rescan, comparison, printable report", "Private share link"],
    cta: <CheckoutButton label="Get Launch Pack" plan="launch_pack" />,
    featured: true,
  },
  {
    name: "Monitoring",
    price: "$19",
    term: "per project / month",
    description: "Catch regressions after the first handoff.",
    features: ["Weekly scheduled rescan", "Selected default-branch push rescans", "New and regressed finding alerts", "Scan-to-scan differences", "Billing portal access"],
    cta: <CheckoutButton label="Add monitoring" plan="monitoring" variant="secondary" />,
  },
  {
    name: "Agency",
    price: "$99",
    term: "per month",
    description: "A small client security handoff workspace.",
    features: ["Up to 10 active client projects", "Agency name and report logo", "Client-safe private links", "Hide internal notes", "Scope and disclaimer always retained"],
    cta: <CheckoutButton label="Start Agency" plan="agency" variant="secondary" />,
  },
];

const comparison = [
  ["Public repository scan", true, true, true, true],
  ["Private repository via GitHub App", false, true, true, true],
  ["Full findings and fix prompts", false, true, true, true],
  ["Verified deployed-site checks", false, true, true, true],
  ["Rescan and comparison", false, true, true, true],
  ["Scheduled and push monitoring", false, false, true, true],
  ["Agency branding and client projects", false, false, false, true],
] as const;

export default function PricingPage() {
  return (
    <PublicPage>
      <section className="page-hero">
        <div className="container">
          <p className="eyebrow">Pricing</p>
          <h1>A clear launch cost. No invented urgency.</h1>
          <p>Start with a real limited check, then pay once for the complete client handoff. Add monitoring only when the project remains active.</p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="pricing-grid">
            {tiers.map((tier) => (
              <article className={`pricing-card ${tier.featured ? "featured" : ""}`} key={tier.name}>
                <p className="pricing-kicker">{tier.featured ? "Most complete handoff" : tier.name}</p>
                <h3>{tier.name}</h3>
                <p>{tier.description}</p>
                <div className="price">{tier.price} {tier.term && <span>{tier.term}</span>}</div>
                <ul className="pricing-features">
                  {tier.features.map((feature) => <li key={feature}><Check size={14} /> {feature}</li>)}
                </ul>
                {tier.cta}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-tinted">
        <div className="container">
          <SectionHeading title="Compare plans" body="Paid data is enforced at the API and database layers, not hidden only in the interface." />
          <div className="report-page" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720, fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: 18 }}>Capability</th>
                  {tiers.map((tier) => <th style={{ padding: 18 }} key={tier.name}>{tier.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {comparison.map(([label, ...values]) => (
                  <tr style={{ borderTop: "1px solid var(--line)" }} key={label}>
                    <td style={{ padding: 16 }}>{label}</td>
                    {values.map((enabled, index) => (
                      <td style={{ padding: 16, textAlign: "center" }} key={`${label}-${tiers[index]?.name}`}>
                        {enabled ? <Check size={16} color="var(--forest)" aria-label="Included" /> : <Minus size={16} color="var(--subtle)" aria-label="Not included" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </PublicPage>
  );
}
