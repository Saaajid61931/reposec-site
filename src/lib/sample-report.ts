import type { LaunchReport } from "@/lib/types";

export const sampleReport: LaunchReport = {
  id: "sample_report",
  projectName: "Northstar Client Portal",
  repositoryLabel: "sample-agency/northstar-portal",
  repositoryUrl: "https://github.com/octocat/Hello-World",
  siteUrl: "https://example.com",
  verdict: "BLOCKED",
  completedAt: "2026-07-24T09:30:00.000Z",
  fingerprint: "rs_8d31a7c2e4906baf",
  scope: [
    "Default-branch repository snapshot",
    "Dependency manifests and lockfiles",
    "GitHub Actions workflows",
    "Verified production root URL",
  ],
  limitations: [
    "Static analysis does not execute application code or verify runtime authorization behavior.",
    "The deployed-site check is passive and limited to publicly observable responses.",
    "A clean report does not prove that an application is secure.",
  ],
  components: [
    { name: "Repository posture", status: "passed", detail: "18 deterministic controls completed" },
    { name: "GitHub Actions", status: "passed", detail: "Workflow permissions and action pinning completed" },
    { name: "Secrets", status: "passed", detail: "Gitleaks and RepoSec patterns completed" },
    { name: "Dependencies", status: "passed", detail: "OSV and Trivy completed" },
    { name: "Static analysis", status: "passed", detail: "Semgrep and RepoSec rules completed" },
    { name: "Deployed site", status: "passed", detail: "Verified target checked passively" },
  ],
  findings: [
    {
      id: "sample_service_role",
      ruleId: "REPOSEC-SUPABASE-001",
      title: "Privileged Supabase key is exposed to browser code",
      category: "Secrets and authorization",
      severity: "critical",
      confidence: "high",
      status: "open",
      explanation:
        "A browser-accessible module references a Supabase service-role credential. Service-role keys bypass Row Level Security and belong only in trusted server code.",
      impact:
        "Anyone who receives the production JavaScript could use the credential to read or change data with elevated privileges until the key is rotated.",
      evidence: {
        filePath: "src/lib/supabase-client.ts",
        line: 8,
        excerpt: "createClient(url, \"eyJ…[REDACTED sha256:43b7e2f1]\")",
      },
      detectionSource: ["RepoSec deterministic rule", "Gitleaks"],
      remediation:
        "Remove the key from browser code and history, rotate it in Supabase, use the publishable key client-side, and move privileged operations to an authenticated server route.",
      fixPrompt:
        "Inspect `src/lib/supabase-client.ts` and every call site that imports it. A Supabase service-role key is currently bundled into browser code. Replace the browser client with the public publishable key, move every operation that genuinely requires service-role access into server-only code, and enforce the signed-in user's organization membership before each privileged query. Preserve existing user-facing behavior and existing Row Level Security policies. Search the repository and git-visible configuration for related copies, but never print or commit any secret value. Finish when no service-role credential is reachable from a client bundle, affected operations still work through authorized server paths, and the exposed key has a documented rotation step.",
      verification:
        "Rotate the key, rebuild the production bundle, search generated JavaScript for the old credential fingerprint, and rescan. Confirm privileged routes reject users outside the project organization.",
      references: [
        { label: "Supabase: API keys", url: "https://supabase.com/docs/guides/api/api-keys" },
      ],
    },
    {
      id: "sample_stripe_webhook",
      ruleId: "REPOSEC-STRIPE-001",
      title: "Stripe webhook does not verify its signature",
      category: "Payments",
      severity: "high",
      confidence: "high",
      status: "open",
      explanation:
        "The webhook handler parses JSON before verifying Stripe's signed payload. The route cannot distinguish a genuine Stripe event from a forged request.",
      impact:
        "An attacker could submit fabricated payment events and may receive paid entitlements without completing a purchase.",
      evidence: {
        filePath: "src/app/api/stripe/webhook/route.ts",
        line: 14,
        excerpt: "const event = await request.json()",
      },
      detectionSource: ["RepoSec deterministic rule", "Semgrep"],
      remediation:
        "Read the raw request body, verify the `stripe-signature` header with the webhook secret, reject failures, and process event IDs idempotently before granting entitlements.",
      fixPrompt:
        "Update `src/app/api/stripe/webhook/route.ts`. It currently trusts parsed client input as a Stripe event. Verify the raw request body with Stripe's official signature helper and `STRIPE_WEBHOOK_SECRET` before reading event fields. Add idempotent event storage so a Stripe event ID can grant an entitlement only once; grant access only after a verified successful payment or active subscription state. Preserve the existing checkout products and response contract. Inspect related entitlement and purchase call sites for any direct client-controlled grant path. Never log the webhook secret, signature, or full payment payload. Finish when forged, malformed, and replayed events cannot grant access and valid events remain retry-safe.",
      verification:
        "Use the Stripe CLI to send a valid test event, replay it, and send a request with a bad signature. Only the first valid event should change entitlement state.",
      references: [
        { label: "Stripe: webhook signatures", url: "https://docs.stripe.com/webhooks/signature" },
      ],
    },
    {
      id: "sample_csp",
      ruleId: "REPOSEC-HEADER-001",
      title: "Content Security Policy is not set",
      category: "Deployed-site headers",
      severity: "medium",
      confidence: "high",
      status: "open",
      explanation:
        "The verified production response did not include a Content-Security-Policy header.",
      impact:
        "A CSP can limit the impact of a script injection bug by restricting where executable content may load from.",
      evidence: {
        excerpt: "GET / → content-security-policy: [not observed]",
      },
      detectionSource: ["RepoSec passive site check"],
      remediation:
        "Add an application-specific CSP, begin in report-only mode if necessary, remove unsafe sources, and then enforce it.",
      fixPrompt:
        "Add a production Content-Security-Policy for the application entry point. Inventory scripts, styles, images, fonts, frames, and API destinations before choosing directives. Start with `default-src 'self'`, explicitly allow only required origins, set `object-src 'none'`, `base-uri 'self'`, and a restrictive `frame-ancestors`, and use nonces or hashes for unavoidable inline scripts. Preserve Stripe, Supabase, analytics, and error-reporting integrations that are actually in use. Do not add broad wildcard sources or expose tokens in the policy. Finish when the deployed root response includes an enforced CSP and core user flows work without browser CSP violations.",
      verification:
        "Deploy to a staging domain, exercise sign-in and checkout, review browser CSP errors, then verify the production response header and rescan.",
      references: [
        { label: "MDN: Content-Security-Policy", url: "https://developer.mozilla.org/docs/Web/HTTP/Headers/Content-Security-Policy" },
      ],
    },
  ],
};
