import type { ReactNode } from "react";
import { PublicPage } from "@/components/site-shell";

export function PolicyLayout({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <PublicPage>
      <main className="prose-page">
        <div className="narrow">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="updated">Effective 24 July 2026</p>
          <article>{children}</article>
        </div>
      </main>
    </PublicPage>
  );
}
