-- RepoSec production schema
-- Apply with Supabase CLI. Service-role access is reserved for the web backend and scanner worker.

create extension if not exists pgcrypto;

create type public.organization_role as enum ('owner', 'admin', 'member', 'viewer');
create type public.project_status as enum ('active', 'archived', 'deleting');
create type public.repository_visibility as enum ('public', 'private', 'internal');
create type public.verification_method as enum ('dns_txt', 'well_known_file');
create type public.scan_mode as enum ('free', 'launch_pack', 'monitoring');
create type public.scan_trigger as enum ('free', 'manual', 'manual_rescan', 'schedule', 'github_push', 'admin_retry');
create type public.scan_status as enum ('queued', 'running', 'completed', 'failed', 'canceled');
create type public.scan_component_status as enum ('queued', 'running', 'passed', 'failed', 'timed_out', 'skipped');
create type public.scan_verdict as enum ('BLOCKED', 'NEEDS WORK', 'READY FOR LAUNCH CHECKS', 'SCAN INCOMPLETE');
create type public.finding_severity as enum ('critical', 'high', 'medium', 'low', 'info');
create type public.finding_confidence as enum ('high', 'medium', 'low');
create type public.finding_status as enum ('open', 'fixed', 'dismissed', 'accepted');
create type public.report_status as enum ('generating', 'ready', 'failed', 'revoked');
create type public.billing_kind as enum ('launch_pack', 'monitoring', 'agency');
create type public.billing_status as enum ('pending', 'active', 'past_due', 'canceled', 'expired', 'refunded', 'failed');
create type public.job_status as enum ('queued', 'running', 'completed', 'failed', 'dead', 'canceled');
create type public.webhook_status as enum ('received', 'processing', 'processed', 'failed', 'ignored');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  is_platform_admin boolean not null default false,
  suspended_at timestamptz,
  suspension_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index users_email_lower_idx on public.users (lower(email));

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.users(id) on delete set null,
  name text not null check (char_length(name) between 1 and 100),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  agency_name text check (agency_name is null or char_length(agency_name) <= 100),
  logo_url text,
  encrypted_settings bytea,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slug)
);

create index organizations_owner_id_idx on public.organizations(owner_id);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role public.organization_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index organization_members_user_id_idx on public.organization_members(user_id);
create index organization_members_org_role_idx on public.organization_members(organization_id, role);

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role public.organization_role not null check (role <> 'owner'),
  token_hash text not null unique,
  invited_by uuid not null references public.users(id) on delete cascade,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index organization_invitations_org_idx on public.organization_invitations(organization_id, created_at desc);
create unique index organization_invitations_pending_email_idx
  on public.organization_invitations(organization_id, lower(email))
  where accepted_at is null;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status public.project_status not null default 'active',
  product_url text,
  internal_notes text,
  encrypted_configuration bytea,
  is_sample boolean not null default false,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create index projects_organization_status_idx on public.projects(organization_id, status);
create index projects_updated_at_idx on public.projects(updated_at desc);

create table public.github_installations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  installation_id bigint not null unique,
  account_id bigint not null,
  account_login text not null,
  account_type text not null,
  repository_selection text not null check (repository_selection in ('all', 'selected')),
  permissions jsonb not null default '{}'::jsonb,
  installed_by uuid references public.users(id) on delete set null,
  suspended_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index github_installations_org_idx on public.github_installations(organization_id);

create table public.repositories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  github_installation_id uuid references public.github_installations(id) on delete set null,
  github_repository_id bigint,
  owner text not null,
  name text not null,
  full_name text not null,
  html_url text,
  default_branch text not null default 'main',
  visibility public.repository_visibility not null,
  is_archived boolean not null default false,
  pushed_at timestamptz,
  last_metadata_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id),
  unique (github_repository_id)
);

create index repositories_full_name_idx on public.repositories(lower(full_name));
create index repositories_installation_idx on public.repositories(github_installation_id);

create table public.site_targets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  url text not null,
  hostname text not null,
  verified_at timestamptz,
  verification_method public.verification_method,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id),
  unique (project_id, hostname)
);

create index site_targets_hostname_idx on public.site_targets(lower(hostname));

create table public.domain_verifications (
  id uuid primary key default gen_random_uuid(),
  site_target_id uuid not null references public.site_targets(id) on delete cascade,
  token_hash text not null unique,
  method public.verification_method,
  expires_at timestamptz not null,
  verified_at timestamptz,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  last_attempt_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index domain_verifications_site_idx on public.domain_verifications(site_target_id, created_at desc);

create table public.free_scan_requests (
  id uuid primary key default gen_random_uuid(),
  access_token_hash text not null unique,
  repository_owner text not null,
  repository_name text not null,
  repository_url text not null,
  site_url text,
  authorized_at timestamptz not null,
  requester_ip_hash text not null,
  status public.scan_status not null default 'queued',
  verdict public.scan_verdict,
  limited_findings jsonb not null default '[]'::jsonb,
  scope_snapshot jsonb not null default '[]'::jsonb,
  error_code text,
  scan_id uuid,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index free_scan_requests_status_idx on public.free_scan_requests(status, created_at);
create index free_scan_requests_expires_idx on public.free_scan_requests(expires_at);

create table public.scans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  free_scan_request_id uuid references public.free_scan_requests(id) on delete cascade,
  mode public.scan_mode not null,
  trigger public.scan_trigger not null,
  status public.scan_status not null default 'queued',
  verdict public.scan_verdict,
  requested_by uuid references public.users(id) on delete set null,
  branch text,
  commit_sha text,
  repository_snapshot_bytes bigint check (repository_snapshot_bytes is null or repository_snapshot_bytes >= 0),
  file_count integer check (file_count is null or file_count >= 0),
  coverage_complete boolean not null default false,
  limitation_notes text[] not null default '{}',
  finding_counts jsonb not null default '{}'::jsonb,
  report_fingerprint text,
  scanner_policy_version text not null default '2026.07',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((project_id is not null) <> (free_scan_request_id is not null))
);

alter table public.free_scan_requests
  add constraint free_scan_requests_scan_fk
  foreign key (scan_id) references public.scans(id) on delete set null;

create index scans_project_created_idx on public.scans(project_id, created_at desc);
create index scans_status_created_idx on public.scans(status, created_at);
create index scans_commit_idx on public.scans(project_id, commit_sha) where commit_sha is not null;
create unique index scans_report_fingerprint_idx on public.scans(report_fingerprint) where report_fingerprint is not null;

create table public.scan_components (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans(id) on delete cascade,
  scanner text not null check (scanner in (
    'Repository posture', 'GitHub Actions', 'Secrets', 'Dependencies', 'Static analysis', 'Deployed site'
  )),
  scanner_version text,
  policy_version text,
  status public.scan_component_status not null default 'queued',
  required boolean not null default true,
  rule_count integer not null default 0 check (rule_count >= 0),
  finding_count integer not null default 0 check (finding_count >= 0),
  summary text,
  error_code text,
  error_detail_redacted text,
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scan_id, scanner)
);

