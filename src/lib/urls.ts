import { z } from "zod";
import { ApiError } from "@/lib/api";

export const githubRepositoryUrlSchema = z
  .string()
  .url("Enter a valid GitHub repository URL.")
  .max(500)
  .transform((value) => value.trim());

export function parseGitHubRepositoryUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError(400, "Enter a valid GitHub repository URL.");
  }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com" || url.username || url.password) {
    throw new ApiError(400, "Repository URL must use https://github.com.");
  }
  const parts = url.pathname.replace(/\.git$/, "").split("/").filter(Boolean);
  if (parts.length !== 2 || url.search || url.hash) {
    throw new ApiError(400, "Use the repository root URL, such as https://github.com/owner/repository.");
  }
  const [owner, name] = parts;
  if (!owner || !name || !/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(name)) {
    throw new ApiError(400, "GitHub owner or repository name is invalid.");
  }
  return {
    owner,
    name,
    fullName: `${owner}/${name}`,
    url: `https://github.com/${owner}/${name}`,
  };
}

export function parseRootSiteUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError(400, "Enter a valid deployed-site URL.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new ApiError(400, "Site URL must use HTTP or HTTPS and cannot contain credentials.");
  }
  if (url.pathname !== "/" || url.search || url.hash || url.port) {
    throw new ApiError(400, "Use only the public root URL without a path, query, fragment, or custom port.");
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
    || hostname.endsWith(".internal")
    || hostname.endsWith(".home")
  ) {
    throw new ApiError(400, "Local and internal hostnames are not allowed.");
  }
  url.hostname = hostname;
  return { url: url.toString().replace(/\/$/, ""), hostname };
}

export function slugify(value: string) {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "project";
}
