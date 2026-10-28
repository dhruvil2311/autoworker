-- Phase 3: BPI persistence, worker config, notifications, run result summaries

-- Business Process Specifications
create table business_process_specifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  worker_id uuid references ghost_workers(id) on delete set null,
  recording_id uuid references recordings(id) on delete set null,
  status text not null default 'ANALYZING' check (status in (
    'ANALYZING', 'NEEDS_CLARIFICATION', 'READY_FOR_TEST_COMPILATION',
    'TESTING', 'NEEDS_REFINEMENT', 'READY_FOR_APPROVAL', 'APPROVED', 'SUPERSEDED'
  )),
  specification_json jsonb not null default '{}',
  generalization_json jsonb not null default '{}',
  gaps_json jsonb not null default '[]',
  version integer not null default 1,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Clarification answers
create table clarification_answers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  bps_id uuid not null references business_process_specifications(id) on delete cascade,
  gap_id text not null,
  answer_type text not null default 'TEXT' check (answer_type in (
    'TEXT', 'NUMBER', 'YES_NO', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE',
    'FILE_REFERENCE', 'CONNECTION_REFERENCE'
  )),
  answer_json jsonb not null,
  answered_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Worker configurations (merchant-editable values)
create table worker_configurations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  worker_id uuid not null references ghost_workers(id) on delete cascade,
  config_key text not null,
  config_value jsonb not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  unique (worker_id, config_key, version)
);

-- Notifications
create table notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  type text not null,
  channel text not null default 'in_app' check (channel in ('in_app', 'email', 'webhook')),
  title text not null,
  body text,
  resource_type text,
  resource_id uuid,
  read boolean not null default false,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- Add columns to ghost_workers
alter table ghost_workers
  add column recording_id uuid references recordings(id),
  add column bps_id uuid,
  add column trigger_type text not null default 'MANUAL' check (trigger_type in ('MANUAL', 'SCHEDULED', 'WEBHOOK')),
  add column trigger_config jsonb not null default '{}';

-- Add result_summary to execution_runs
alter table execution_runs
  add column result_summary jsonb;

-- Add analysis_stage to ghost_workers for progress tracking
alter table ghost_workers
  add column analysis_stage text;

-- Indexes
create index idx_bps_tenant_worker on business_process_specifications (tenant_id, worker_id);
create index idx_clarification_bps on clarification_answers (tenant_id, bps_id);
create index idx_worker_config on worker_configurations (tenant_id, worker_id);
create index idx_notifications_tenant on notifications (tenant_id, read, created_at desc);

-- RLS
alter table business_process_specifications enable row level security;
alter table clarification_answers enable row level security;
alter table worker_configurations enable row level security;
alter table notifications enable row level security;

create policy tenant_bps_all on business_process_specifications
  for all using (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()))
  with check (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()));

create policy tenant_clarification_all on clarification_answers
  for all using (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()))
  with check (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()));

create policy tenant_worker_config_all on worker_configurations
  for all using (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()))
  with check (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()));

create policy tenant_notifications_all on notifications
  for all using (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()))
  with check (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()));
