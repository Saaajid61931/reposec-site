import { hostname } from "node:os";
import { z } from "zod";
import type { WorkerConfig } from "./types.js";

const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  WORKER_SHARED_SECRET: z.string().min(32),
  WEB_APP_URL: z.string().url().default("https://reposec.site"),
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().optional(),
  WORKER_ID: z.string().optional(),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).max(60000).default(5000),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  SCAN_TIMEOUT_MS: z.coerce.number().int().min(60000).max(1800000).default(600000),
  COMPONENT_TIMEOUT_MS: z.coerce.number().int().min(10000).max(600000).default(180000),
  PUBLIC_REPO_COMPRESSED_BYTES: z.coerce.number().int().min(1_000_000).max(100_000_000).default(15_000_000),
  FULL_REPO_COMPRESSED_BYTES: z.coerce.number().int().min(1_000_000).max(500_000_000).default(50_000_000),
  REPO_EXPANDED_BYTES: z.coerce.number().int().min(5_000_000).max(1_000_000_000).default(250_000_000),
  REPO_FILE_COUNT: z.coerce.number().int().min(100).max(100_000).default(25_000),
  REPO_FILE_BYTES: z.coerce.number().int().min(10_000).max(20_000_000).default(2_000_000),
  SCANNER_RESULT_BYTES: z.coerce.number().int().min(100_000).max(100_000_000).default(20_000_000),
});

export function loadConfig(): WorkerConfig {
  const env = schema.parse(process.env);
  if ((env.GITHUB_APP_ID && !env.GITHUB_APP_PRIVATE_KEY) || (!env.GITHUB_APP_ID && env.GITHUB_APP_PRIVATE_KEY)) {
    throw new Error("GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY must be set together.");
  }
  return {
    supabaseUrl: env.SUPABASE_URL,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    workerSharedSecret: env.WORKER_SHARED_SECRET,
    webAppUrl: env.WEB_APP_URL.replace(/\/$/, ""),
    githubAppId: env.GITHUB_APP_ID,
    githubAppPrivateKey: env.GITHUB_APP_PRIVATE_KEY?.replaceAll("\\n", "\n"),
    workerId: env.WORKER_ID ?? `${hostname()}-${process.pid}`,
    pollIntervalMs: env.WORKER_POLL_INTERVAL_MS,
    concurrency: env.WORKER_CONCURRENCY,
    limits: {
      scanTimeoutMs: env.SCAN_TIMEOUT_MS,
      componentTimeoutMs: env.COMPONENT_TIMEOUT_MS,
      publicCompressedBytes: env.PUBLIC_REPO_COMPRESSED_BYTES,
      fullCompressedBytes: env.FULL_REPO_COMPRESSED_BYTES,
      expandedBytes: env.REPO_EXPANDED_BYTES,
      fileCount: env.REPO_FILE_COUNT,
      fileBytes: env.REPO_FILE_BYTES,
      resultBytes: env.SCANNER_RESULT_BYTES,
    },
  };
}
