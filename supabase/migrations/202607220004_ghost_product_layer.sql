create table ghost_workers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'NEW' check (status in ('NEW', 'RECORDING', 'ANALYZING', 'NEEDS_CLARIFICATION', 'READY_FOR_REVIEW', 'TESTING', 'TEST_FAILED', 'READY_FOR_APPROVAL', 'ACTIVE', 'PAUSED', 'NEEDS_ATTENTION', 'ARCHIVED')),
  workflow_id uuid references workflows(id),
  active_version_id uuid references workflow_versions(id),
  safety_policy jsonb not null default '{}',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ghost_worker_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  worker_id uuid not null references ghost_workers(id) on delete cascade,
  cron_expression text not null,
  enabled boolean not null default true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  system text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'CONNECTED', 'ERROR')),
  secret_ref text not null,
  requires_attention boolean not null default false,
  last_verified_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table execution_runs 
add column worker_id uuid references ghost_workers(id),
add column run_mode text not null default 'PRODUCTION' check (run_mode in ('PRODUCTION', 'TEST'));

create index on ghost_workers (tenant_id, status);
create index on ghost_worker_schedules (tenant_id, next_run_at) where enabled = true;
create index on connections (tenant_id, status);
create index on execution_runs (tenant_id, worker_id);

alter table ghost_workers enable row level security;
alter table ghost_worker_schedules enable row level security;
alter table connections enable row level security;

create policy tenant_ghost_workers_all on ghost_workers
  for all using (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()))
  with check (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()));

create policy tenant_schedules_all on ghost_worker_schedules
  for all using (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()))
  with check (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()));

create policy tenant_connections_all on connections
  for all using (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()))
  with check (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()));
