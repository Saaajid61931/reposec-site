import Link, { type LinkProps } from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { Confidence, Severity, Verdict } from "@/lib/types";

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

type ButtonLinkProps = LinkProps & {
  children: ReactNode;
  className?: string;
  variant?: "primary" | "secondary" | "quiet" | "danger";
  size?: "small" | "default" | "large";
};

export function ButtonLink({
  children,
  className,
  variant = "primary",
  size = "default",
  ...props
}: ButtonLinkProps) {
  return (
    <Link className={classes("button", `button-${variant}`, `button-${size}`, className)} {...props}>
      {children}
    </Link>
  );
}

type ButtonProps = ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "quiet" | "danger";
  size?: "small" | "default" | "large";
};

export function Button({
  children,
  className,
  variant = "primary",
  size = "default",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={classes("button", `button-${variant}`, `button-${size}`, className)}
      {...props}
    >
      {children}
    </button>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={`badge severity-${severity}`}>{severity}</span>;
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return <span className="badge badge-neutral">{confidence} confidence</span>;
}

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const slug = verdict.toLowerCase().replaceAll(" ", "-");
  return <span className={`verdict verdict-${slug}`}>{verdict}</span>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="eyebrow">{children}</p>;
}

export function SectionHeading({
  eyebrow,
  title,
  body,
  centered = false,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  centered?: boolean;
}) {
  return (
    <div className={classes("section-heading", centered && "centered")}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2>{title}</h2>
      {body && <p>{body}</p>}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon" aria-hidden="true">↗</span>
      <h2>{title}</h2>
      <p>{body}</p>
      {action}
    </div>
  );
}
