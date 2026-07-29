-- Exactly one clearly labelled fictional sample report.
-- It is not derived from a real repository scan and is disabled as a public trust page.

insert into public.organizations (
  id, owner_id, name, slug, is_sample
) values (
  '10000000-0000-4000-8000-000000000001', null, 'RepoSec Samples', 'reposec-samples', true
);

insert into public.projects (
  id, organization_id, name, slug, status, product_url, is_sample
) values (
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  'Northstar Client Portal (SAMPLE)',
  'northstar-client-portal-sample',
  'active',
  'https://example.com',
  true
);

insert into public.repositories (
  id, project_id, owner, name, full_name, html_url, default_branch, visibility, is_archived
) values (
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000002',
  'sample-agency',
  'northstar-portal',
  'sample-agency/northstar-portal',
  null,
  'main',
  'private',
  false
);

insert into public.site_targets (
  id, project_id, url, hostname, verified_at, verification_method, last_checked_at
) values (
  '10000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000002',
  'https://example.com',
  'example.com',
  '2026-07-24T09:00:00Z',
  'well_known_file',
  '2026-07-24T09:30:00Z'
);

insert into public.scans (
  id, project_id, mode, trigger, status, verdict, branch, commit_sha,
  coverage_complete, limitation_notes, finding_counts, report_fingerprint,
  started_at, completed_at, created_at
) values (
  '10000000-0000-4000-8000-000000000005',
  '10000000-0000-4000-8000-000000000002',
  'launch_pack',
  'manual',
  'completed',
  'BLOCKED',
  'main',
  '0000000000000000000000000000000000000000',
  true,
  array[
    'SAMPLE: Static analysis does not execute application code or verify runtime authorization behavior.',
    'SAMPLE: The deployed-site check is passive and limited to publicly observable responses.',
    'SAMPLE: A clean report would not prove that an application is secure.'
  ],
  '{"critical":1,"high":1,"medium":1,"low":0,"info":0}'::jsonb,
  'rs_8d31a7c2e4906baf',
  '2026-07-24T09:25:00Z',
  '2026-07-24T09:30:00Z',
  '2026-07-24T09:25:00Z'
);

insert into public.scan_components (
  scan_id, scanner, scanner_version, policy_version, status, required, rule_count, finding_count, summary, started_at, completed_at
) values
  ('10000000-0000-4000-8000-000000000005','Repository posture','sample','2026.07','passed',true,18,0,'SAMPLE: 18 deterministic controls completed','2026-07-24T09:25:00Z','2026-07-24T09:26:00Z'),
  ('10000000-0000-4000-8000-000000000005','GitHub Actions','sample','2026.07','passed',true,9,0,'SAMPLE: Workflow permissions and action pinning completed','2026-07-24T09:25:30Z','2026-07-24T09:26:30Z'),
  ('10000000-0000-4000-8000-000000000005','Secrets','sample','2026.07','passed',true,120,1,'SAMPLE: Gitleaks and RepoSec patterns completed','2026-07-24T09:26:00Z','2026-07-24T09:27:00Z'),
  ('10000000-0000-4000-8000-000000000005','Dependencies','sample','2026.07','passed',true,8,0,'SAMPLE: OSV and Trivy completed','2026-07-24T09:27:00Z','2026-07-24T09:28:00Z'),
  ('10000000-0000-4000-8000-000000000005','Static analysis','sample','2026.07','passed',true,76,1,'SAMPLE: Semgrep and RepoSec rules completed','2026-07-24T09:28:00Z','2026-07-24T09:29:00Z'),
  ('10000000-0000-4000-8000-000000000005','Deployed site','sample','2026.07','passed',true,12,1,'SAMPLE: Verified target checked passively','2026-07-24T09:29:00Z','2026-07-24T09:30:00Z');

