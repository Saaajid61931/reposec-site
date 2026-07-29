import { createWriteStream } from "node:fs";
import { lstat, mkdir, mkdtemp, readdir, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as tar from "tar";
import { branchCommitSha, installationToken, repositoryMetadata } from "./github.js";
import type { RepositorySnapshot, RepositoryTarget, WorkerConfig } from "./types.js";

const allowedArchiveHosts = new Set([
  "api.github.com",
  "codeload.github.com",
  "objects.githubusercontent.com",
  "github.com",
]);

interface ArchiveEntryMetadata {
  type?: string;
  size: number;
}

class RepositoryLimitError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

function remainingBefore(deadlineAt: number) {
  const remainingMs = deadlineAt - Date.now();
  if (remainingMs <= 0) throw new Error("scan_timeout");
  return remainingMs;
}

async function downloadArchive(
  config: WorkerConfig,
  target: RepositoryTarget,
  destination: string,
  maxBytes: number,
  ref: string,
  token: string | undefined,
  deadlineAt: number,
) {
  let current = `https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.name)}/tarball/${encodeURIComponent(ref)}`;
  let authorization = token;

  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const url = new URL(current);
    if (url.protocol !== "https:" || !allowedArchiveHosts.has(url.hostname)) {
      throw new Error("github_archive_redirect_rejected");
    }
    const signal = AbortSignal.timeout(remainingBefore(deadlineAt));
    const response = await fetch(url, {
      redirect: "manual",
      headers: {
        accept: "application/vnd.github+json",
        ...(authorization ? { authorization: `Bearer ${authorization}` } : {}),
        "user-agent": "RepoSec-Scanner/1.0",
        "x-github-api-version": "2022-11-28",
      },
      signal,
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirects === 3) throw new Error("github_archive_redirect_rejected");
      const next = new URL(location, url);
      if (!allowedArchiveHosts.has(next.hostname) || next.protocol !== "https:") {
        throw new Error("github_archive_redirect_rejected");
      }
      if (next.hostname !== "api.github.com") authorization = undefined;
      current = next.toString();
      continue;
    }
    if (!response.ok || !response.body) throw new Error(`github_archive_${response.status}`);
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > maxBytes) throw new RepositoryLimitError("repository_compressed_limit", "Repository archive exceeds the compressed-size limit.");

    let bytes = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null, data?: Buffer) => void) {
        try {
          remainingBefore(deadlineAt);
        } catch (error) {
          callback(error as Error);
          return;
        }
        bytes += chunk.length;
        if (bytes > maxBytes) {
          callback(new RepositoryLimitError("repository_compressed_limit", "Repository archive exceeds the compressed-size limit."));
          return;
        }
        callback(null, chunk);
      },
    });
    const readable = Readable.fromWeb(response.body as import("node:stream/web").ReadableStream<Uint8Array>);
    await pipeline(
      readable,
      limiter,
      createWriteStream(destination, { flags: "wx", mode: 0o600 }),
      { signal },
    );
    return bytes;
  }
  throw new Error("github_archive_redirect_rejected");
}

