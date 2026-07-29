import "server-only";

import { createSign } from "node:crypto";
import { ApiError } from "@/lib/api";
import { appUrl, requireEnv } from "@/lib/env";
import { hashSensitive } from "@/lib/security/crypto";

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

export function createGitHubAppJwt() {
  const { GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY } = requireEnv("GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY");
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ iat: now - 30, exp: now + 9 * 60, iss: GITHUB_APP_ID }));
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(GITHUB_APP_PRIVATE_KEY.replaceAll("\\n", "\n")).toString("base64url");
  return `${unsigned}.${signature}`;
}

async function githubRequest<T>(
  path: string,
  {
    method = "GET",
    token,
    body,
  }: { method?: string; token: string; body?: unknown },
): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "RepoSec/1.0",
      "x-github-api-version": "2022-11-28",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new ApiError(response.status === 404 ? 404 : 502, "GitHub API request failed.", "github_api_failed");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export interface GitHubInstallation {
  id: number;
  account: { id: number; login: string; type: string };
  repository_selection: "all" | "selected";
  permissions: Record<string, string>;
  suspended_at: string | null;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  private: boolean;
  visibility: "public" | "private" | "internal";
  archived: boolean;
  default_branch: string;
  pushed_at: string | null;
}

export async function getInstallation(installationId: number) {
  return githubRequest<GitHubInstallation>(`/app/installations/${installationId}`, {
    token: createGitHubAppJwt(),
  });
}

export async function createInstallationToken(installationId: number) {
  const result = await githubRequest<{ token: string; expires_at: string }>(
    `/app/installations/${installationId}/access_tokens`,
    { method: "POST", token: createGitHubAppJwt(), body: {} },
  );
  return result;
}

export async function listInstallationRepositories(installationId: number) {
  const { token } = await createInstallationToken(installationId);
  const repositories: GitHubRepository[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const result = await githubRequest<{ total_count: number; repositories: GitHubRepository[] }>(
      `/installation/repositories?per_page=100&page=${page}`,
      { token },
    );
    repositories.push(...result.repositories);
    if (repositories.length >= result.total_count || result.repositories.length < 100) break;
  }
  return repositories;
}

export async function revokeInstallation(installationId: number) {
  await githubRequest<void>(`/app/installations/${installationId}`, {
    method: "DELETE",
    token: createGitHubAppJwt(),
  });
}

export function signGitHubSetupState(input: { userId: string; organizationId: string; expiresAt: number }) {
  const payload = base64url(JSON.stringify(input));
  return `${payload}.${hashSensitive(`github-setup:${payload}`)}`;
}

export function verifyGitHubSetupState(value: string) {
  const [payload, signature] = value.split(".");
  if (!payload || !signature || hashSensitive(`github-setup:${payload}`) !== signature) {
    throw new ApiError(400, "GitHub installation state is invalid.");
  }
  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    userId: string;
    organizationId: string;
    expiresAt: number;
  };
  if (parsed.expiresAt < Date.now()) throw new ApiError(400, "GitHub installation state has expired.");
  return parsed;
}

export function githubInstallationUrl(state: string) {
  const { GITHUB_APP_SLUG } = requireEnv("GITHUB_APP_SLUG");
  const url = new URL(`https://github.com/apps/${GITHUB_APP_SLUG}/installations/new`);
  url.searchParams.set("state", state);
  return url.toString();
}

export function githubSetupRedirect(success: boolean) {
  return `${appUrl()}/dashboard/organization?github=${success ? "connected" : "error"}`;
}