create index scan_components_status_idx on public.scan_components(status, created_at);

create table public.findings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  fingerprint text not null,
  rule_id text not null,
  title text not null,
  category text not null,
  severity public.finding_severity not null,
  confidence public.finding_confidence not null,
  current_status public.finding_status not null default 'open',
  explanation text not null,
  impact text not null,
  remediation text not null,
  fix_prompt text not null,
  verification text not null,
  references jsonb not null default '[]'::jsonb,
  detection_sources text[] not null default '{}',
  is_heuristic boolean not null default false,
  first_seen_scan_id uuid references public.scans(id) on delete set null,
  last_seen_scan_id uuid references public.scans(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, fingerprint)
);

create index findings_project_status_idx on public.findings(project_id, current_status);
create index findings_project_severity_idx on public.findings(project_id, severity, confidence);
create index findings_rule_id_idx on public.findings(rule_id);

create table public.finding_occurrences (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references public.findings(id) on delete cascade,
  scan_id uuid not null references public.scans(id) on delete cascade,
  file_path text,
  line_number integer check (line_number is null or line_number > 0),
  redacted_evidence text not null check (char_length(redacted_evidence) <= 8000),
  evidence_fingerprint text not null,
  machine_result jsonb not null default '{}'::jsonb,
  status_at_scan public.finding_status not null default 'open',
  is_new boolean not null default false,
  is_regression boolean not null default false,
  detected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (finding_id, scan_id, evidence_fingerprint)
);

create index finding_occurrences_scan_idx on public.finding_occurrences(scan_id);
create index finding_occurrences_finding_idx on public.finding_occurrences(finding_id, created_at desc);

create table public.finding_status_events (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references public.findings(id) on delete cascade,
  actor_user_id uuid references public.users(id) on delete set null,
  previous_status public.finding_status not null,
  new_status public.finding_status not null,
  reason text not null check (char_length(reason) between 1 and 2000),
  source text not null default 'user' check (source in ('user', 'scanner', 'admin')),
  created_at timestamptz not null default now()
);

create index finding_status_events_finding_idx on public.finding_status_events(finding_id, created_at desc);

create table public.finding_overrides (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references public.findings(id) on delete cascade,
  admin_user_id uuid not null references public.users(id) on delete restrict,
  classification text,
  customer_explanation text,
  customer_remediation text,
  reason text not null check (char_length(reason) between 8 and 2000),
  supersedes_id uuid references public.finding_overrides(id) on delete set null,
  created_at timestamptz not null default now()
);

create index finding_overrides_finding_idx on public.finding_overrides(finding_id, created_at desc);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  scan_id uuid not null references public.scans(id) on delete cascade,
  status public.report_status not null default 'generating',
  report_fingerprint text not null unique,
  private_share_token_hash text unique,
  private_share_expires_at timestamptz,
  generated_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scan_id)
);

create index reports_project_created_idx on public.reports(project_id, created_at desc);

create table public.public_report_settings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  enabled boolean not null default false,
  public_slug text not null unique check (public_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  show_product_link boolean not null default false,
  show_repository_link boolean not null default false,
  last_scan_id uuid references public.scans(id) on delete set null,
  last_scan_at timestamptz,
  report_fingerprint text,
  passed_controls jsonb not null default '[]'::jsonb,
  remediation_summary jsonb not null default '{"fixed":0,"dismissed":0,"openHidden":0}'::jsonb,
  scope_snapshot text[] not null default '{}',
  enabled_by uuid references public.users(id) on delete set null,
  enabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id)
);

create index public_report_settings_enabled_idx on public.public_report_settings(enabled, updated_at desc);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  kind public.billing_kind not null,
  status public.billing_status not null default 'pending',
  stripe_customer_id text not null,
  stripe_subscription_id text not null unique,
  stripe_price_id text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'monitoring' and project_id is not null) or (kind = 'agency' and project_id is null))
);

create index subscriptions_org_status_idx on public.subscriptions(organization_id, status);
create index subscriptions_project_idx on public.subscriptions(project_id) where project_id is not null;

create table public.billing_customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  kind public.billing_kind not null check (kind = 'launch_pack'),
  status public.billing_status not null default 'pending',
  stripe_customer_id text not null,
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id text unique,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'usd' check (currency ~ '^[a-z]{3}$'),
  credits_total integer not null default 1 check (credits_total >= 0),
  credits_remaining integer not null default 1 check (credits_remaining between 0 and credits_total),
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index purchases_org_created_idx on public.purchases(organization_id, created_at desc);

create table public.report_credit_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  granted_by uuid not null references public.users(id) on delete restrict,
  reason text not null check (char_length(reason) between 8 and 1000),
  credits_total integer not null check (credits_total between 1 and 100),
  credits_remaining integer not null check (credits_remaining between 0 and credits_total),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index report_credit_grants_org_idx on public.report_credit_grants(organization_id, created_at desc);

create table public.project_entitlements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  kind public.billing_kind not null,
  source_purchase_id uuid references public.purchases(id) on delete cascade,
  source_subscription_id uuid references public.subscriptions(id) on delete cascade,
  source_grant_id uuid references public.report_credit_grants(id) on delete cascade,
  active boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (source_purchase_id is not null)::int
    + (source_subscription_id is not null)::int
    + (source_grant_id is not null)::int = 1
  ),
  check ((kind = 'agency' and project_id is null) or (kind <> 'agency' and project_id is not null))
);

create index project_entitlements_project_idx on public.project_entitlements(project_id, kind, active);
create index project_entitlements_org_idx on public.project_entitlements(organization_id, kind, active);
create unique index project_entitlements_purchase_source_idx
  on public.project_entitlements(source_purchase_id) where source_purchase_id is not null;
create unique index project_entitlements_subscription_source_idx
  on public.project_entitlements(source_subscription_id) where source_subscription_id is not null;
create index project_entitlements_grant_source_idx
  on public.project_entitlements(source_grant_id) where source_grant_id is not null;

create table public.scan_jobs (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans(id) on delete cascade,
  status public.job_status not null default 'queued',
  priority smallint not null default 50 check (priority between 0 and 100),
  payload jsonb not null default '{}'::jsonb,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  lease_expires_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  last_error_code text,
  last_error_redacted text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scan_id)
);

