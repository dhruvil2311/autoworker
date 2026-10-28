create extension if not exists "pgcrypto";

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table organization_members (
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'operator', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table recordings (
  id uuid primary key,
  tenant_id uuid not null references organizations(id) on delete cascade,
  created_by uuid references auth.users(id),
  source text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table recording_events (
  id uuid primary key,
  tenant_id uuid not null references organizations(id) on delete cascade,
  recording_id uuid not null references recordings(id) on delete cascade,
  sequence integer not null,
  event_type text not null,
  event jsonb not null,
  created_at timestamptz not null default now(),
  unique (recording_id, sequence)
);

create table workflows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'ACTIVE', 'ARCHIVED')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workflow_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  workflow_id uuid not null references workflows(id) on delete cascade,
  version integer not null,
  schema_version text not null,
  compiler_version text not null,
  compiler_model text not null,
  source_recording_id uuid references recordings(id),
  definition jsonb not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (workflow_id, version)
);

create table workflow_secrets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  workflow_id uuid not null references workflows(id) on delete cascade,
  secret_ref text not null,
  provider text not null default 'external',
  created_at timestamptz not null default now(),
  unique (tenant_id, workflow_id, secret_ref)
);

create table execution_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  workflow_version_id uuid not null references workflow_versions(id),
  state text not null,
  idempotency_key text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

create table execution_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  run_id uuid not null references execution_runs(id) on delete cascade,
  step_id text not null,
  state text not null,
  strategy text,
  started_at timestamptz,
  finished_at timestamptz,
  metadata jsonb not null default '{}'
);

create table hitl_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  run_id uuid not null references execution_runs(id) on delete cascade,
  reason text not null,
  state text not null default 'OPEN' constraint hitl_requests_state_check check (state in ('OPEN', 'RESOLVED', 'CANCELLED')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  actor_id uuid references auth.users(id),
  action text not null,
  resource_type text not null,
  resource_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  url text not null,
  signing_secret_ref text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create index on recordings (tenant_id, created_at desc);
create index on recording_events (tenant_id, recording_id, sequence);
create index on workflows (tenant_id, status);
create index on workflow_versions (tenant_id, workflow_id, version desc);
create index on execution_runs (tenant_id, state, created_at desc);
create index on execution_steps (tenant_id, run_id);
create index on hitl_requests (tenant_id, state, created_at desc);
create index on audit_logs (tenant_id, created_at desc);

alter table organizations enable row level security;
alter table organization_members enable row level security;
alter table recordings enable row level security;
alter table recording_events enable row level security;
alter table workflows enable row level security;
alter table workflow_versions enable row level security;
alter table workflow_secrets enable row level security;
alter table execution_runs enable row level security;
alter table execution_steps enable row level security;
alter table hitl_requests enable row level security;
alter table audit_logs enable row level security;
alter table webhook_endpoints enable row level security;

create policy org_member_select on organizations
  for select using (exists (select 1 from organization_members m where m.organization_id = id and m.user_id = auth.uid()));

create policy member_self_select on organization_members
  for select using (user_id = auth.uid());

create policy tenant_recordings_all on recordings
  for all using (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()))
  with check (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()));

create policy tenant_recording_events_all on recording_events
  for all using (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()))
  with check (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()));

create policy tenant_workflows_all on workflows
  for all using (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()))
  with check (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()));

create policy tenant_workflow_versions_all on workflow_versions
  for all using (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()))
  with check (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()));

create policy tenant_workflow_secrets_all on workflow_secrets
  for all using (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()))
  with check (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()));

create policy tenant_execution_runs_all on execution_runs
  for all using (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()))
  with check (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()));

create policy tenant_execution_steps_all on execution_steps
  for all using (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()))
  with check (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()));

create policy tenant_hitl_requests_all on hitl_requests
  for all using (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()))
  with check (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()));

create policy tenant_audit_logs_select on audit_logs
  for select using (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()));

create policy tenant_webhook_endpoints_all on webhook_endpoints
  for all using (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()))
  with check (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()));
