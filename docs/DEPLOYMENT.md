# RepoSec deployment guide

## 1. Deployment layout

Deploy two separate services:

- Web application: Next.js on Vercel or another Node.js 22 platform
- Scanner worker: the image built from `worker/Dockerfile` on a private container host

Both services connect to the same Supabase project. Keep the worker on infrastructure where you control outbound network policy, memory, CPU, temporary storage, and image refreshes.

## 2. Supabase

Create a Supabase project and record:

- Project URL
- Publishable key
- Service-role key

Set the web application variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_URL
```

Set the worker variables:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

Apply migrations in order:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

The second migration inserts a clearly marked sample report. Remove or skip that migration only when the product should not expose the sample route.

Database requirements implemented by the migration:

- Row-level security on customer data
- Service-role-only queue claim and enqueue functions
- Append-only finding occurrences, status events, overrides, and audit events
- Immutable machine finding fields
- Canonical scan-component constraint
- Job attempts, leases, retries, and dead-letter status
- Webhook idempotency records

Configure Supabase Auth:

- Site URL: the production application URL
- Allowed redirect URLs: production and approved preview/local callback URLs
- GitHub OAuth provider: enabled with its OAuth client ID and secret

The GitHub OAuth app callback is the Supabase callback URL shown in the Auth provider settings, commonly `https://<project-ref>.supabase.co/auth/v1/callback`.

## 3. Application secrets

Start from `.env.example` and set every non-optional value.

Generate high-entropy values:

```bash
openssl rand -base64 32   # CONFIG_ENCRYPTION_KEY
openssl rand -hex 32      # WORKER_SHARED_SECRET
openssl rand -hex 32      # CRON_SECRET
```

`CONFIG_ENCRYPTION_KEY` must decode to 32 bytes. Use the same `WORKER_SHARED_SECRET` in the web application and worker. Do not expose either value through `NEXT_PUBLIC_*` variables.

Set `NEXT_PUBLIC_APP_URL` and `WEB_APP_URL` to the canonical HTTPS origin without a trailing slash.

## 4. GitHub OAuth and GitHub App

RepoSec uses two GitHub integrations:

- Supabase GitHub OAuth for user sign-in
- A GitHub App for repository installation access and push webhooks

Create a GitHub App with:

- Homepage URL: production application origin
- Setup URL: `https://<app-origin>/github/setup`
- Webhook URL: `https://<app-origin>/api/webhooks/github`
- Webhook secret: the value used for `GITHUB_WEBHOOK_SECRET`
- Request user authorization during installation: disabled unless separately needed

Repository permissions, read-only:

- Metadata
- Contents
- Actions
- Administration, used only to read branch-protection posture

Subscribe to these events:

- Installation
- Installation repositories
- Repository
- Push

Set:

```text
GITHUB_APP_ID
GITHUB_APP_SLUG
GITHUB_APP_PRIVATE_KEY
GITHUB_WEBHOOK_SECRET
GITHUB_SETUP_URL
```

The worker uses the same App ID and private key for installation tokens. A push scan records and downloads the webhook commit SHA rather than silently scanning a later branch head.

## 5. Stripe

Create three Stripe prices and set:

```text
STRIPE_LAUNCH_PACK_PRICE_ID
STRIPE_MONITORING_PRICE_ID
STRIPE_AGENCY_PRICE_ID
STRIPE_SECRET_KEY
```

Create a webhook endpoint:

```text
https://<app-origin>/api/webhooks/stripe
```

Subscribe to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `charge.refunded`

Set the signing secret as `STRIPE_WEBHOOK_SECRET`.

Configure the Stripe customer portal for subscription cancellation and billing-details updates before enabling the billing portal button.

## 6. Resend

Verify the sending domain and set:

```text
RESEND_API_KEY
EMAIL_FROM
SUPPORT_EMAIL
```

Create a webhook endpoint:

```text
https://<app-origin>/api/webhooks/resend
```

Subscribe to the available email lifecycle events used by RepoSec:

- Sent
- Delivered
- Delivery delayed
- Bounced
- Complained
- Failed
- Opened
- Clicked

Set the Svix-compatible webhook signing secret as `RESEND_WEBHOOK_SECRET`.

The handler is idempotent and preserves terminal failure states when events arrive out of order.

## 7. Vercel or Node web deployment

The Next.js build uses standalone output. Configure every variable from `.env.example` in the production environment and relevant preview environments.

`vercel.json` schedules weekly monitoring at 03:17 UTC every Monday. Vercel sends its cron authorization header. Set `CRON_SECRET` to the same value expected by `/api/cron/weekly-scans`.

Before production promotion, install the single root workspace lockfile and run the full validation suite:

```bash
npm ci --ignore-scripts
npm run check
```

Set the production domain, then verify:

- HTTPS redirects work
- CSP and security headers are present
- Supabase OAuth returns to the correct origin
- GitHub setup returns to the dashboard
- Stripe and Resend webhook deliveries receive HTTP 2xx
- `/api/health` returns HTTP 200
- `/api/internal/worker-events` rejects unsigned requests

## 8. Scanner worker

Create `.env.worker` from `worker/.env.example` on the container host. Never copy the web application’s complete environment file into the worker.

Build and start:

```bash
docker compose config
docker compose build --pull scanner-worker
docker compose up -d scanner-worker
```

Runtime protections in `compose.yaml`:

- Non-root process
- Read-only root filesystem
- `no-new-privileges`
- All Linux capabilities dropped
- PID, memory, and CPU limits
- `noexec`, `nosuid`, and `nodev` temporary scan workspace
- Dedicated scanner cache volumes
- Graceful shutdown longer than the default scan timeout

Required outbound access:

- Supabase project HTTPS endpoint
- Web application HTTPS endpoint
- `api.github.com`
- GitHub archive hosts such as `codeload.github.com` and `objects.githubusercontent.com`
- `api.osv.dev` or endpoints required by the pinned OSV-Scanner release
- Customer-declared deployed-site origins on HTTP 80 or HTTPS 443

The worker blocks non-default site ports, credentials in URLs, private and special-use IP ranges, DNS answers containing a prohibited address, and unsafe redirects. DNS is rechecked and pinned for every redirect hop.

## 9. Scanner image refresh

The image pins Gitleaks, Semgrep, Trivy, and OSV-Scanner versions. Trivy’s vulnerability database is downloaded during image build and runtime scans use offline mode.

Rebuild at least weekly and after scanner security releases:

```bash
docker compose build --pull --no-cache scanner-worker
docker compose up -d scanner-worker
```

Review version changes before updating Dockerfile arguments. Keep checksum verification enabled for downloaded release archives.

## 10. DNS and public security files

Point the production domain at the web host. Confirm these routes are reachable:

- `/.well-known/security.txt`
- `/robots.txt`
- `/sitemap.xml`
- `/security`

Update canonical domain constants if deploying under a domain other than `reposec.site`.
