# Validation and release gate

Run all commands from the repository root.

## Local release gate

```bash
npm ci --ignore-scripts
npm run check
docker compose config
docker compose build --pull scanner-worker
```

`npm run check` runs structural preflight, web TypeScript, ESLint, the Next.js production build, worker TypeScript, and the worker build.

## First dependency install

If this source snapshot does not yet contain `package-lock.json`, run:

```bash
npm install --ignore-scripts
npm run check
```

Review the generated dependency graph, then commit the root `package-lock.json`. Future installs and CI should use `npm ci --ignore-scripts`.

## Required release conditions

- Preflight passes without structural errors.
- Root lockfile is committed and matches both npm workspaces.
- TypeScript and ESLint pass.
- Next.js production build passes.
- Worker build passes.
- Docker Compose configuration validates.
- The scanner image builds from a clean checkout.
- Supabase migrations apply to a disposable database before production.
- Signed GitHub, Stripe, Resend, and worker-event test deliveries receive expected responses.
- A test scan captures the requested commit SHA and removes its temporary workspace.

## Environment-limited validation

When dependency registries or Docker are unavailable, source parsing and preflight are useful but do not replace the release gate above. Record the blocked commands and rerun them in CI or on the deployment host before promotion.
