import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui";
import type { ReactNode } from "react";

const publicNavigation = [
  { href: "/sample-report", label: "Sample report" },
  { href: "/pricing", label: "Pricing" },
  { href: "/security", label: "Security" },
];

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Logo />
        <nav className="desktop-nav" aria-label="Main navigation">
          {publicNavigation.map((item) => (
            <Link href={item.href} key={item.href}>{item.label}</Link>
          ))}
        </nav>
        <div className="header-actions">
          <Link className="sign-in-link" href="/signin">Sign in</Link>
          <ButtonLink href="/#free-check" size="small">
            Run a free check <ArrowRight size={15} aria-hidden="true" />
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <Logo />
          <p>Defensive, non-destructive launch checks for teams shipping AI-built software.</p>
          <p className="fine-print">Automated checks are limited in scope and are not a security certification.</p>
        </div>
        <div>
          <h2>Product</h2>
          <Link href="/sample-report">Sample report</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/signin">Sign in</Link>
        </div>
        <div>
          <h2>Trust</h2>
          <Link href="/security">Security</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/acceptable-use">Acceptable use</Link>
        </div>
        <div>
          <h2>Company</h2>
          <Link href="/contact">Contact</Link>
          <Link href="/terms">Terms</Link>
          <a href="/.well-known/security.txt">security.txt</a>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getUTCFullYear()} RepoSec</span>
        <span>Built for careful launches.</span>
      </div>
    </footer>
  );
}

export function PublicPage({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </>
  );
}