async function walk(root: string, limits: WorkerConfig["limits"], deadlineAt: number) {
  const files: RepositorySnapshot["files"] = [];
  let expandedBytes = 0;
  let fileCount = 0;
  const queue = [root];

  while (queue.length > 0) {
    remainingBefore(deadlineAt);
    const directory = queue.pop()!;
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      remainingBefore(deadlineAt);
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
      if (entry.isSymbolicLink()) throw new RepositoryLimitError("repository_link_rejected", "Repository contains a symbolic link.");
      if (entry.isDirectory()) {
        if (entry.name === ".git") continue;
        queue.push(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const metadata = await stat(absolutePath);
      fileCount += 1;
      expandedBytes += metadata.size;
      if (fileCount > limits.fileCount) throw new RepositoryLimitError("repository_file_count_limit", "Repository exceeds the file-count limit.");
      if (metadata.size > limits.fileBytes) throw new RepositoryLimitError("repository_file_size_limit", `File exceeds the per-file limit: ${relativePath}`);
      if (expandedBytes > limits.expandedBytes) throw new RepositoryLimitError("repository_expanded_limit", "Repository exceeds the expanded-size limit.");
      files.push({ relativePath, absolutePath, size: metadata.size });
    }
  }
  return { files, expandedBytes, fileCount };
}

export async function createSnapshot(
  config: WorkerConfig,
  target: RepositoryTarget,
  mode: "free" | "launch_pack" | "monitoring",
  requestedCommitSha: string | undefined,
  deadlineAt: number,
): Promise<{ workspace: string; snapshot: RepositorySnapshot; githubToken?: string }> {
  const prefix = path.join(tmpdir(), "reposec-");
  await mkdir(tmpdir(), { recursive: true });
  const workspace = await mkdtemp(prefix);

  try {
    const root = path.join(workspace, "repository");
    const archivePath = path.join(workspace, "repository.tar.gz");
    await mkdir(root, { mode: 0o700 });

    let githubToken: string | undefined;
    remainingBefore(deadlineAt);
    if (target.installationId) githubToken = await installationToken(config, target.installationId);
    remainingBefore(deadlineAt);
    const metadata = await repositoryMetadata(target.owner, target.name, githubToken);
    remainingBefore(deadlineAt);
    target.defaultBranch = metadata.default_branch;
    target.archived = metadata.archived;
    target.visibility = metadata.visibility;
    target.pushedAt = metadata.pushed_at;

    const commitSha = requestedCommitSha
      ?? await branchCommitSha(target.owner, target.name, metadata.default_branch, githubToken);
    if (!/^[0-9a-f]{40}$/i.test(commitSha)) throw new Error("github_commit_sha_invalid");
    const compressedBytes = await downloadArchive(
      config,
      target,
      archivePath,
      mode === "free" ? config.limits.publicCompressedBytes : config.limits.fullCompressedBytes,
      commitSha,
      githubToken,
      deadlineAt,
    );

    let declaredBytes = 0;
    let declaredFiles = 0;
    await tar.x({
      file: archivePath,
      cwd: root,
      strip: 1,
      preservePaths: false,
      strict: true,
      filter(entryPath: string, entry: ArchiveEntryMetadata) {
        remainingBefore(deadlineAt);
        const normalized = entryPath.replaceAll("\\", "/");
        if (normalized.startsWith("/") || normalized.split("/").includes("..")) {
          throw new RepositoryLimitError("repository_path_rejected", "Archive contains an unsafe path.");
        }
        if (entry.type === "SymbolicLink" || entry.type === "Link") {
          throw new RepositoryLimitError("repository_link_rejected", "Archive contains a link.");
        }
        if (entry.type === "File") {
          declaredFiles += 1;
          declaredBytes += entry.size;
          if (entry.size > config.limits.fileBytes) {
            throw new RepositoryLimitError("repository_file_size_limit", `Archive file exceeds the per-file limit: ${normalized}`);
          }
          if (declaredFiles > config.limits.fileCount || declaredBytes > config.limits.expandedBytes) {
            throw new RepositoryLimitError("repository_expanded_limit", "Archive exceeds expanded resource limits.");
          }
        }
        return true;
      },
    });

    const resolvedRoot = await realpath(root);
    const resolvedWorkspace = await realpath(workspace);
    if (!resolvedRoot.startsWith(`${resolvedWorkspace}${path.sep}`)) throw new Error("workspace_path_escape");
    const walked = await walk(resolvedRoot, config.limits, deadlineAt);
    return {
      workspace,
      githubToken,
      snapshot: {
        root: resolvedRoot,
        archivePath,
        commitSha,
        defaultBranch: metadata.default_branch,
        compressedBytes,
        expandedBytes: walked.expandedBytes,
        fileCount: walked.fileCount,
        files: walked.files,
      },
    };
  } catch (error) {
    await cleanupWorkspace(workspace).catch(() => undefined);
    throw error;
  }
}

export async function cleanupWorkspace(workspace: string) {
  const resolved = path.resolve(workspace);
  const allowedPrefix = `${path.resolve(tmpdir())}${path.sep}reposec-`;
  if (!resolved.startsWith(allowedPrefix)) throw new Error("workspace_cleanup_path_rejected");
  const metadata = await lstat(resolved).catch(() => null);
  if (metadata?.isDirectory()) await rm(resolved, { recursive: true, force: true, maxRetries: 2 });
}

export function repositoryErrorCode(error: unknown) {
  if (error instanceof RepositoryLimitError) return error.code;
  const message = error instanceof Error ? error.message : "repository_error";
  return message.replace(/[^a-z0-9_]+/gi, "_").toLowerCase().slice(0, 80);
}