create index scan_jobs_claim_idx on public.scan_jobs(status, available_at, priority desc)
  where status in ('queued', 'running');

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('github', 'stripe', 'resend')),
  provider_event_id text not null,
  event_type text not null,
  status public.webhook_status not null default 'received',
  payload_sha256 text not null,
  safe_metadata jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  last_error_redacted text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create index webhook_events_status_idx on public.webhook_events(status, created_at);

create or replace function public.begin_webhook_attempt(
  p_provider text,
  p_provider_event_id text,
  p_event_type text,
  p_payload_sha256 text,
  p_safe_metadata jsonb default '{}'::jsonb
)
returns table (
  event_id uuid,
  event_status public.webhook_status,
  attempt_count integer,
  should_process boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.webhook_events%rowtype;
begin
  insert into public.webhook_events (
    provider,
    provider_event_id,
    event_type,
    status,
    payload_sha256,
    safe_metadata
  ) values (
    p_provider,
    p_provider_event_id,
    p_event_type,
    'received',
    p_payload_sha256,
    coalesce(p_safe_metadata, '{}'::jsonb)
  )
  on conflict (provider, provider_event_id) do nothing;

  select *
  into target
  from public.webhook_events
  where provider = p_provider
    and provider_event_id = p_provider_event_id
  for update;

  if target.id is null then
    raise exception 'Webhook event could not be loaded';
  end if;

  if target.event_type <> p_event_type or target.payload_sha256 <> p_payload_sha256 then
    raise exception 'Webhook event identity does not match the recorded payload';
  end if;

  if target.status in ('processed', 'ignored') then
    return query select target.id, target.status, target.attempts, false;
    return;
  end if;

  -- Avoid concurrent duplicate processing. A later provider retry may reclaim a
  -- stale processing row if the previous request died before recording failure.
  if target.status = 'processing' and target.updated_at > now() - interval '10 minutes' then
    return query select target.id, target.status, target.attempts, false;
    return;
  end if;

  update public.webhook_events
  set status = 'processing',
      attempts = target.attempts + 1,
      processed_at = null,
      last_error_redacted = null
  where webhook_events.id = target.id
  returning * into target;

  return query select target.id, target.status, target.attempts, true;
end;
$$;

revoke all on function public.begin_webhook_attempt(text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.begin_webhook_attempt(text, text, text, text, jsonb)
  to service_role;

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  actor_user_id uuid references public.users(id) on delete set null,
  actor_type text not null check (actor_type in ('user', 'admin', 'worker', 'webhook', 'system')),
  action text not null,
  target_type text not null,
  target_id text,
  ip_hash text,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_org_created_idx on public.audit_events(organization_id, created_at desc);
create index audit_events_target_idx on public.audit_events(target_type, target_id, created_at desc);

create table public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  topic text not null,
  message text not null,
  requester_ip_hash text not null,
  created_at timestamptz not null default now()
);

create index contact_requests_created_idx on public.contact_requests(created_at desc);

create table public.rate_limit_buckets (
  key_hash text not null,
  action text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (key_hash, action, window_started_at)
);

create index rate_limit_buckets_cleanup_idx on public.rate_limit_buckets(window_started_at);

create table public.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  template text not null,
  recipient_hash text not null,
  provider_message_id text unique,
  status text not null default 'queued' check (status in ('queued','sending','delayed','sent','delivered','opened','clicked','failed','bounced','complained')),
  dedupe_key text unique,
  last_error_redacted text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Membership and entitlement helpers. SECURITY DEFINER functions expose only booleans.
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and is_platform_admin = true and suspended_at is null
  );
$$;

create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    join public.users u on u.id = m.user_id
    where m.organization_id = target_organization_id
      and m.user_id = auth.uid()
      and u.suspended_at is null
  );
$$;

create or replace function public.has_organization_role(target_organization_id uuid, allowed_roles public.organization_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    join public.users u on u.id = m.user_id
    where m.organization_id = target_organization_id
      and m.user_id = auth.uid()
      and m.role = any(allowed_roles)
      and u.suspended_at is null
  );
$$;

create or replace function public.project_organization_id(target_project_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select organization_id from public.projects where id = target_project_id;
$$;

create or replace function public.has_active_report_entitlement(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p
    join public.project_entitlements e
      on e.organization_id = p.organization_id
      and (e.project_id = p.id or (e.project_id is null and e.kind = 'agency'))
    where p.id = target_project_id
      and e.active = true
      and e.kind in ('launch_pack', 'monitoring', 'agency')
      and (e.ends_at is null or e.ends_at > now())
  );
$$;

-- Creates the profile and initial workspace after OAuth, without trusting client-supplied ownership.
create or replace function public.ensure_user_workspace()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid := auth.uid();
  target_email text;
  target_name text;
  target_avatar text;
  target_org_id uuid;
  base_slug text;
begin
  if target_user_id is null then
    raise exception 'Authentication required';
  end if;

  select
    email,
    coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'user_name', split_part(email, '@', 1)),
    raw_user_meta_data ->> 'avatar_url'
  into target_email, target_name, target_avatar
  from auth.users
  where id = target_user_id;

  insert into public.users(id, email, display_name, avatar_url)
  values (target_user_id, target_email, target_name, target_avatar)
  on conflict (id) do update
    set email = excluded.email,
        display_name = excluded.display_name,
        avatar_url = excluded.avatar_url,
        updated_at = now();

  select organization_id into target_org_id
  from public.organization_members
  where user_id = target_user_id
  order by created_at
  limit 1;

  if target_org_id is null then
    base_slug := trim(both '-' from regexp_replace(lower(coalesce(target_name, 'workspace')), '[^a-z0-9]+', '-', 'g'));
    if base_slug = '' then base_slug := 'workspace'; end if;

    insert into public.organizations(owner_id, name, slug)
    values (
      target_user_id,
      coalesce(target_name, 'My workspace'),
      left(base_slug, 48) || '-' || substr(replace(target_user_id::text, '-', ''), 1, 8)
    )
    returning id into target_org_id;

    insert into public.organization_members(organization_id, user_id, role)
    values (target_org_id, target_user_id, 'owner');
  end if;

  return target_org_id;
end;
$$;

grant execute on function public.ensure_user_workspace() to authenticated;

create or replace function public.consume_rate_limit(
  p_key_hash text,
  p_action text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  bucket_start timestamptz;
  current_count integer;
begin
  if p_limit < 1 or p_window_seconds < 1 then
    return false;
  end if;
  bucket_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limit_buckets(key_hash, action, window_started_at, request_count)
  values (p_key_hash, p_action, bucket_start, 1)
  on conflict (key_hash, action, window_started_at)
  do update set request_count = public.rate_limit_buckets.request_count + 1, updated_at = now()
  returning request_count into current_count;

  return current_count <= p_limit;
end;
$$;

revoke all on function public.consume_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, text, integer, integer) to service_role;

