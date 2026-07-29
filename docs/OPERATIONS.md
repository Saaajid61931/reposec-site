# RepoSec operations guide

## Worker health

The worker emits structured JSON logs. Monitor these events:

- `worker started`
- `scan component completed`
- `scan completed`
- `scan processing failed`
- `job claim failed`
- `worker notification failed`
- `workspace cleanup failed`

Alert on repeated job-claim failures, dead jobs, cleanup failures, and a growing queued-job count.

Useful database checks:

```sql
select status, count(*) from public.scan_jobs group by status order by status;

select id, scan_id, attempts, max_attempts, last_error_code, available_at
from public.scan_jobs
where status in ('queued','running','dead')
order by created_at;

select scanner, status, count(*)
from public.scan_components
where created_at > now() - interval '24 hours'
group by scanner, status
order by scanner, status;
```

## Retry behavior

Automatic retries reuse the same scan and exact commit SHA. Evidence rows are append-only, so a retry inserts only missing occurrence records and reuses any already-persisted evidence.

Admin reruns create a new scan linked operationally to the source scan. The new scan is pinned to the source commit when one was captured. This preserves historical evidence and does not consume another customer entitlement.

Never delete finding occurrences to make a retry succeed. A mutation rejection is an intentional data-integrity control.

## Job attempts and leases

`claim_scan_job` increments attempts atomically and leases one job with `FOR UPDATE SKIP LOCKED`. Expired running jobs are eligible for another claim while attempts remain.

The worker applies exponential retry delay. After the maximum attempt count, the job becomes `dead`, the scan becomes `failed`, and the report verdict is `SCAN INCOMPLETE`.

When changing `SCAN_TIMEOUT_MS`, keep the database lease ceiling and container stop grace period longer than the maximum expected scan.

## Webhook troubleshooting

Inspect `webhook_events` by provider and event ID. Payloads are not retained. RepoSec stores a SHA-256 digest and safe metadata only.

GitHub:

- Confirm `x-hub-signature-256` uses the configured secret
- Check delivery attempts in GitHub App settings
- Verify the installation is neither suspended nor deleted
- Confirm the repository is linked to the stored installation
- For push events, confirm the ref matches the recorded default branch

Stripe:

- Re-send a signed event from the Stripe dashboard
- Confirm the event type is subscribed
- Check price IDs and metadata written by checkout
- Do not manually grant an entitlement before confirming webhook state

Resend:

- Confirm all three Svix headers arrive unchanged
- Match the provider message ID to `email_deliveries.provider_message_id`
- Treat bounced, complained, and failed states as terminal

## Signed worker notifications

The worker signs `timestamp + '.' + raw JSON body` with HMAC-SHA256 and sends:

```text
x-reposec-worker-timestamp
x-reposec-worker-signature: sha256=<hex>
```

The web endpoint rejects timestamps outside a five-minute window. Rotate `WORKER_SHARED_SECRET` by updating both services in one controlled deployment. During rotation, stop the worker, deploy the web secret, deploy the worker secret, then restart polling.

## Scanner failures

Common failure codes:

- Repository archive rejected or exceeds compressed limits
- Expanded archive, file count, or individual file limit exceeded
- Unsafe archive path or symbolic link
- GitHub installation unavailable
- Component timeout
- External scanner execution or output-size failure
- Deployed-site DNS, redirect, port, TLS, timeout, or response-size rejection

Do not raise limits broadly to accommodate one repository. Review the repository size and scanner logs, then change the narrowest relevant limit.

## Data handling

Repository archives and extracted source exist only in the worker temporary directory. The worker removes the directory in a `finally` block after success or failure.

Persisted data includes:

- Commit SHA and snapshot size metadata
- Scanner versions and component status
- Finding fingerprints
- Redacted evidence excerpts
- Safe machine result fields
- Status and audit history

Persisted data does not include:

- Repository archives
- Full source files
- Raw detected secret values
- Full webhook payloads
- GitHub installation access tokens

## Backups and recovery

Enable Supabase backups appropriate to the product tier. Test restoration in a non-production project.

Protect these tables as business and security records:

- `scans`
- `scan_components`
- `findings`
- `finding_occurrences`
- `finding_status_events`
- `finding_overrides`
- `reports`
- `audit_events`
- `purchases`
- `subscriptions`
- `project_entitlements`
- `webhook_events`
- `email_deliveries`

After a database restore, pause the worker until queue rows and external webhook positions are reviewed. Replayed provider events remain idempotent because provider event IDs are unique.

## Incident response

For suspected credential exposure:

1. Stop worker polling if the worker host is involved.
2. Rotate Supabase service-role, GitHub App private key, worker shared secret, Stripe secret, Resend key, and configuration encryption key as applicable.
3. Revoke active GitHub installation tokens by rotating the App key or uninstalling affected installations.
4. Review audit and webhook event records.
5. Rebuild the worker image from a trusted base.
6. Confirm no raw secret entered logs or persisted evidence.
7. Resume scans only after signed-notification and queue-claim tests pass.
