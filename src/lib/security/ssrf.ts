import "server-only";

import { promises as dns } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import type { PeerCertificate, TLSSocket } from "node:tls";
import { ApiError } from "@/lib/api";

interface SafeResponse {
  url: string;
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
  certificate?: { validFrom?: string; validTo?: string; subject?: string };
  redirects: string[];
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
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (0xffffffff << (32 - bits)) >>> 0;
  return (value & mask) >>> 0 === (base & mask) >>> 0;
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

export function isProhibitedAddress(address: string) {
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

  // Accept only globally routable IPv6 unicast, then reject known special-use
  // allocations inside 2000::/3. This is deliberately conservative.
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
    if (isProhibitedAddress(hostname)) throw new ApiError(400, "Target resolves to a prohibited address.", "ssrf_rejected");
    return [{ address: hostname, family: isIP(hostname) as 4 | 6 }];
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const addresses = await Promise.race([
      dns.lookup(hostname, { all: true, verbatim: true }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new ApiError(408, "Target DNS lookup timed out.", "target_timeout")), timeoutMs);
      }),
    ]);
    if (addresses.length === 0 || addresses.some(({ address }) => isProhibitedAddress(address))) {
      throw new ApiError(400, "Target resolves to a prohibited address.", "ssrf_rejected");
    }
    return addresses;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function certificateSummary(certificate: PeerCertificate | null | undefined) {
  if (!certificate || Object.keys(certificate).length === 0) return undefined;
  return {
    validFrom: certificate.valid_from,
    validTo: certificate.valid_to,
    subject: certificate.subject?.CN,
  };
}

export async function safeHttpGet(
  input: string,
  {
    maxBytes = 1_048_576,
    timeoutMs = 8_000,
    maxRedirects = 3,
    allowedContentTypes,
  }: {
    maxBytes?: number;
    timeoutMs?: number;
    maxRedirects?: number;
    allowedContentTypes?: string[];
  } = {},
): Promise<SafeResponse> {
  const redirects: string[] = [];
  let current = input;
  const deadline = Date.now() + Math.max(1_000, timeoutMs);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const url = new URL(current);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      throw new ApiError(400, "URL protocol or credentials are not allowed.", "ssrf_rejected");
    }
    if (url.port && ((url.protocol === "http:" && url.port !== "80") || (url.protocol === "https:" && url.port !== "443"))) {
      throw new ApiError(400, "Only the protocol's default port is allowed.", "ssrf_rejected");
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw new ApiError(408, "Target request timed out.", "target_timeout");
    const addresses = await resolvePublic(url.hostname, Math.min(5_000, remainingMs));
    const selected = addresses[0]!;
    const transport = url.protocol === "https:" ? https : http;

    const result = await new Promise<SafeResponse>((resolve, reject) => {
      let totalTimer: ReturnType<typeof setTimeout> | undefined;
      const clearTotalTimer = () => {
        if (totalTimer) clearTimeout(totalTimer);
        totalTimer = undefined;
      };
      const request = transport.request(
        url,
        {
          method: "GET",
          headers: {
            accept: "*/*",
            "accept-encoding": "identity",
            connection: "close",
            "user-agent": "RepoSec-Passive-Check/1.0 (+https://reposec.site/security)",
          },
          lookup: ((
            _hostname: string,
            _options: unknown,
            callback: (error: Error | null, address: string, family: number) => void,
          ) => callback(null, selected.address, selected.family)) as LookupFunction,
          timeout: Math.min(remainingMs, timeoutMs),
          rejectUnauthorized: true,
        },
        (response) => {
          const chunks: Buffer[] = [];
          let bytes = 0;
          const contentType = String(response.headers["content-type"] ?? "").toLowerCase();
          if (allowedContentTypes?.length && !allowedContentTypes.some((allowed) => contentType.startsWith(allowed))) {
            response.destroy();
            clearTotalTimer();
            reject(new ApiError(400, "Target returned an unexpected content type.", "content_type_rejected"));
            return;
          }
          response.on("data", (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > maxBytes) {
              response.destroy(new ApiError(413, "Target response exceeded the size limit.", "response_too_large"));
              return;
            }
            chunks.push(chunk);
          });
          response.on("error", (error) => {
            clearTotalTimer();
            reject(error);
          });
          response.on("end", () => {
            clearTotalTimer();
            const socket = response.socket as TLSSocket;
            const cert = url.protocol === "https:"
              ? certificateSummary(socket.getPeerCertificate())
              : undefined;
            resolve({
              url: url.toString(),
              status: response.statusCode ?? 0,
              headers: response.headers,
              body: Buffer.concat(chunks),
              certificate: cert,
              redirects: [...redirects],
            });
          });
        },
      );
      totalTimer = setTimeout(
        () => request.destroy(new ApiError(408, "Target request timed out.", "target_timeout")),
        Math.max(1, deadline - Date.now()),
      );
      request.on("timeout", () => request.destroy(new ApiError(408, "Target request timed out.", "target_timeout")));
      request.on("error", (error) => {
        clearTotalTimer();
        reject(error);
      });
      request.end();
    });

    if ([301, 302, 303, 307, 308].includes(result.status)) {
      const location = result.headers.location;
      if (typeof location !== "string") throw new ApiError(400, "Target returned an invalid redirect.", "redirect_rejected");
      if (redirectCount >= maxRedirects) throw new ApiError(400, "Target returned too many redirects.", "redirect_rejected");
      current = new URL(location, url).toString();
      redirects.push(current);
      continue;
    }
    return result;
  }
  throw new ApiError(400, "Target returned too many redirects.", "redirect_rejected");
}