insert into public.findings (
  id, project_id, fingerprint, rule_id, title, category, severity, confidence,
  current_status, explanation, impact, remediation, fix_prompt, verification,
  references, detection_sources, is_heuristic, first_seen_scan_id, last_seen_scan_id,
  first_seen_at, last_seen_at
) values
(
  '10000000-0000-4000-8000-000000000011',
  '10000000-0000-4000-8000-000000000002',
  'sample-fp-service-role',
  'REPOSEC-SUPABASE-001',
  'SAMPLE: Privileged Supabase key is exposed to browser code',
  'Secrets and authorization',
  'critical',
  'high',
  'open',
  'SAMPLE: A browser-accessible module references a Supabase service-role credential.',
  'SAMPLE: Anyone receiving the production JavaScript could use the credential with elevated privileges until rotation.',
  'SAMPLE: Remove the key from browser code and history, rotate it, and move privileged operations behind authenticated server routes.',
  'SAMPLE ONLY. Inspect src/lib/supabase-client.ts and its call sites. Replace browser service-role access with the public key, move privileged operations server-side, preserve behavior, never expose secrets, and finish when no privileged credential reaches the browser bundle.',
  'SAMPLE: Rotate the key, rebuild, search the bundle for its fingerprint, confirm authorization, and rescan.',
  '[{"label":"Supabase API keys","url":"https://supabase.com/docs/guides/api/api-keys"}]'::jsonb,
  array['RepoSec deterministic rule','Gitleaks'],
  false,
  '10000000-0000-4000-8000-000000000005',
  '10000000-0000-4000-8000-000000000005',
  '2026-07-24T09:30:00Z',
  '2026-07-24T09:30:00Z'
),
(
  '10000000-0000-4000-8000-000000000012',
  '10000000-0000-4000-8000-000000000002',
  'sample-fp-stripe-webhook',
  'REPOSEC-STRIPE-001',
  'SAMPLE: Stripe webhook does not verify its signature',
  'Payments',
  'high',
  'high',
  'open',
  'SAMPLE: The handler parses JSON before verifying Stripe''s signed payload.',
  'SAMPLE: A forged payment event could grant access without a completed purchase.',
  'SAMPLE: Verify the raw body and Stripe signature, reject failures, and process event IDs idempotently.',
  'SAMPLE ONLY. Update src/app/api/stripe/webhook/route.ts to verify the raw request body before reading fields, make event handling idempotent, preserve checkout behavior, never log secrets, and finish when forged or replayed events cannot grant access.',
  'SAMPLE: Send valid, replayed, and invalid-signature Stripe CLI events; only the first valid event may change access.',
  '[{"label":"Stripe webhook signatures","url":"https://docs.stripe.com/webhooks/signature"}]'::jsonb,
  array['RepoSec deterministic rule','Semgrep'],
  false,
  '10000000-0000-4000-8000-000000000005',
  '10000000-0000-4000-8000-000000000005',
  '2026-07-24T09:30:00Z',
  '2026-07-24T09:30:00Z'
),
(
  '10000000-0000-4000-8000-000000000013',
  '10000000-0000-4000-8000-000000000002',
  'sample-fp-csp',
  'REPOSEC-HEADER-001',
  'SAMPLE: Content Security Policy is not set',
  'Deployed-site headers',
  'medium',
  'high',
  'open',
  'SAMPLE: The production root response did not include a Content-Security-Policy header.',
  'SAMPLE: A CSP can reduce the impact of script injection by constraining executable sources.',
  'SAMPLE: Inventory required origins, deploy a restrictive policy, and verify core flows.',
  'SAMPLE ONLY. Add an enforced Content-Security-Policy after inventorying required sources. Preserve integrations, avoid wildcards and secrets, and finish when production includes the header and core flows have no CSP errors.',
  'SAMPLE: Exercise staging flows, review CSP violations, deploy, confirm the header, and rescan.',
  '[{"label":"MDN CSP","url":"https://developer.mozilla.org/docs/Web/HTTP/Headers/Content-Security-Policy"}]'::jsonb,
  array['RepoSec passive site check'],
  false,
  '10000000-0000-4000-8000-000000000005',
  '10000000-0000-4000-8000-000000000005',
  '2026-07-24T09:30:00Z',
  '2026-07-24T09:30:00Z'
);

insert into public.finding_occurrences (
  finding_id, scan_id, file_path, line_number, redacted_evidence, evidence_fingerprint, machine_result, detected_at
) values
(
  '10000000-0000-4000-8000-000000000011',
  '10000000-0000-4000-8000-000000000005',
  'src/lib/supabase-client.ts',
  8,
  'SAMPLE: createClient(url, "eyJ…[REDACTED sha256:43b7e2f1]")',
  'sample-evidence-service-role',
  '{"sample":true}'::jsonb,
  '2026-07-24T09:30:00Z'
),
(
  '10000000-0000-4000-8000-000000000012',
  '10000000-0000-4000-8000-000000000005',
  'src/app/api/stripe/webhook/route.ts',
  14,
  'SAMPLE: const event = await request.json()',
  'sample-evidence-stripe-webhook',
  '{"sample":true}'::jsonb,
  '2026-07-24T09:30:00Z'
),
(
  '10000000-0000-4000-8000-000000000013',
  '10000000-0000-4000-8000-000000000005',
  null,
  null,
  'SAMPLE: GET / → content-security-policy: [not observed]',
  'sample-evidence-csp',
  '{"sample":true}'::jsonb,
  '2026-07-24T09:30:00Z'
);

insert into public.reports (
  id, organization_id, project_id, scan_id, status, report_fingerprint, generated_at, created_at
) values (
  '10000000-0000-4000-8000-000000000020',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000005',
  'ready',
  'rs_8d31a7c2e4906baf',
  '2026-07-24T09:30:00Z',
  '2026-07-24T09:30:00Z'
);

insert into public.public_report_settings (
  id, project_id, enabled, public_slug, show_product_link, show_repository_link,
  last_scan_id, last_scan_at, report_fingerprint, passed_controls, remediation_summary, scope_snapshot
) values (
  '10000000-0000-4000-8000-000000000021',
  '10000000-0000-4000-8000-000000000002',
  false,
  'northstar-client-portal-sample',
  false,
  false,
  '10000000-0000-4000-8000-000000000005',
  '2026-07-24T09:30:00Z',
  'rs_8d31a7c2e4906baf',
  '[]'::jsonb,
  '{"fixed":0,"dismissed":0,"openHidden":3}'::jsonb,
  array['SAMPLE: default-branch snapshot','SAMPLE: verified root URL']
);
