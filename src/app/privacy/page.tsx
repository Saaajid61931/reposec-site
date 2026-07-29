import type { Metadata } from "next";
import { PolicyLayout } from "@/components/policy-layout";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How RepoSec processes account, repository, scanner, site, and payment data.",
};

export default function PrivacyPage() {
  return (
    <PolicyLayout eyebrow="Legal" title="Privacy policy">
      <p>This policy explains how RepoSec processes information when you use our website, connect a repository, verify a domain, purchase a plan, or receive monitoring emails.</p>

      <h2>Information we collect</h2>
      <h3>Account and organization data</h3>
      <p>We receive your GitHub account identifier, name, avatar, and email from Supabase Auth after you choose GitHub sign-in. We store organization membership, project names, preferences, and an audit history of security-relevant account actions.</p>
      <h3>Repository and scan data</h3>
      <p>For a scan, an isolated worker obtains a short-lived snapshot of the selected repository. Source stays in an ephemeral workspace and is deleted after the job. We retain repository identifiers, commit and branch identifiers, scanner coverage, rule identifiers, severity, confidence, redacted evidence, file path and line number where applicable, stable fingerprints, remediation text, and status history.</p>
      <p>We do not intentionally retain repository source or raw detected secret values. Detected values are redacted before database insertion. You should still rotate any credential identified as exposed.</p>
      <h3>Deployed-site data</h3>
      <p>We store site URLs, domain-verification state, and passive observations such as response headers, cookie attributes, certificate dates, publicly referenced source maps, and secret-shaped-string fingerprints. Deeper checks require domain control verification.</p>
      <h3>Payments, email, and support</h3>
      <p>Stripe processes payment details. RepoSec retains Stripe customer, checkout, payment, and subscription identifiers plus entitlement state; we do not store full card details. Resend processes transactional email delivery. Support submissions include the contact information and message you provide.</p>

      <h2>How we use information</h2>
      <ul>
        <li>Provide, secure, and operate defensive automated checks.</li>
        <li>Generate reports, remediation prompts, rescans, and scan comparisons.</li>
        <li>Process purchases and enforce product entitlements.</li>
        <li>Send requested transactional and monitoring messages.</li>
        <li>Detect abuse, investigate job failures, and maintain an immutable audit trail.</li>
        <li>Comply with legal obligations and respond to valid rights requests.</li>
      </ul>

      <h2>Service providers and international processing</h2>
      <p>RepoSec uses infrastructure providers including Vercel, Supabase, the selected worker host, GitHub, Stripe, Resend, and optionally Sentry. They process information under their own terms and data-processing commitments. Deployment regions should be selected to match customer commitments before launch.</p>

      <h2>Retention and deletion</h2>
      <p>Ephemeral repository workspaces are removed after every scan, including failures. Free unauthenticated results expire automatically. Paid findings and reports remain until the project or account is deleted, subject to limited payment, fraud, backup, and legal retention requirements. Deleting a project removes retained findings and share settings. Account deletion removes personal data and sole-owner workspaces and attempts to revoke connected GitHub access.</p>

      <h2>Public reports</h2>
      <p>Public trust pages are disabled by default. When enabled by a project owner, they publish only project identity, optional owner-approved links, last scan date, passed controls, aggregate remediation status, scope, report fingerprint, and the RepoSec disclaimer. They never publish unresolved finding details, private filenames, evidence, source, secrets, or internal notes.</p>

      <h2>Security and your choices</h2>
      <p>We use access controls, Row Level Security, short-lived GitHub tokens, signed webhooks, encryption for sensitive configuration, and audit logging. No system is risk-free. You may update organization data, disable public pages, revoke the GitHub App, delete projects, or delete your account from the dashboard.</p>

      <h2>Contact</h2>
      <p>For privacy questions or access and deletion requests, email <a href="mailto:privacy@reposec.site">privacy@reposec.site</a>. We may need to verify account ownership before acting.</p>
    </PolicyLayout>
  );
}
