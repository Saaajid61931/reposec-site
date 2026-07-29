import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import process from "node:process";

const requiredFiles = [
  ".env.example",
  ".github/workflows/ci.yml",
  ".github/dependabot.yml",
  "SECURITY.md",
  "compose.yaml",
  "next.config.ts",
  "supabase/migrations/202607240001_reposec_schema.sql",
  "worker/Dockerfile",
  "worker/.env.example",
  "worker/src/index.ts",
];

const canonicalComponents = [
  "Repository posture",
  "GitHub Actions",
  "Secrets",
  "Dependencies",
  "Static analysis",
  "Deployed site",
];

const failures = [];
const warnings = [];

const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
if (major < 22) failures.push(`Node.js 22+ is required, found ${process.versions.node}.`);

for (const file of requiredFiles) {
  try {
    await access(file, constants.R_OK);
  } catch {
    failures.push(`Missing required file: ${file}`);
  }
}

const [
  rootPackage,
  workerPackage,
  envTemplate,
  workerEnvTemplate,
  appComponents,
  workerComponents,
  migration,
] = await Promise.all([
  readFile("package.json", "utf8").then(JSON.parse),
  readFile("worker/package.json", "utf8").then(JSON.parse),
  readFile(".env.example", "utf8"),
  readFile("worker/.env.example", "utf8"),
  readFile("src/lib/scan-components.ts", "utf8"),
  readFile("worker/src/components.ts", "utf8"),
  readFile("supabase/migrations/202607240001_reposec_schema.sql", "utf8"),
]);

if (!rootPackage.workspaces?.includes("worker")) failures.push("The worker npm workspace is not configured.");
if (workerPackage.name !== "@reposec/scanner-worker") failures.push("Unexpected worker package name.");
if (rootPackage.packageManager !== "npm@10.9.2") warnings.push("packageManager is not pinned to npm@10.9.2.");

for (const key of [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CONFIG_ENCRYPTION_KEY",
  "GITHUB_APP_ID",
  "GITHUB_APP_SLUG",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_WEBHOOK_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SECRET",
  "EMAIL_FROM",
  "SUPPORT_EMAIL",
  "WORKER_SHARED_SECRET",
  "CRON_SECRET",
]) {
  if (!envTemplate.includes(`${key}=`)) failures.push(`.env.example is missing ${key}.`);
}

for (const key of [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "WORKER_SHARED_SECRET",
  "WEB_APP_URL",
  "GITHUB_APP_ID",
  "GITHUB_APP_PRIVATE_KEY",
]) {
  if (!workerEnvTemplate.includes(`${key}=`)) failures.push(`worker/.env.example is missing ${key}.`);
}

for (const component of canonicalComponents) {
  if (!appComponents.includes(`"${component}"`)) failures.push(`Web component list is missing: ${component}.`);
  if (!workerComponents.includes(`"${component}"`)) failures.push(`Worker component list is missing: ${component}.`);
  if (!migration.includes(`'${component}'`)) failures.push(`Database migration is missing component: ${component}.`);
}

try {
  await access("package-lock.json", constants.R_OK);
} catch {
  warnings.push("package-lock.json is not present. Run npm install on a healthy registry and commit the generated lockfile before release.");
}

if (failures.length > 0) {
  console.error("RepoSec preflight failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`RepoSec preflight passed on Node.js ${process.versions.node}.`);
console.log("External services are not contacted by this check.");
for (const warning of warnings) console.warn(`Warning: ${warning}`);
