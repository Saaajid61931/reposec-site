import type { Metadata } from "next";
import { PolicyLayout } from "@/components/policy-layout";

export const metadata: Metadata = { title: "Terms of service" };

export default function TermsPage() {
  return (
    <PolicyLayout eyebrow="Legal" title="Terms of service">
      <p>These terms govern access to RepoSec. By creating an account or purchasing a plan, you agree to them on behalf of yourself or the organization you represent.</p>

      <h2>What RepoSec provides</h2>
      <p>RepoSec performs automated, defensive, non-destructive static repository checks and passive deployed-site observations within the scope displayed in each report. It may provide plain-language explanations and remediation prompts. It is not a penetration test, managed security service, certification, compliance assessment, warranty, or guarantee that a system is secure or ready to launch.</p>

      <h2>Your authorization and responsibilities</h2>
      <p>You may submit only repositories, domains, and projects that you own or are authorized to check. You are responsible for reviewing findings, protecting credentials, maintaining backups, testing changes proposed by coding agents, and deciding whether to launch. Do not treat a “Ready for launch checks” verdict as approval to skip professional review appropriate to your risk.</p>

      <h2>Accounts and repository access</h2>
      <p>You must keep your account secure and provide accurate information. Private repository access uses a read-only GitHub App. You may revoke an installation at any time. RepoSec may suspend accounts that abuse scanning, evade limits, target unauthorized systems, or threaten service reliability.</p>

      <h2>Plans, billing, and refunds</h2>
      <p>Prices are shown before checkout. The Launch Pack is a one-time report entitlement. Monitoring and Agency are recurring subscriptions until cancelled through the billing portal. Cancellation stops future renewal and access continues through the paid period unless otherwise stated. Refund requests are reviewed under applicable law and the circumstances of service delivery; granting a credit does not alter original scanner evidence.</p>

      <h2>Reports and remediation prompts</h2>
      <p>Scanner findings can be incomplete or incorrect. Heuristic results are labelled with confidence and may require review. AI may improve explanations but does not create the underlying finding. You are responsible for reviewing and testing any suggested code change. Never provide a coding agent with credentials or sensitive data merely because a prompt suggests investigating related code.</p>

      <h2>Availability and changes</h2>
      <p>We aim to operate RepoSec reliably but do not promise uninterrupted availability. Scanner components, dependency databases, platform APIs, and network services can fail or time out; reports identify incomplete required coverage. We may change the service to improve security, comply with law, or maintain providers, and will communicate material changes when practical.</p>

      <h2>Intellectual property</h2>
      <p>You retain rights in your repositories and project data. You grant RepoSec only the limited rights needed to perform requested checks and provide reports. RepoSec retains rights in the service, rule mappings, report design, documentation, and product identity. You may share a report with the relevant client but may not misrepresent its scope or remove the RepoSec disclaimer.</p>

      <h2>Disclaimer and limitation</h2>
      <p>To the extent permitted by law, the service is provided “as is” without warranties of security, fitness, merchantability, or non-infringement. RepoSec is not liable for indirect, incidental, special, consequential, or lost-profit damages arising from use of a report, a missed issue, a false positive, a coding-agent change, or a launch decision. Any aggregate direct liability is limited to fees paid for the affected service during the preceding twelve months, except where law prohibits that limitation.</p>

      <h2>Contact</h2>
      <p>Questions about these terms may be sent to <a href="mailto:legal@reposec.site">legal@reposec.site</a>.</p>
    </PolicyLayout>
  );
}
