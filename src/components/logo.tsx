import Link from "next/link";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="brand" href="/" aria-label="RepoSec home">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 28 28" role="img">
          <path d="M7 5.5h9.5L21 10v12.5H7z" />
          <path d="M16.5 5.5V10H21M10.5 14h7M10.5 18h4.5" />
        </svg>
      </span>
      {!compact && <span>RepoSec</span>}
    </Link>
  );
}
