import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "@/app/globals.css";
import type { ReactNode } from "react";

const productionUrl = "https://reposec.site";

export const metadata: Metadata = {
  metadataBase: new URL(productionUrl),
  title: {
    default: "RepoSec — Launch checks for AI-built software",
    template: "%s · RepoSec",
  },
  description:
    "Connect your GitHub repo and deployed app. RepoSec finds launch blockers, explains the impact, and gives your coding agent an exact prompt to fix each one.",
  applicationName: "RepoSec",
  category: "developer tools",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: productionUrl,
    siteName: "RepoSec",
    title: "Before you ship, know what your AI forgot.",
    description:
      "Defensive, non-destructive launch checks for AI-built applications.",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "RepoSec launch-readiness report" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Before you ship, know what your AI forgot.",
    description: "Defensive launch checks with copy-ready fix prompts.",
    images: ["/opengraph-image"],
  },
  icons: {
    icon: "/icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light",
  themeColor: "#f6f4ee",
};

const softwareProductJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "RepoSec",
  applicationCategory: "SecurityApplication",
  operatingSystem: "Web",
  url: productionUrl,
  description:
    "Automated, defensive launch-readiness checks for GitHub repositories and deployed applications.",
  offers: [
    {
      "@type": "Offer",
      name: "Free launch check",
      price: "0",
      priceCurrency: "USD",
    },
    {
      "@type": "Offer",
      name: "Launch Pack",
      price: "49",
      priceCurrency: "USD",
    },
    {
      "@type": "Offer",
      name: "Monitoring",
      price: "19",
      priceCurrency: "USD",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        billingDuration: "P1M",
      },
    },
    {
      "@type": "Offer",
      name: "Agency",
      price: "99",
      priceCurrency: "USD",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        billingDuration: "P1M",
      },
    },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <Script
          id="software-product-jsonld"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareProductJsonLd).replaceAll("<", "\\u003c") }}
        />
      </body>
    </html>
  );
}
