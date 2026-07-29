import type { Metadata } from "next";
import { PolicyLayout } from "@/components/policy-layout";

export const metadata: Metadata = { title: "Acceptable use policy" };

export default function AcceptableUsePage() {
  return (
    <PolicyLayout eyebrow="Legal" title="Acceptable use policy">
      <p>RepoSec exists for authorized defensive launch checks. This policy defines the boundary that keeps the service safe for customers and third parties.</p>

      <h2>Required authorization</h2>
      <p>You must own each submitted repository and site or have explicit authorization from its owner. Domain verification proves limited technical control; it does not replace legal authorization. Agency users are responsible for securing and retaining client approval.</p>

      <h2>Prohibited use</h2>
      <ul>
        <li>Scanning targets without authorization or using misleading ownership claims.</li>
        <li>Attempting exploitation, credential use, account takeover, denial of service, destructive testing, or persistence.</li>
        <li>Submitting malware, intentionally hostile archives, excessively large repositories, or content designed to escape the scanner sandbox.</li>
        <li>Evading rate, repository-size, response-size, or plan limits.</li>
        <li>Using findings to harm, extort, shame, or publicly expose a third party.</li>
        <li>Publishing unresolved vulnerabilities, secret evidence, private filenames, or client notes through a RepoSec share surface.</li>
        <li>Misrepresenting a report as a certification, penetration test, guarantee, or statement that a project is secure.</li>
        <li>Using the service in violation of law, GitHub terms, or third-party rights.</li>
      </ul>

      <h2>Automated access</h2>
      <p>Do not scrape, reverse engineer, or automate RepoSec endpoints except through documented product flows. Monitoring webhooks must originate from verified GitHub installations. Contact us before integrating high-volume agency workflows.</p>

      <h2>Enforcement</h2>
      <p>We may rate-limit, stop a scan, suspend an account, revoke share links, preserve limited evidence needed to investigate abuse, or report unlawful activity. We prefer proportionate action and will provide notice when doing so would not increase risk or conflict with law.</p>

      <h2>Report concerns</h2>
      <p>Report suspected abuse to <a href="mailto:abuse@reposec.site">abuse@reposec.site</a>. Do not include raw secret values or unnecessary repository content.</p>
    </PolicyLayout>
  );
}
