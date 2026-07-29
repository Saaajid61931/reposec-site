import { createSign } from "node:crypto";
import type { WorkerConfig } from "./types.js";

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function appJwt(config: WorkerConfig) {
  if (!config.githubAppId || !config.githubAppPrivateKey) {
    throw new Error("github_app_not_configured");
  }
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ iat: now - 30, exp: now + 9 * 60, iss: config.githubAppId }));
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign(config.githubAppPrivateKey).toString("base64url")}`;
}

async function githubJson<T>(
  path: string,
  token?: string,
  options?: { method?: string; body?: unknown },
): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    method: options?.method ?? "GET",
    headers: {
      accept: "application/vnd.github+json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      "content-type": "application/json",
      "user-agent": "RepoSec-Scanner/1.0",
      "x-github-api-version": "2022-11-28",
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
    redirect: "error",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    const error = new Error(`github_api_${response.status}`);
    Object.assign(error, { status: response.status });
    throw error;
  }
  return response.json() as Promise<T>;
}

export async function installationToken(config: WorkerConfig, installationId: number) {
  const result = await githubJson<{ token: string; expires_at: string }>(
    `/app/installations/${installationId}/access_tokens`,
    appJwt(config),
    { method: "POST", body: {} },
  );
  return result.token;
}

export interface GitHubMetadata {
  id: number;
  full_name: string;
  html_url: string;
  default_branch: string;
  private: boolean;
  visibility: "public" | "private" | "internal";
  archived: boolean;
  pushed_at: string | null;
  license: { spdx_id: string } | null;
}

export async function repositoryMetadata(owner: string, name: string, token?: string) {
  return githubJson<GitHubMetadata>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, token);
}

export async function branchCommitSha(
  owner: string,
  name: string,
  branch: string,
  token?: string,
) {
  const commit = await githubJson<{ sha: string }>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commits/${encodeURIComponent(branch)}`,
    token,
  );
  return commit.sha;
}

export async function branchProtection(
  owner: string,
  name: string,
  branch: string,
  token?: string,
) {
  try {
    const protection = await githubJson<{
      required_pull_request_reviews?: {
        required_approving_review_count?: number;
        dismiss_stale_reviews?: boolean;
        require_code_owner_reviews?: boolean;
      };
      required_status_checks?: { strict?: boolean; contexts?: string[] };
      enforce_admins?: { enabled?: boolean };
    }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/branches/${encodeURIComponent(branch)}/protection`,
      token,
    );
    return { available: true as const, protection };
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 403 || status === 404) return { available: false as const, reason: `github_api_${status}` };
    throw error;
  }
}
