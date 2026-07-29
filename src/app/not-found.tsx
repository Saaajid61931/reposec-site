import { PublicPage } from "@/components/site-shell";
import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <PublicPage>
      <div className="page-content"><div className="narrow"><section className="empty-state"><h1>Page not found</h1><p>The report may be private, disabled, expired, or the address may be incorrect.</p><ButtonLink href="/">Return home</ButtonLink></section></div></div>
    </PublicPage>
  );
}
