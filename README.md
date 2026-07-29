# RepoSec

RepoSec performs automated launch-readiness security checks for repositories and deployed sites. The current implementation is a Next.js web application backed by Supabase, plus a separate Dockerized scanner worker.

The intentionally deleted legacy static site is not part of this application.

## What is included

- Public, limited repository checks without account creation
- Paid project scans and monitoring rescans
- GitHub OAuth for sign-in and a read-only GitHub App for private repositories and push-triggered scans
- Stripe checkout, subscriptions, refunds, and entitlement tracking
- Resend transactional email with signed delivery-event handling
- Supabase PostgreSQL persistence, row-level security, append-only evidence, and audit history
- Passive deployed-site checks with redirect-by-redirect DNS validation and SSRF protection
- Scanner orchestration for RepoSec rules, Gitleaks, Semgrep, Trivy, and OSV-Scanner
- Stable finding fingerprints, deduplication, fixed-finding detection, and regression detection

## Security boundaries

The scanner never installs repository dependencies or executes repository code. It downloads one exact repository snapshot into an ephemeral workspace, enforces archive and file limits, scans static content, redacts secret-shaped values, persists only normalized findings and redacted evidence, then removes the workspace.

The web application and worker use separate environment files. The worker requires the Supabase service-role key, but the browser never receives it.

See [Security model](docs/SECURITY-MODEL.md) for the full trust-boundary description.

## Architecture

```text
Browser
  -> Next.js web application
       -> Supabase Auth and PostgreSQL
       -> GitHub App API
       -> Stripe
       -> Resend

Docker scanner worker
  -> polls Supabase scan_jobs
  -> downloads an exact GitHub snapshot
  -> runs static scanners without repository execution
  -> persists normalized results
  -> sends signed lifecycle events to the web application
```

Canonical scan components:

1. Repository posture
2. GitHub Actions
3. Secrets
4. Dependencies
5. Static analysis
6. Deployed site

## Local setup

Requirements:

- Node.js 22 or later
- npm 10 or later
- A Supabase project or local Supabase CLI stack
- Docker for the scanner image

Install the web application and worker dependencies from the repository root:

```bash
npm ci
```

The root npm workspace installs both the Next.js application and `@reposec/scanner-worker`. For a first install before `package-lock.json` exists, run `npm install` once and commit the generated root lockfile.

Create local configuration:

```bash
cp .env.example .env.local
cp worker/.env.example .env.worker
```

Apply migrations in filename order:

```bash
supabase db push
```

Run the web application:

```bash
npm run dev
```

Build and start the worker:

```bash
docker compose build scanner-worker
docker compose up -d scanner-worker
```

The worker reads `.env.worker` through `compose.yaml`.

## Validation

```bash
npm run preflight
npm run typecheck
npm run lint
npm run build
npm run worker:typecheck
npm run worker:build

docker compose config
docker compose build scanner-worker
```

`npm run check` runs preflight, TypeScript, ESLint, the Next.js production build, worker typechecking, and the worker build in sequence. GitHub Actions runs the same command.

## Deployment

Use [Deployment guide](docs/DEPLOYMENT.md) for Supabase, GitHub, Stripe, Resend, Vercel, worker, DNS, and webhook configuration.

Use [Operations guide](docs/OPERATIONS.md) for scan retries, scanner database refreshes, webhook troubleshooting, backups, and incident procedures.

Use [Validation guide](docs/VALIDATION.md) as the final release gate.

## Important paths

- `SECURITY.md`: supported-version and private disclosure policy
- `.github/dependabot.yml`: dependency and workflow update automation
- `src/app`: Next.js routes and pages
- `src/lib`: authentication, persistence adapters, integrations, and security utilities
- `src/app/api/health/route.ts`: lightweight web-service liveness endpoint
- `src/app/api/internal/worker-events/route.ts`: signed worker lifecycle endpoint
- `src/app/api/webhooks`: GitHub, Stripe, and Resend webhooks
- `supabase/migrations`: schema and sample-report migrations
- `worker/src/index.ts`: worker polling and job lifecycle
- `worker/src/orchestrator.ts`: scan orchestration and component timeouts
- `worker/src/scanners/site.ts`: passive deployed-site scanner and SSRF controls
- `worker/src/db.ts`: persistence, deduplication, rescans, and regression detection
- `worker/Dockerfile`: pinned scanner toolchain
- `compose.yaml`: hardened worker runtime