create or replace function public.claim_scan_job(p_worker_id text, p_lease_seconds integer default 300)
returns table(job_id uuid, scan_id uuid, payload jsonb, attempt integer, max_attempts integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed public.scan_jobs%rowtype;
begin
  select *
  into claimed
  from public.scan_jobs
  where (
      status = 'queued'
      or (status = 'running' and lease_expires_at < now())
    )
    and available_at <= now()
    and attempts < max_attempts
  order by priority desc, available_at asc
  for update skip locked
  limit 1;

  if claimed.id is null then
    return;
  end if;

  update public.scan_jobs
  set status = 'running',
      locked_at = now(),
      locked_by = p_worker_id,
      lease_expires_at = now() + make_interval(secs => least(greatest(p_lease_seconds, 30), 3600)),
      attempts = attempts + 1,
      updated_at = now()
  where id = claimed.id
  returning * into claimed;

  update public.scans
  set status = 'running', started_at = coalesce(started_at, now()), updated_at = now()
  where id = claimed.scan_id and status = 'queued';

  return query select claimed.id, claimed.scan_id, claimed.payload, claimed.attempts, claimed.max_attempts;
end;
$$;

revoke all on function public.claim_scan_job(text, integer) from public, anon, authenticated;
grant execute on function public.claim_scan_job(text, integer) to service_role;

create or replace function public.create_project_with_targets(
  p_organization_id uuid,
  p_user_id uuid,
  p_name text,
  p_slug text,
  p_repository_owner text,
  p_repository_name text,
  p_repository_url text,
  p_site_url text default null,
  p_site_hostname text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_project_id uuid;
begin
  if not exists (
    select 1 from public.organization_members m
    join public.users u on u.id = m.user_id
    where m.organization_id = p_organization_id
      and m.user_id = p_user_id
      and m.role in ('owner','admin','member')
      and u.suspended_at is null
  ) then
    raise exception 'Not authorized for this organization';
  end if;

  insert into public.projects(organization_id, name, slug, status, product_url, created_by)
  values (p_organization_id, p_name, p_slug, 'active', p_site_url, p_user_id)
  returning id into target_project_id;

  insert into public.repositories(
    project_id, owner, name, full_name, html_url, default_branch, visibility
  ) values (
    target_project_id,
    p_repository_owner,
    p_repository_name,
    p_repository_owner || '/' || p_repository_name,
    p_repository_url,
    'main',
    'public'
  );

  if p_site_url is not null and p_site_hostname is not null then
    insert into public.site_targets(project_id, url, hostname)
    values (target_project_id, p_site_url, p_site_hostname);
  end if;

  insert into public.public_report_settings(project_id, enabled, public_slug)
  values (
    target_project_id,
    false,
    left(p_slug, 42) || '-' || substr(replace(target_project_id::text, '-', ''), 1, 8)
  );

  insert into public.audit_events(
    organization_id, actor_user_id, actor_type, action, target_type, target_id, after_state
  ) values (
    p_organization_id, p_user_id, 'user', 'project.created', 'project', target_project_id::text,
    jsonb_build_object('name', p_name, 'repository', p_repository_owner || '/' || p_repository_name)
  );

  return target_project_id;
end;
$$;

revoke all on function public.create_project_with_targets(uuid, uuid, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_project_with_targets(uuid, uuid, text, text, text, text, text, text, text)
  to service_role;

create or replace function public.enqueue_free_scan(
  p_access_token_hash text,
  p_repository_owner text,
  p_repository_name text,
  p_repository_url text,
  p_site_url text,
  p_requester_ip_hash text
)
returns table(free_request_id uuid, scan_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_request_id uuid;
  target_scan_id uuid;
begin
  insert into public.free_scan_requests(
    access_token_hash, repository_owner, repository_name, repository_url,
    site_url, authorized_at, requester_ip_hash
  ) values (
    p_access_token_hash, p_repository_owner, p_repository_name, p_repository_url,
    p_site_url, now(), p_requester_ip_hash
  ) returning id into target_request_id;

  insert into public.scans(free_scan_request_id, mode, trigger, status)
  values (target_request_id, 'free', 'free', 'queued')
  returning id into target_scan_id;

  update public.free_scan_requests set scan_id = target_scan_id where id = target_request_id;

  insert into public.scan_components(scan_id, scanner, required) values
    (target_scan_id, 'Repository posture', true),
    (target_scan_id, 'GitHub Actions', true),
    (target_scan_id, 'Secrets', true),
    (target_scan_id, 'Dependencies', true);

  if p_site_url is not null then
    insert into public.scan_components(scan_id, scanner, required)
    values (target_scan_id, 'Deployed site', false);
  end if;

  insert into public.scan_jobs(scan_id, priority, payload)
  values (
    target_scan_id,
    30,
    jsonb_build_object(
      'mode', 'free',
      'repositoryOwner', p_repository_owner,
      'repositoryName', p_repository_name,
      'repositoryUrl', p_repository_url,
      'siteUrl', p_site_url
    )
  );

  return query select target_request_id, target_scan_id;
end;
$$;

revoke all on function public.enqueue_free_scan(text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.enqueue_free_scan(text, text, text, text, text, text)
  to service_role;

create or replace function public.enqueue_project_scan(
  p_project_id uuid,
  p_user_id uuid,
  p_trigger public.scan_trigger
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_scan_id uuid;
  target_org_id uuid;
  target_mode public.scan_mode;
  available_purchase public.purchases%rowtype;
  available_grant public.report_credit_grants%rowtype;
begin
  select organization_id into target_org_id
  from public.projects
  where id = p_project_id and status = 'active'
  for update;

  if target_org_id is null then
    raise exception 'Project is unavailable';
  end if;

  if not exists (
    select 1 from public.organization_members m
    join public.users u on u.id = m.user_id
    where m.organization_id = target_org_id
      and m.user_id = p_user_id
      and m.role in ('owner','admin','member')
      and u.suspended_at is null
  ) then
    raise exception 'Not authorized for this project';
  end if;

  if exists (
    select 1 from public.scans
    where project_id = p_project_id and status in ('queued','running')
  ) then
    raise exception 'A scan is already active';
  end if;

  if exists (
    select 1 from public.project_entitlements
    where project_id = p_project_id and kind = 'monitoring' and active
      and (ends_at is null or ends_at > now())
  ) then
    target_mode := 'monitoring';
  elsif exists (
    select 1 from public.project_entitlements
    where project_id = p_project_id and kind = 'launch_pack' and active
      and (ends_at is null or ends_at > now())
  ) or exists (
    select 1 from public.project_entitlements
    where organization_id = target_org_id and project_id is null and kind = 'agency' and active
      and (ends_at is null or ends_at > now())
  ) then
    target_mode := 'launch_pack';
  else
    select * into available_purchase
    from public.purchases
    where organization_id = target_org_id
      and kind = 'launch_pack'
      and status = 'active'
      and credits_remaining > 0
    order by created_at
    for update skip locked
    limit 1;

    if available_purchase.id is not null then
      update public.purchases
      set credits_remaining = credits_remaining - 1, updated_at = now()
      where id = available_purchase.id;

      insert into public.project_entitlements(
        organization_id, project_id, kind, source_purchase_id, active
      ) values (
        target_org_id, p_project_id, 'launch_pack', available_purchase.id, true
      );
    else
      select * into available_grant
      from public.report_credit_grants
      where organization_id = target_org_id
        and (project_id is null or project_id = p_project_id)
        and credits_remaining > 0
        and (expires_at is null or expires_at > now())
      order by created_at
      for update skip locked
      limit 1;

      if available_grant.id is null then
        raise exception 'A Launch Pack, Monitoring, Agency, or report credit entitlement is required';
      end if;

      update public.report_credit_grants
      set credits_remaining = credits_remaining - 1, updated_at = now()
      where id = available_grant.id;

      insert into public.project_entitlements(
        organization_id, project_id, kind, source_grant_id, active
      ) values (
        target_org_id, p_project_id, 'launch_pack', available_grant.id, true
      );
    end if;
    target_mode := 'launch_pack';
  end if;

  insert into public.scans(project_id, mode, trigger, status, requested_by)
  values (p_project_id, target_mode, p_trigger, 'queued', p_user_id)
  returning id into target_scan_id;

  insert into public.scan_components(scan_id, scanner, required) values
    (target_scan_id, 'Repository posture', true),
    (target_scan_id, 'GitHub Actions', true),
    (target_scan_id, 'Secrets', true),
    (target_scan_id, 'Dependencies', true),
    (target_scan_id, 'Static analysis', true),
    (target_scan_id, 'Deployed site', false);

  insert into public.scan_jobs(scan_id, priority, payload)
  values (
    target_scan_id,
    case when p_trigger = 'github_push' then 60 else 50 end,
    jsonb_build_object('mode', target_mode, 'projectId', p_project_id, 'trigger', p_trigger)
  );

  insert into public.audit_events(
    organization_id, actor_user_id, actor_type, action, target_type, target_id,
    after_state
  ) values (
    target_org_id, p_user_id, 'user', 'scan.queued', 'scan', target_scan_id::text,
    jsonb_build_object('projectId', p_project_id, 'mode', target_mode, 'trigger', p_trigger)
  );

  return target_scan_id;
end;
$$;

revoke all on function public.enqueue_project_scan(uuid, uuid, public.scan_trigger)
  from public, anon, authenticated;
grant execute on function public.enqueue_project_scan(uuid, uuid, public.scan_trigger)
  to service_role;

create or replace function public.enqueue_monitoring_scan(
  p_project_id uuid,
  p_trigger public.scan_trigger,
  p_commit_sha text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_scan_id uuid;
  target_org_id uuid;
begin
  if p_trigger not in ('schedule', 'github_push', 'admin_retry') then
    raise exception 'Unsupported monitoring trigger';
  end if;

  select organization_id into target_org_id
  from public.projects
  where id = p_project_id and status = 'active'
  for update;
  if target_org_id is null then return null; end if;

  if not exists (
    select 1 from public.project_entitlements e
    where e.active = true
      and (e.ends_at is null or e.ends_at > now())
      and (
        (e.project_id = p_project_id and e.kind = 'monitoring')
        or (e.organization_id = target_org_id and e.project_id is null and e.kind = 'agency')
      )
  ) then
    return null;
  end if;

  if exists (
    select 1 from public.scans
    where project_id = p_project_id
      and (
        status in ('queued','running')
        or (p_commit_sha is not null and commit_sha = p_commit_sha and created_at > now() - interval '7 days')
      )
  ) then
    return null;
  end if;

  insert into public.scans(project_id, mode, trigger, status, commit_sha)
  values (p_project_id, 'monitoring', p_trigger, 'queued', p_commit_sha)
  returning id into target_scan_id;

  insert into public.scan_components(scan_id, scanner, required) values
    (target_scan_id, 'Repository posture', true),
    (target_scan_id, 'GitHub Actions', true),
    (target_scan_id, 'Secrets', true),
    (target_scan_id, 'Dependencies', true),
    (target_scan_id, 'Static analysis', true),
    (target_scan_id, 'Deployed site', false);

  insert into public.scan_jobs(scan_id, priority, payload)
  values (
    target_scan_id,
    case when p_trigger = 'github_push' then 60 else 40 end,
    jsonb_build_object('mode', 'monitoring', 'projectId', p_project_id, 'trigger', p_trigger, 'commitSha', p_commit_sha)
  );

  insert into public.audit_events(
    organization_id, actor_type, action, target_type, target_id, after_state
  ) values (
    target_org_id,
    case when p_trigger = 'github_push' then 'webhook' else 'system' end,
    'scan.queued',
    'scan',
    target_scan_id::text,
    jsonb_build_object('projectId', p_project_id, 'mode', 'monitoring', 'trigger', p_trigger)
  );
  return target_scan_id;
end;
$$;

revoke all on function public.enqueue_monitoring_scan(uuid, public.scan_trigger, text)
  from public, anon, authenticated;
grant execute on function public.enqueue_monitoring_scan(uuid, public.scan_trigger, text)
  to service_role;

create or replace function public.enqueue_admin_retry(
  p_source_scan_id uuid,
  p_admin_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_scan public.scans%rowtype;
  target_scan_id uuid;
  target_org_id uuid;
begin
  select * into source_scan
  from public.scans
  where id = p_source_scan_id and project_id is not null;

  if source_scan.id is null then
    raise exception 'Project scan not found';
  end if;

  select organization_id into target_org_id
  from public.projects
  where id = source_scan.project_id and status = 'active'
  for update;

  if target_org_id is null then
    raise exception 'Project is unavailable';
  end if;

  if exists (
    select 1 from public.scans
    where project_id = source_scan.project_id and status in ('queued','running')
  ) then
    raise exception 'A scan is already active';
  end if;

  insert into public.scans(
    project_id, mode, trigger, status, requested_by, branch, commit_sha
  ) values (
    source_scan.project_id, source_scan.mode, 'admin_retry', 'queued',
    p_admin_user_id, source_scan.branch, source_scan.commit_sha
  ) returning id into target_scan_id;

  insert into public.scan_components(scan_id, scanner, required) values
    (target_scan_id, 'Repository posture', true),
    (target_scan_id, 'GitHub Actions', true),
    (target_scan_id, 'Secrets', true),
    (target_scan_id, 'Dependencies', true),
    (target_scan_id, 'Static analysis', true),
    (target_scan_id, 'Deployed site', false);

  insert into public.scan_jobs(scan_id, priority, payload)
  values (
    target_scan_id,
    80,
    jsonb_build_object(
      'mode', source_scan.mode,
      'projectId', source_scan.project_id,
      'trigger', 'admin_retry',
      'commitSha', source_scan.commit_sha,
      'sourceScanId', source_scan.id
    )
  );

  return target_scan_id;
end;
$$;

revoke all on function public.enqueue_admin_retry(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.enqueue_admin_retry(uuid, uuid)
  to service_role;

create or replace function public.record_launch_pack_purchase(
  p_organization_id uuid,
  p_project_id uuid,
  p_stripe_customer_id text,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_amount_cents integer,
  p_currency text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_purchase_id uuid;
begin
  if p_project_id is not null and not exists (
    select 1 from public.projects
    where id = p_project_id and organization_id = p_organization_id and status = 'active'
  ) then
    raise exception 'Project does not belong to organization';
  end if;

  insert into public.billing_customers(organization_id, stripe_customer_id)
  values (p_organization_id, p_stripe_customer_id)
  on conflict (organization_id) do update set
    stripe_customer_id = excluded.stripe_customer_id,
    updated_at = now();

  insert into public.purchases(
    organization_id, project_id, kind, status, stripe_customer_id,
    stripe_checkout_session_id, stripe_payment_intent_id, amount_cents, currency,
    credits_total, credits_remaining
  ) values (
    p_organization_id, p_project_id, 'launch_pack', 'active', p_stripe_customer_id,
    p_checkout_session_id, p_payment_intent_id, p_amount_cents, lower(p_currency),
    1, case when p_project_id is null then 1 else 0 end
  )
  on conflict (stripe_checkout_session_id) do update set
    stripe_payment_intent_id = coalesce(public.purchases.stripe_payment_intent_id, excluded.stripe_payment_intent_id),
    updated_at = now()
  returning id into target_purchase_id;

  if p_project_id is not null then
    insert into public.project_entitlements(
      organization_id, project_id, kind, source_purchase_id, active
    ) values (
      p_organization_id, p_project_id, 'launch_pack', target_purchase_id, true
    )
    on conflict (source_purchase_id) where source_purchase_id is not null
    do update set active = true, ends_at = null, updated_at = now();
  end if;

  return target_purchase_id;
end;
$$;

revoke all on function public.record_launch_pack_purchase(uuid, uuid, text, text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.record_launch_pack_purchase(uuid, uuid, text, text, text, integer, text)
  to service_role;

create or replace function public.record_subscription_state(
  p_organization_id uuid,
  p_project_id uuid,
  p_kind public.billing_kind,
  p_status public.billing_status,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_stripe_price_id text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_canceled_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_subscription_id uuid;
  entitlement_active boolean := p_status = 'active';
begin
  if p_kind not in ('monitoring','agency') then
    raise exception 'Invalid subscription kind';
  end if;
  if p_kind = 'monitoring' and (
    p_project_id is null
    or not exists (
      select 1 from public.projects
      where id = p_project_id and organization_id = p_organization_id and status = 'active'
    )
  ) then
    raise exception 'Monitoring requires a project in the organization';
  end if;
  if p_kind = 'agency' then p_project_id := null; end if;

  insert into public.billing_customers(organization_id, stripe_customer_id)
  values (p_organization_id, p_stripe_customer_id)
  on conflict (organization_id) do update set
    stripe_customer_id = excluded.stripe_customer_id,
    updated_at = now();

  insert into public.subscriptions(
    organization_id, project_id, kind, status, stripe_customer_id,
    stripe_subscription_id, stripe_price_id, current_period_start,
    current_period_end, cancel_at_period_end, canceled_at
  ) values (
    p_organization_id, p_project_id, p_kind, p_status, p_stripe_customer_id,
    p_stripe_subscription_id, p_stripe_price_id, p_period_start,
    p_period_end, p_cancel_at_period_end, p_canceled_at
  )
  on conflict (stripe_subscription_id) do update set
    status = excluded.status,
    stripe_price_id = excluded.stripe_price_id,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    canceled_at = excluded.canceled_at,
    updated_at = now()
  returning id into target_subscription_id;

  insert into public.project_entitlements(
    organization_id, project_id, kind, source_subscription_id, active, starts_at, ends_at
  ) values (
    p_organization_id, p_project_id, p_kind, target_subscription_id, entitlement_active,
    coalesce(p_period_start, now()), p_period_end
  )
  on conflict (source_subscription_id) where source_subscription_id is not null
  do update set
    active = excluded.active,
    ends_at = excluded.ends_at,
    updated_at = now();

  return target_subscription_id;
end;
$$;

revoke all on function public.record_subscription_state(uuid, uuid, public.billing_kind, public.billing_status, text, text, text, timestamptz, timestamptz, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_subscription_state(uuid, uuid, public.billing_kind, public.billing_status, text, text, text, timestamptz, timestamptz, boolean, timestamptz)
  to service_role;

create or replace function public.record_purchase_refund(p_payment_intent_id text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_purchase_id uuid;
begin
  update public.purchases
  set status = 'refunded', credits_remaining = 0, refunded_at = now(), updated_at = now()
  where stripe_payment_intent_id = p_payment_intent_id
  returning id into target_purchase_id;
  if target_purchase_id is not null then
    update public.project_entitlements
    set active = false, ends_at = now(), updated_at = now()
    where source_purchase_id = target_purchase_id;
  end if;
  return target_purchase_id;
end;
$$;

revoke all on function public.record_purchase_refund(text) from public, anon, authenticated;
grant execute on function public.record_purchase_refund(text) to service_role;

create or replace function public.set_finding_status(
  p_finding_id uuid,
  p_status public.finding_status,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_finding public.findings%rowtype;
  target_org_id uuid;
begin
  select * into target_finding from public.findings where id = p_finding_id for update;
  if target_finding.id is null then raise exception 'Finding not found'; end if;
  select organization_id into target_org_id from public.projects where id = target_finding.project_id;

  if not exists (
    select 1 from public.organization_members
    where organization_id = target_org_id
      and user_id = auth.uid()
      and role in ('owner','admin','member')
  ) or not public.has_active_report_entitlement(target_finding.project_id) then
    raise exception 'Not authorized';
  end if;

  if p_status <> 'open' and char_length(trim(p_reason)) < 8 then
    raise exception 'A meaningful reason is required';
  end if;

  insert into public.finding_status_events(
    finding_id, actor_user_id, previous_status, new_status, reason, source
  ) values (
    target_finding.id, auth.uid(), target_finding.current_status, p_status,
    coalesce(nullif(trim(p_reason), ''), 'Reopened for review'), 'user'
  );

  update public.findings
  set current_status = p_status, updated_at = now()
  where id = target_finding.id;

  insert into public.audit_events(
    organization_id, actor_user_id, actor_type, action, target_type, target_id,
    before_state, after_state
  ) values (
    target_org_id, auth.uid(), 'user', 'finding.status_changed', 'finding', target_finding.id::text,
    jsonb_build_object('status', target_finding.current_status),
    jsonb_build_object('status', p_status, 'reason', p_reason)
  );
end;
$$;

grant execute on function public.set_finding_status(uuid, public.finding_status, text) to authenticated;

-- Machine evidence and audit events are append-only.
create or replace function public.reject_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'This record is immutable';
end;
$$;

create trigger finding_occurrences_immutable
before update or delete on public.finding_occurrences
for each row execute function public.reject_mutation();

create trigger finding_overrides_immutable
before update or delete on public.finding_overrides
for each row execute function public.reject_mutation();

create trigger finding_status_events_immutable
before update or delete on public.finding_status_events
for each row execute function public.reject_mutation();

create trigger audit_events_immutable
before update or delete on public.audit_events
for each row execute function public.reject_mutation();

create or replace function public.protect_finding_machine_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if row(
    old.project_id, old.fingerprint, old.rule_id, old.title, old.category,
    old.severity, old.confidence, old.explanation, old.impact, old.remediation,
    old.fix_prompt, old.verification, old.references, old.detection_sources, old.is_heuristic
  ) is distinct from row(
    new.project_id, new.fingerprint, new.rule_id, new.title, new.category,
    new.severity, new.confidence, new.explanation, new.impact, new.remediation,
    new.fix_prompt, new.verification, new.references, new.detection_sources, new.is_heuristic
  ) then
    raise exception 'Machine finding fields are immutable; create an override';
  end if;
  return new;
end;
$$;

create trigger findings_protect_machine_fields
before update on public.findings
for each row execute function public.protect_finding_machine_fields();

-- updated_at triggers
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'users','organizations','organization_members','organization_invitations','projects',
    'github_installations','repositories','site_targets','domain_verifications','free_scan_requests',
    'scans','scan_components','findings','reports','public_report_settings','subscriptions',
    'billing_customers','purchases','report_credit_grants','project_entitlements','scan_jobs','webhook_events','email_deliveries'
  ]
  loop
    execute format(
      'create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name, table_name
    );
  end loop;
end;
$$;

-- RLS
alter table public.users enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.projects enable row level security;
alter table public.github_installations enable row level security;
alter table public.repositories enable row level security;
alter table public.site_targets enable row level security;
alter table public.domain_verifications enable row level security;
alter table public.free_scan_requests enable row level security;
alter table public.scans enable row level security;
alter table public.scan_components enable row level security;
alter table public.findings enable row level security;
alter table public.finding_occurrences enable row level security;
alter table public.finding_status_events enable row level security;
alter table public.finding_overrides enable row level security;
alter table public.reports enable row level security;
alter table public.public_report_settings enable row level security;
alter table public.subscriptions enable row level security;
alter table public.billing_customers enable row level security;
alter table public.purchases enable row level security;
alter table public.report_credit_grants enable row level security;
alter table public.project_entitlements enable row level security;
alter table public.scan_jobs enable row level security;
alter table public.webhook_events enable row level security;
alter table public.audit_events enable row level security;
alter table public.contact_requests enable row level security;
alter table public.rate_limit_buckets enable row level security;
alter table public.email_deliveries enable row level security;

create policy users_select_self_or_platform_admin on public.users
for select using (id = auth.uid() or public.is_platform_admin());
create policy organizations_member_select on public.organizations
for select using (public.is_organization_member(id) or is_sample or public.is_platform_admin());
create policy organizations_admin_update on public.organizations
for update using (public.has_organization_role(id, array['owner','admin']::public.organization_role[]) or public.is_platform_admin())
with check (public.has_organization_role(id, array['owner','admin']::public.organization_role[]) or public.is_platform_admin());
create policy organizations_owner_delete on public.organizations
for delete using (public.has_organization_role(id, array['owner']::public.organization_role[]) or public.is_platform_admin());

create policy memberships_member_select on public.organization_members
for select using (public.is_organization_member(organization_id) or public.is_platform_admin());
create policy memberships_admin_insert on public.organization_members
for insert with check (public.has_organization_role(organization_id, array['owner','admin']::public.organization_role[]) or public.is_platform_admin());
create policy memberships_admin_update on public.organization_members
for update using (public.has_organization_role(organization_id, array['owner','admin']::public.organization_role[]) or public.is_platform_admin());
create policy memberships_admin_delete on public.organization_members
for delete using (public.has_organization_role(organization_id, array['owner','admin']::public.organization_role[]) or public.is_platform_admin());

create policy invitations_admin_all on public.organization_invitations
for all using (public.has_organization_role(organization_id, array['owner','admin']::public.organization_role[]) or public.is_platform_admin())
with check (public.has_organization_role(organization_id, array['owner','admin']::public.organization_role[]) or public.is_platform_admin());

create policy projects_member_select on public.projects
for select using (public.is_organization_member(organization_id) or is_sample or public.is_platform_admin());
create policy projects_member_insert on public.projects
for insert with check (public.has_organization_role(organization_id, array['owner','admin','member']::public.organization_role[]) or public.is_platform_admin());
create policy projects_member_update on public.projects
for update using (public.has_organization_role(organization_id, array['owner','admin','member']::public.organization_role[]) or public.is_platform_admin());
create policy projects_admin_delete on public.projects
for delete using (public.has_organization_role(organization_id, array['owner','admin']::public.organization_role[]) or public.is_platform_admin());

create policy github_installations_member_select on public.github_installations
for select using (public.is_organization_member(organization_id) or public.is_platform_admin());
create policy github_installations_admin_write on public.github_installations
for all using (public.has_organization_role(organization_id, array['owner','admin']::public.organization_role[]) or public.is_platform_admin())
with check (public.has_organization_role(organization_id, array['owner','admin']::public.organization_role[]) or public.is_platform_admin());

create policy repositories_member_all on public.repositories
for all using (public.is_organization_member(public.project_organization_id(project_id)) or public.is_platform_admin())
with check (public.is_organization_member(public.project_organization_id(project_id)) or public.is_platform_admin());

create policy site_targets_member_all on public.site_targets
for all using (public.is_organization_member(public.project_organization_id(project_id)) or public.is_platform_admin())
with check (public.is_organization_member(public.project_organization_id(project_id)) or public.is_platform_admin());

create policy domain_verifications_member_select on public.domain_verifications
for select using (
  exists (
    select 1 from public.site_targets s
    where s.id = site_target_id
      and public.is_organization_member(public.project_organization_id(s.project_id))
  ) or public.is_platform_admin()
);

create policy scans_member_select on public.scans
for select using (
  (project_id is not null and public.is_organization_member(public.project_organization_id(project_id)))
  or public.is_platform_admin()
);
create policy scans_member_insert on public.scans
for insert with check (
  project_id is not null
  and public.has_organization_role(public.project_organization_id(project_id), array['owner','admin','member']::public.organization_role[])
);

create policy scan_components_entitled_select on public.scan_components
for select using (
  exists (
    select 1 from public.scans s
    where s.id = scan_id
      and s.project_id is not null
      and public.is_organization_member(public.project_organization_id(s.project_id))
  ) or public.is_platform_admin()
);

create policy findings_paid_select on public.findings
for select using (
  (
    public.is_organization_member(public.project_organization_id(project_id))
    and public.has_active_report_entitlement(project_id)
  ) or public.is_platform_admin()
);
create policy findings_member_status_update on public.findings
for update using (
  public.has_organization_role(public.project_organization_id(project_id), array['owner','admin','member']::public.organization_role[])
  and public.has_active_report_entitlement(project_id)
);

create policy occurrences_paid_select on public.finding_occurrences
for select using (
  exists (
    select 1
    from public.findings f
    where f.id = finding_id
      and public.is_organization_member(public.project_organization_id(f.project_id))
      and public.has_active_report_entitlement(f.project_id)
  ) or public.is_platform_admin()
);

create policy status_events_paid_select on public.finding_status_events
for select using (
  exists (
    select 1 from public.findings f
    where f.id = finding_id
      and public.is_organization_member(public.project_organization_id(f.project_id))
      and public.has_active_report_entitlement(f.project_id)
  ) or public.is_platform_admin()
);
create policy status_events_member_insert on public.finding_status_events
for insert with check (
  actor_user_id = auth.uid()
  and exists (
    select 1 from public.findings f
    where f.id = finding_id
      and public.has_organization_role(public.project_organization_id(f.project_id), array['owner','admin','member']::public.organization_role[])
      and public.has_active_report_entitlement(f.project_id)
  )
);

create policy finding_overrides_platform_admin on public.finding_overrides
for all using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy reports_paid_select on public.reports
for select using (
  public.is_organization_member(organization_id)
  and public.has_active_report_entitlement(project_id)
  or public.is_platform_admin()
);

create policy public_settings_owner_select on public.public_report_settings
for select using (
  enabled
  or public.is_organization_member(public.project_organization_id(project_id))
  or public.is_platform_admin()
);
create policy public_settings_owner_write on public.public_report_settings
for all using (
  public.has_organization_role(public.project_organization_id(project_id), array['owner','admin']::public.organization_role[])
  or public.is_platform_admin()
)
with check (
  public.has_organization_role(public.project_organization_id(project_id), array['owner','admin']::public.organization_role[])
  or public.is_platform_admin()
);

create policy subscriptions_member_select on public.subscriptions
for select using (public.is_organization_member(organization_id) or public.is_platform_admin());
create policy billing_customers_member_select on public.billing_customers
for select using (public.is_organization_member(organization_id) or public.is_platform_admin());
create policy purchases_member_select on public.purchases
for select using (public.is_organization_member(organization_id) or public.is_platform_admin());
create policy report_credit_grants_member_select on public.report_credit_grants
for select using (public.is_organization_member(organization_id) or public.is_platform_admin());
create policy entitlements_member_select on public.project_entitlements
for select using (public.is_organization_member(organization_id) or public.is_platform_admin());

create policy scan_jobs_platform_admin_select on public.scan_jobs
for select using (public.is_platform_admin());
create policy webhook_events_platform_admin_select on public.webhook_events
for select using (public.is_platform_admin());
create policy audit_events_org_admin_select on public.audit_events
for select using (
  (organization_id is not null and public.has_organization_role(organization_id, array['owner','admin']::public.organization_role[]))
  or public.is_platform_admin()
);
create policy contact_requests_platform_admin_select on public.contact_requests
for select using (public.is_platform_admin());
create policy email_deliveries_member_select on public.email_deliveries
for select using (
  (organization_id is not null and public.is_organization_member(organization_id))
  or user_id = auth.uid()
  or public.is_platform_admin()
);

-- Public/anon can read only enabled, deliberately allowlisted trust-page records through the policy.
grant select on public.public_report_settings, public.projects, public.repositories to anon;
grant select on public.public_report_settings, public.projects, public.repositories to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;

-- Privileges do not bypass RLS for anon/authenticated.
revoke all on public.free_scan_requests, public.scan_jobs, public.webhook_events,
  public.contact_requests, public.rate_limit_buckets from anon, authenticated;

-- The public join can expose only sample or enabled-project identity. Tighten project/repository anon policies.
create policy projects_public_enabled_select on public.projects
for select to anon using (
  exists (
    select 1 from public.public_report_settings prs
    where prs.project_id = id and prs.enabled = true
  )
);
create policy repositories_public_enabled_select on public.repositories
for select to anon using (
  visibility = 'public'
  and exists (
    select 1 from public.public_report_settings prs
    where prs.project_id = project_id and prs.enabled = true and prs.show_repository_link = true
  )
);

-- Auth user sync. Workspace creation remains explicit through ensure_user_workspace().
create or replace function public.sync_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users(id, email, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'user_name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = excluded.display_name,
        avatar_url = excluded.avatar_url,
        updated_at = now();
  return new;
end;
$$;

create trigger on_auth_user_created_or_updated
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.sync_auth_user();

comment on table public.finding_occurrences is 'Append-only, redacted machine evidence. Never insert raw secret values.';
comment on table public.finding_overrides is 'Append-only human overrides. Original finding evidence and machine text remain unchanged.';
comment on table public.audit_events is 'Append-only security and administrative audit trail.';
comment on table public.free_scan_requests is 'Opaque-token free scan records. Direct client table access is revoked.';
