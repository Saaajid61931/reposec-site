import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import type { TLSSocket } from "node:tls";
import { createFinding } from "../findings.js";
import type { ComponentResult, NormalizedFinding, RepositoryTarget } from "../types.js";

interface PassiveResponse {
  url: URL;
  status: number;
  headers: http.IncomingHttpHeaders;
  redirects: string[];
  certificate?: {
    validFrom?: string;
    validTo?: string;
    subject?: string;
  };
}

class SiteCheckError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

const ipv4Ranges: Array<[number, number]> = [
  [0x00000000, 8],
  [0x0a000000, 8],
  [0x64400000, 10],
  [0x7f000000, 8],
  [0xa9fe0000, 16],
  [0xac100000, 12],
  [0xc0000000, 24],
  [0xc0000200, 24],
  [0xc0586300, 24],
  [0xc0a80000, 16],
  [0xc6120000, 15],
  [0xc6336400, 24],
  [0xcb007100, 24],
  [0xe0000000, 4],
  [0xf0000000, 4],
];

function ipv4Number(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return (((parts[0]! << 24) >>> 0) + (parts[1]! << 16) + (parts[2]! << 8) + parts[3]!) >>> 0;
}

function matchesV4Prefix(value: number, base: number, bits: number) {
  const mask = bits === 0 ? 0 : bits === 32 ? 0xffffffff : (0xffffffff << (32 - bits)) >>> 0;
  return bits === 0 || (value & mask) >>> 0 === (base & mask) >>> 0;
}

