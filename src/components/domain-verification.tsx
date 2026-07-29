"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";

interface VerificationResult {
  token?: string;
  hostname?: string;
  error?: string;
  verified?: boolean;
}

export function DomainVerification({
  projectId,
  siteId,
  hostname,
  verified,
}: {
  projectId: string;
  siteId: string;
  hostname: string;
  verified: boolean;
}) {
  const router = useRouter();
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  async function requestToken() {
    setPending(true);
    const response = await fetch(`/api/projects/${projectId}/domain-verification`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ siteId, action: "issue" }),
    });
    setResult((await response.json()) as VerificationResult);
    setPending(false);
  }

  async function verifyDomain() {
    setPending(true);
    const response = await fetch(`/api/projects/${projectId}/domain-verification`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ siteId, action: "verify", token: result?.token }),
    });
    const verification = (await response.json()) as VerificationResult;
    setResult(verification);
    setPending(false);
    if (verification.verified) router.refresh();
  }

  if (verified) {
    return <span className="verified-label"><Check size={14} /> Domain verified</span>;
  }

  return (
    <div className="verification-box">
      <h3>Verify {hostname}</h3>
      <p>Choose one method after generating a single-use token:</p>
      {!result?.token ? (
        <Button disabled={pending} onClick={requestToken} size="small" variant="secondary">
          {pending ? "Generating…" : "Generate verification token"}
        </Button>
      ) : (
        <>
          <div className="verification-method">
            <strong>DNS TXT</strong>
            <code>_reposec.{result.hostname} TXT &quot;{result.token}&quot;</code>
          </div>
          <div className="verification-method">
            <strong>Well-known file</strong>
            <code>https://{result.hostname}/.well-known/reposec-verification.txt → {result.token}</code>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button
              onClick={async () => {
                await navigator.clipboard.writeText(result.token!);
                setCopied(true);
              }}
              size="small"
              variant="secondary"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy token"}
            </Button>
            <Button disabled={pending} onClick={verifyDomain} size="small">
              <RefreshCw size={14} /> {pending ? "Checking…" : "Check verification"}
            </Button>
          </div>
        </>
      )}
      {result?.error && <p className="form-error" role="alert" style={{ marginTop: 10 }}>{result.error}</p>}
    </div>
  );
}
