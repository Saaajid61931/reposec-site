import type { Metadata } from "next";
import { ContactForm } from "@/components/contact-form";
import { PublicPage } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact RepoSec about product, billing, privacy, or security.",
};

export default function ContactPage() {
  return (
    <PublicPage>
      <section className="page-hero"><div className="container"><p className="eyebrow">Contact</p><h1>Talk to a person about your launch.</h1><p>Use the form for product, billing, privacy, and account questions. Security reports have a separate responsible-disclosure address.</p></div></section>
      <section className="section"><div className="container contact-grid">
        <div className="contact-options">
          <div className="contact-option"><h2>General support</h2><a href="mailto:hello@reposec.site">hello@reposec.site</a></div>
          <div className="contact-option"><h2>Security disclosures</h2><a href="mailto:security@reposec.site">security@reposec.site</a><p>Please do not include customer repository contents or raw secrets.</p></div>
          <div className="contact-option"><h2>Response expectations</h2><p>We prioritize account access, payment, privacy, and credible security reports. RepoSec does not offer emergency incident response.</p></div>
        </div>
        <ContactForm />
      </div></section>
    </PublicPage>
  );
}