function expandIpv6(address: string): bigint | null {
  const zoneIndex = address.indexOf("%");
  const input = (zoneIndex >= 0 ? address.slice(0, zoneIndex) : address).toLowerCase();
  const v4Match = input.match(/(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  let normalized = input;
  if (v4Match) {
    const v4 = ipv4Number(v4Match[2]!);
    if (v4 === null) return null;
    normalized = `${v4Match[1]}${((v4 >>> 16) & 0xffff).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }
  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":").filter(Boolean) : [];
  const right = halves[1] ? halves[1].split(":").filter(Boolean) : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.reduce((result, group) => (result << 16n) + BigInt(parseInt(group, 16)), 0n);
}

function matchesV6Prefix(value: bigint, base: bigint, bits: number) {
  const shift = BigInt(128 - bits);
  return (value >> shift) === (base >> shift);
}

function isProhibitedAddress(address: string) {
  const family = isIP(address);
  if (family === 4) {
    const value = ipv4Number(address);
    return value === null || ipv4Ranges.some(([base, bits]) => matchesV4Prefix(value, base, bits));
  }
  if (family !== 6) return true;
  const value = expandIpv6(address);
  if (value === null) return true;
  const mappedBase = expandIpv6("::ffff:0:0")!;
  if (matchesV6Prefix(value, mappedBase, 96)) {
    const mapped = Number(value & 0xffffffffn);
    return ipv4Ranges.some(([base, bits]) => matchesV4Prefix(mapped, base, bits));
  }

  // Public IPv6 unicast is allocated from 2000::/3. Reject local, link-local,
  // multicast, translation, and other special-use ranges by default.
  if (!matchesV6Prefix(value, expandIpv6("2000::")!, 3)) return true;
  const prohibitedV6: Array<[bigint, number]> = [
    [expandIpv6("2001::")!, 32],
    [expandIpv6("2001:2::")!, 48],
    [expandIpv6("2001:3::")!, 32],
    [expandIpv6("2001:4:112::")!, 48],
    [expandIpv6("2001:10::")!, 28],
    [expandIpv6("2001:20::")!, 28],
    [expandIpv6("2001:db8::")!, 32],
    [expandIpv6("2002::")!, 16],
    [expandIpv6("3fff::")!, 20],
  ];
  return prohibitedV6.some(([base, bits]) => matchesV6Prefix(value, base, bits));
}

async function resolvePublic(hostname: string, timeoutMs: number) {
  if (isIP(hostname)) {
    if (isProhibitedAddress(hostname)) throw new SiteCheckError("site_ssrf_rejected", "Target address is not public.");
    return [{ address: hostname, family: isIP(hostname) as 4 | 6 }];
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const addresses = await Promise.race([
      lookup(hostname, { all: true, verbatim: true }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new SiteCheckError("site_dns_timeout", "Target DNS lookup timed out.")), timeoutMs);
      }),
    ]);
    const resolved = addresses as Array<{ address: string; family: 4 | 6 }>;
    if (resolved.length === 0 || resolved.some(({ address }: { address: string }) => isProhibitedAddress(address))) {
      throw new SiteCheckError("site_ssrf_rejected", "Target DNS contains a prohibited address.");
    }
    return resolved;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function normalizedHeader(headers: http.IncomingHttpHeaders, name: string) {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value.join(", ") : value ?? "";
}

function certificateSummary(socket: TLSSocket) {
  const certificate = socket.getPeerCertificate();
  if (!certificate || Object.keys(certificate).length === 0) return undefined;
  return {
    validFrom: certificate.valid_from,
    validTo: certificate.valid_to,
    subject: certificate.subject?.CN,
  };
}

async function passiveGet(input: string, timeoutMs: number): Promise<PassiveResponse> {
  const redirects: string[] = [];
  let current = input;
  const deadline = Date.now() + Math.max(1, Math.min(25_000, timeoutMs));

  for (let redirectCount = 0; redirectCount <= 4; redirectCount += 1) {
    const url = new URL(current);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      throw new SiteCheckError("site_url_rejected", "Only credential-free HTTP and HTTPS targets are allowed.");
    }
    if (url.port && ((url.protocol === "http:" && url.port !== "80") || (url.protocol === "https:" && url.port !== "443"))) {
      throw new SiteCheckError("site_port_rejected", "Only the default port for the selected protocol is allowed.");
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw new SiteCheckError("site_timeout", "Passive site check timed out.");

    const addresses = await resolvePublic(url.hostname, Math.min(5_000, remainingMs));
    const selected = addresses[0]!;
    const transport = url.protocol === "https:" ? https : http;
    const response = await new Promise<PassiveResponse>((resolve, reject) => {
      let totalTimer: ReturnType<typeof setTimeout> | undefined;
      const clearTotalTimer = () => {
        if (totalTimer) clearTimeout(totalTimer);
        totalTimer = undefined;
      };
      const pinnedLookup = ((
        _hostname: string,
        _options: unknown,
        callback: (error: Error | null, address: string, family: number) => void,
      ) => {
        callback(null, selected.address, selected.family);
      }) as LookupFunction;
      const request = transport.request(url, {
        method: "GET",
        headers: {
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
          "accept-encoding": "identity",
          connection: "close",
          "user-agent": "RepoSec-Passive-Check/1.0 (+https://reposec.site/security)",
        },
        lookup: pinnedLookup,
        rejectUnauthorized: true,
        timeout: Math.min(8_000, Math.max(1_000, deadline - Date.now())),
      }, (incoming: http.IncomingMessage) => {
        let bytes = 0;
        incoming.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 512_000) incoming.destroy(new SiteCheckError("site_response_too_large", "Target response exceeded the passive-check limit."));
        });
        incoming.on("error", (error) => {
          clearTotalTimer();
          reject(error);
        });
        incoming.on("end", () => {
          clearTotalTimer();
          const socket = incoming.socket as TLSSocket;
          resolve({
            url,
            status: incoming.statusCode ?? 0,
            headers: incoming.headers,
            redirects: [...redirects],
            certificate: url.protocol === "https:" ? certificateSummary(socket) : undefined,
          });
        });
      });
      totalTimer = setTimeout(
        () => request.destroy(new SiteCheckError("site_timeout", "Passive site check timed out.")),
        Math.max(1, deadline - Date.now()),
      );
      request.on("timeout", () => request.destroy(new SiteCheckError("site_timeout", "Target request timed out.")));
      request.on("error", (error) => {
        clearTotalTimer();
        reject(error);
      });
      request.end();
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.location;
      if (typeof location !== "string" || redirectCount >= 4) {
        throw new SiteCheckError("site_redirect_rejected", "Target returned an invalid or excessive redirect chain.");
      }
      const next = new URL(location, url);
      current = next.toString();
      redirects.push(current);
      continue;
    }
    return response;
  }
  throw new SiteCheckError("site_redirect_rejected", "Target returned too many redirects.");
}

function finding(input: Omit<Parameters<typeof createFinding>[0], "detectionSource">) {
  return createFinding({ ...input, detectionSource: "RepoSec passive deployed-site check" });
}

export async function scanDeployedSite(target: RepositoryTarget, timeoutMs = 25_000): Promise<ComponentResult> {
  const started = Date.now();
  if (!target.site) {
    return {
      name: "Deployed site",
      version: "reposec-site-2026.07",
      status: "skipped",
      required: false,
      ruleCount: 0,
      findings: [],
      summary: "No deployed-site target was configured",
      durationMs: Date.now() - started,
    };
  }

  try {
    const response = await passiveGet(target.site.url, timeoutMs);
    const findings: NormalizedFinding[] = [];
    const passedControls: Array<{ name: string; detail: string }> = [];
    const csp = normalizedHeader(response.headers, "content-security-policy");
    const hsts = normalizedHeader(response.headers, "strict-transport-security");
    const contentTypeOptions = normalizedHeader(response.headers, "x-content-type-options");
    const referrer = normalizedHeader(response.headers, "referrer-policy");
    const frameOptions = normalizedHeader(response.headers, "x-frame-options");
    const permissions = normalizedHeader(response.headers, "permissions-policy");
    const cors = normalizedHeader(response.headers, "access-control-allow-origin");
    const credentials = normalizedHeader(response.headers, "access-control-allow-credentials");
    const server = normalizedHeader(response.headers, "server");
    const poweredBy = normalizedHeader(response.headers, "x-powered-by");
    const cookies = response.headers["set-cookie"] ?? [];
    const cookieList = Array.isArray(cookies) ? cookies : [cookies];

    if (!csp) {
      findings.push(finding({
        ruleId: "REPOSEC-HEADER-CSP-001",
        title: "Content Security Policy is not set",
        category: "Deployed-site headers",
        severity: "medium",
        confidence: "high",
        explanation: "The final root response did not include an enforced Content-Security-Policy header.",
        impact: "A restrictive policy can reduce the impact of script injection by limiting executable and connectable origins.",
        evidence: { excerpt: `GET ${response.url.origin}/ → content-security-policy: [not observed]` },
        remediation: "Inventory required origins and deploy a restrictive enforced Content-Security-Policy without broad wildcards.",
        desiredBehavior: "the production root response includes an enforced policy that allows only required sources.",
        verification: "core production flows work without CSP violations and a passive rescan observes the enforced header.",
        references: [{ label: "MDN CSP", url: "https://developer.mozilla.org/docs/Web/HTTP/Headers/Content-Security-Policy" }],
        fingerprintAnchor: response.url.hostname,
      }));
    } else passedControls.push({ name: "Content Security Policy", detail: "An enforced CSP header was observed." });

    if (response.url.protocol !== "https:") {
      findings.push(finding({
        ruleId: "REPOSEC-HTTPS-001",
        title: "Deployed site does not finish on HTTPS",
        category: "Transport security",
        severity: "high",
        confidence: "high",
        explanation: "The passive root request completed over HTTP instead of HTTPS.",
        impact: "Network attackers can observe or modify unencrypted traffic and session material.",
        evidence: { excerpt: `Final URL scheme: ${response.url.protocol}` },
        remediation: "Provision a valid certificate and redirect all HTTP traffic to the equivalent HTTPS origin.",
        desiredBehavior: "all public requests finish on HTTPS and HTTP exists only as a redirect entry point.",
        verification: "the root URL and every redirect finish on HTTPS with a trusted certificate.",
        fingerprintAnchor: response.url.hostname,
      }));
    } else passedControls.push({ name: "HTTPS", detail: "The final root response used HTTPS." });

    if (response.url.protocol === "https:" && !hsts) {
      findings.push(finding({
        ruleId: "REPOSEC-HEADER-HSTS-001",
        title: "Strict Transport Security is not set",
        category: "Transport security",
        severity: "medium",
        confidence: "high",
        explanation: "The HTTPS response did not include Strict-Transport-Security.",
        impact: "A first insecure navigation can remain vulnerable to downgrade or cookie exposure on hostile networks.",
        evidence: { excerpt: "strict-transport-security: [not observed]" },
        remediation: "After confirming HTTPS coverage for the intended host scope, add a suitable HSTS max-age and consider includeSubDomains.",
        desiredBehavior: "supported browsers remember to use HTTPS for the intended host scope.",
        verification: "the production HTTPS response includes the intended Strict-Transport-Security directive.",
        fingerprintAnchor: response.url.hostname,
      }));
    } else if (hsts) passedControls.push({ name: "HSTS", detail: "Strict-Transport-Security was observed." });

    if (contentTypeOptions.toLowerCase() !== "nosniff") {
      findings.push(finding({
        ruleId: "REPOSEC-HEADER-NOSNIFF-001",
        title: "MIME sniffing protection is not set",
        category: "Deployed-site headers",
        severity: "low",
        confidence: "high",
        explanation: "The response did not include X-Content-Type-Options: nosniff.",
        impact: "Browsers can interpret some resources as a more dangerous content type than intended.",
        evidence: { excerpt: `x-content-type-options: ${contentTypeOptions || "[not observed]"}` },
        remediation: "Send X-Content-Type-Options: nosniff on application responses and static assets.",
        desiredBehavior: "browsers do not MIME-sniff responses away from their declared type.",
        verification: "the root response includes X-Content-Type-Options: nosniff.",
        fingerprintAnchor: response.url.hostname,
      }));
    } else passedControls.push({ name: "MIME sniffing", detail: "X-Content-Type-Options: nosniff was observed." });

    if (!referrer) {
      findings.push(finding({
        ruleId: "REPOSEC-HEADER-REFERRER-001",
        title: "Referrer Policy is not set",
        category: "Deployed-site headers",
        severity: "low",
        confidence: "high",
        explanation: "The response did not define a Referrer-Policy.",
        impact: "Full paths or query details can be disclosed to external origins during navigation.",
        evidence: { excerpt: "referrer-policy: [not observed]" },
        remediation: "Set a policy such as strict-origin-when-cross-origin and verify analytics and sign-in flows.",
        desiredBehavior: "cross-origin requests receive only the minimum intended referrer information.",
        verification: "the production root response includes the selected Referrer-Policy.",
        fingerprintAnchor: response.url.hostname,
      }));
    } else passedControls.push({ name: "Referrer policy", detail: "A Referrer-Policy header was observed." });

    if (!frameOptions && !/frame-ancestors\s+[^;]+/i.test(csp)) {
      findings.push(finding({
        ruleId: "REPOSEC-HEADER-FRAME-001",
        title: "Framing protection is not set",
        category: "Deployed-site headers",
        severity: "medium",
        confidence: "high",
        explanation: "Neither X-Frame-Options nor a CSP frame-ancestors directive was observed.",
        impact: "An attacker-controlled page can frame the application and attempt clickjacking attacks.",
        evidence: { excerpt: "x-frame-options: [not observed]; CSP frame-ancestors: [not observed]" },
        remediation: "Set CSP frame-ancestors to the required origins, or deny framing when no embedding is needed.",
        desiredBehavior: "only explicitly approved origins can frame the application.",
        verification: "unauthorized embedding is blocked and required integrations still function.",
        fingerprintAnchor: response.url.hostname,
      }));
    } else passedControls.push({ name: "Framing protection", detail: "Framing restrictions were observed." });

    if (!permissions) {
      findings.push(finding({
        ruleId: "REPOSEC-HEADER-PERMISSIONS-001",
        title: "Permissions Policy is not set",
        category: "Deployed-site headers",
        severity: "low",
        confidence: "medium",
        explanation: "The root response did not define a Permissions-Policy.",
        impact: "Browser capabilities remain available to the page and embedded content under default browser rules.",
        evidence: { excerpt: "permissions-policy: [not observed]" },
        remediation: "Disable unused browser capabilities and allow only the features required by product flows.",
        desiredBehavior: "unused browser capabilities are explicitly disabled for the application and embedded content.",
        verification: "required product features work and the production response includes the intended Permissions-Policy.",
        heuristic: true,
        fingerprintAnchor: response.url.hostname,
      }));
    } else passedControls.push({ name: "Permissions policy", detail: "A Permissions-Policy header was observed." });

    if (cors === "*" && credentials.toLowerCase() === "true") {
      findings.push(finding({
        ruleId: "REPOSEC-CORS-001",
        title: "Credentialed CORS response uses a wildcard origin",
        category: "Authorization",
        severity: "high",
        confidence: "high",
        explanation: "The root response advertises wildcard cross-origin access together with credentialed requests.",
        impact: "A permissive cross-origin policy can expose authenticated data to untrusted origins when mirrored elsewhere in the application.",
        evidence: { excerpt: "access-control-allow-origin: *; access-control-allow-credentials: true" },
        remediation: "Allow only trusted origins and vary responses by Origin when credentials are required.",
        desiredBehavior: "credentialed cross-origin access is restricted to an explicit trusted origin set.",
        verification: "untrusted origins receive no credentialed CORS access and intended integrations still pass.",
        fingerprintAnchor: response.url.hostname,
      }));
    } else passedControls.push({ name: "CORS root posture", detail: "No wildcard credentialed CORS combination was observed on the root response." });

    const insecureCookies = cookieList.filter((cookie) => response.url.protocol === "https:" && !/;\s*secure(?:;|$)/i.test(cookie));
    if (insecureCookies.length > 0) {
      findings.push(finding({
        ruleId: "REPOSEC-COOKIE-SECURE-001",
        title: "A response cookie is missing the Secure attribute",
        category: "Session security",
        severity: "medium",
        confidence: "high",
        explanation: `${insecureCookies.length} cookie(s) set on the HTTPS root response did not include Secure. Cookie values were not retained.`,
        impact: "A browser can send the cookie over an insecure connection if one becomes reachable.",
        evidence: { excerpt: `[${insecureCookies.length} cookie(s) missing Secure; values not retained]` },
        remediation: "Mark session and sensitive cookies Secure and keep the application HTTPS-only.",
        desiredBehavior: "every sensitive cookie is transmitted only over HTTPS.",
        verification: "the production response sets sensitive cookies with Secure and authentication still works.",
        fingerprintAnchor: response.url.hostname,
      }));
    } else passedControls.push({ name: "Secure cookies", detail: "No HTTPS response cookie missing Secure was observed." });

    const weakSameSiteCookies = cookieList.filter((cookie) => !/;\s*samesite=(?:lax|strict|none)(?:;|$)/i.test(cookie));
    if (weakSameSiteCookies.length > 0) {
      findings.push(finding({
        ruleId: "REPOSEC-COOKIE-SAMESITE-001",
        title: "A response cookie has no explicit SameSite policy",
        category: "Session security",
        severity: "low",
        confidence: "medium",
        explanation: `${weakSameSiteCookies.length} cookie(s) did not declare SameSite. Cookie values were not retained.`,
        impact: "Cross-site request behavior depends on browser defaults instead of an explicit application policy.",
        evidence: { excerpt: `[${weakSameSiteCookies.length} cookie(s) missing SameSite; values not retained]` },
        remediation: "Set SameSite=Lax or Strict for ordinary session cookies, and use None; Secure only where cross-site behavior is required.",
        desiredBehavior: "each cookie has an intentional cross-site delivery policy.",
        verification: "authentication and integrations work while cookies include the intended SameSite attribute.",
        heuristic: true,
        fingerprintAnchor: response.url.hostname,
      }));
    } else passedControls.push({ name: "Cookie SameSite", detail: "Observed cookies declared an explicit SameSite policy." });

    if (server || poweredBy) {
      findings.push(finding({
        ruleId: "REPOSEC-HEADER-DISCLOSURE-001",
        title: "Technology-identifying response headers are exposed",
        category: "Information disclosure",
        severity: "info",
        confidence: "high",
        explanation: "The root response includes Server or X-Powered-By metadata.",
        impact: "Precise platform details can make opportunistic targeting easier, although they do not create a vulnerability by themselves.",
        evidence: { excerpt: `server: ${server || "[not observed]"}; x-powered-by: ${poweredBy || "[not observed]"}` },
        remediation: "Remove unnecessary technology-identifying headers at the application or edge layer.",
        desiredBehavior: "public responses expose only operationally required metadata.",
        verification: "the headers are absent without affecting routing or monitoring.",
        fingerprintAnchor: response.url.hostname,
      }));
    } else passedControls.push({ name: "Technology disclosure", detail: "No Server or X-Powered-By header was observed." });

    if (response.status >= 500 || response.status === 0) {
      findings.push(finding({
        ruleId: "REPOSEC-SITE-STATUS-001",
        title: "Deployed root URL returned a server error",
        category: "Deployment readiness",
        severity: "medium",
        confidence: "high",
        explanation: `The final passive root request returned HTTP ${response.status}.`,
        impact: "A failing production entry point can prevent users and automated controls from reaching the application.",
        evidence: { excerpt: `GET ${response.url.origin}/ → HTTP ${response.status}` },
        remediation: "Repair the production deployment or routing error and keep the root response deterministic.",
        desiredBehavior: "the public root URL returns a successful or intentional redirect response.",
        verification: "the root URL returns the intended non-error status from an external network.",
        fingerprintAnchor: response.url.hostname,
      }));
    } else passedControls.push({ name: "Root availability", detail: `The final root response returned HTTP ${response.status}.` });

    if (response.certificate?.validTo) {
      const expiresAt = Date.parse(response.certificate.validTo);
      if (Number.isFinite(expiresAt) && expiresAt - Date.now() < 14 * 24 * 60 * 60 * 1000) {
        findings.push(finding({
          ruleId: "REPOSEC-TLS-EXPIRY-001",
          title: "TLS certificate expires soon",
          category: "Transport security",
          severity: "medium",
          confidence: "high",
          explanation: "The observed TLS certificate expires within 14 days.",
          impact: "An expired certificate can block users and break API or webhook clients.",
          evidence: { excerpt: `Certificate valid to: ${response.certificate.validTo}` },
          remediation: "Repair or verify automated certificate renewal before the expiry date.",
          desiredBehavior: "the production certificate renews before its operational warning window.",
          verification: "an external TLS check observes the renewed certificate and expected chain.",
          fingerprintAnchor: response.url.hostname,
        }));
      } else passedControls.push({ name: "TLS validity", detail: "The observed certificate was not within the 14-day expiry window." });
    }

    return {
      name: "Deployed site",
      version: "reposec-site-2026.07",
      status: "passed",
      required: target.site.verified,
      ruleCount: 13,
      findings,
      summary: `Passive root check completed after ${response.redirects.length} redirect(s); HTTP ${response.status}`,
      durationMs: Date.now() - started,
      passedControls,
    };
  } catch (error) {
    const code = error instanceof SiteCheckError
      ? error.code
      : (error instanceof Error ? error.message : "site_check_failed").replace(/[^a-z0-9_]+/gi, "_").toLowerCase().slice(0, 80);
    return {
      name: "Deployed site",
      version: "reposec-site-2026.07",
      status: /timeout/i.test(code) ? "timed_out" : "failed",
      required: Boolean(target.site?.verified),
      ruleCount: 13,
      findings: [],
      summary: "Passive deployed-site check did not complete",
      errorCode: code,
      errorDetail: "The passive request failed before a safe response summary was available.",
      durationMs: Date.now() - started,
    };
  }
}
