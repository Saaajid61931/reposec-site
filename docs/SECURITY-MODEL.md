# RepoSec security model

## Scope

RepoSec is an automated static and passive checking service. It is not a penetration test, certification, warranty, or proof that a project is secure.

## Trust boundaries

### Browser to web application

The browser receives only the Supabase publishable key. Auth cookies are refreshed by the Next.js proxy and copied to both the forwarded request and returned response. State-changing browser routes require same-origin checks and authenticated authorization.

### Web application to external providers

GitHub, Stripe, and Resend webhooks require provider signatures. Event IDs are unique per provider. RepoSec records only a payload digest and allowlisted metadata.

### Web application to worker

The worker does not expose a public control API. It polls the database with the Supabase service-role key. Lifecycle notifications to the web application are timestamped and HMAC-signed.

### Worker to repository

The worker uses a short-lived GitHub installation token only when private repository access is required. It resolves the requested branch to a commit SHA and downloads the archive for that exact commit. Archive redirects are restricted to known GitHub hosts.

### Worker to deployed site

The deployed-site check is passive. It performs a bounded root GET, follows a maximum of four redirects, sends no cookies, accepts no compressed response, and stores no response body.

For every hop it:

- Allows only HTTP and HTTPS
- Allows only the protocol’s default port
- Rejects URL credentials
- Resolves DNS with a timeout
- Rejects the target when any answer is private, loopback, link-local, multicast, documentation-only, or otherwise special-use
- Pins the selected public address into the socket lookup
- Repeats validation after each redirect
- Enforces total, request, and response-size limits

## Repository execution policy

The worker never:

- Runs package-manager install commands
- Runs project scripts, build scripts, tests, containers, or binaries
- Imports repository modules
- Evaluates repository configuration as code
- Retains the downloaded archive or extracted source after the job

External scanners receive filesystem paths only. Semgrep uses bundled local rules. Trivy runs with offline vulnerability data. Gitleaks scans directory content with redaction. OSV-Scanner reads manifests and lockfiles.

## Secret handling

Secret-shaped matches are transformed before persistence. Raw values are not included in findings, machine results, notifications, or logs. Stored evidence uses a redaction marker and a short one-way fingerprint where needed for remediation and rotation verification.

The worker enforces a maximum tool-output size. Error details are normalized and truncated before persistence.

## Finding identity and history

A finding fingerprint combines a rule identifier with a stable location or advisory anchor. Dependency fingerprints exclude the currently installed vulnerable version so upgrades within the same advisory remain one finding history.

Each scan occurrence has its own evidence fingerprint and snapshot status. Occurrences, status events, overrides, and audit events are append-only. Machine-authored finding fields are immutable after creation.

A finding is marked fixed when an open finding is absent from the next completed scan. A later reappearance changes it back to open and records a scanner-sourced regression event.

## Scan completeness and verdicts

Required components must pass for coverage to be complete. A failed or timed-out required component produces `SCAN INCOMPLETE`. The worker never treats partial coverage as a completed clean report.

Machine verdicts:

- `BLOCKED`: at least one high or critical finding
- `NEEDS WORK`: at least one lower-severity finding and no high or critical finding
- `READY FOR LAUNCH CHECKS`: no findings and complete required coverage
- `SCAN INCOMPLETE`: required coverage did not complete

## Resource controls

The worker enforces:

- Compressed archive limits by scan mode
- Expanded archive byte limit
- File-count limit
- Per-file byte limit
- Scanner-output byte limit
- Component timeout
- Total scan timeout
- Bounded worker concurrency
- Container CPU, memory, PID, capability, filesystem, and temporary-storage restrictions

## Residual risks

Static checks can miss runtime-only authorization flaws, dynamic dependency behavior, compromised build systems, logic vulnerabilities, and environment-specific issues. Passive site checks inspect one root response and do not authenticate, crawl, submit forms, or exploit behavior.

Scanner and advisory data age between image rebuilds. Rebuild the worker regularly and after relevant security releases.
