import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { GitHubSignInButton } from "@/components/github-sign-in-button";
import { Logo } from "@/components/logo";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; plan?: string; error?: string }>;
}) {
  const params = await searchParams;
  const nextPath = params.next?.startsWith("/") ? params.next : params.plan ? `/dashboard/billing?plan=${encodeURIComponent(params.plan)}` : "/dashboard";
  const configured = isSupabaseConfigured();

  return (
    <main className="auth-page">
      <section className="auth-intro">
        <Logo />
        <div className="auth-intro-copy">
          <p className="eyebrow">Your private launch workspace</p>
          <h1>Turn findings into a confident handoff.</h1>
          <p>Save reports, connect private repositories, rescan after fixes, and keep client-safe evidence in one place.</p>
          <ul className="passed-list" style={{ marginTop: 30 }}>
            <li><CheckCircle2 size={15} /> Read-only GitHub App access</li>
            <li><CheckCircle2 size={15} /> Source snapshots deleted after every scan</li>
            <li><CheckCircle2 size={15} /> Public sharing disabled by default</li>
          </ul>
        </div>
        <p className="auth-fine-print">Automated checks are limited in scope and do not certify an application as secure.</p>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <h1>Welcome to RepoSec</h1>
          <p>Use GitHub for account identity. Repository access is requested separately through the RepoSec GitHub App.</p>
          {params.error && <p className="form-error" role="alert">Authentication failed. Please try again.</p>}
          {configured ? (
            <GitHubSignInButton nextPath={nextPath} />
          ) : (
            <div className="sample-banner">
              Authentication is not configured. Add the Supabase public URL and publishable key before deployment.
            </div>
          )}
          <div className="auth-divider">permissions</div>
          <div className="permission-note">
            <h2>Sign-in is not repository installation</h2>
            <p>GitHub sign-in requests only identity and email scopes. Private repository contents are available only after you explicitly install the read-only GitHub App.</p>
          </div>
          <p style={{ fontSize: 11, color: "var(--subtle)", marginTop: 22 }}>
            By continuing, you agree to the <Link href="/terms">Terms</Link> and <Link href="/acceptable-use">Acceptable Use Policy</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}
