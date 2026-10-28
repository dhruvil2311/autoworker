-- Migration: Desktop Computer Execution Layer
-- Adds tables for local desktop agent lifecycle, sessions, commands, telemetry, application registry, and structured corrections.

create table if not exists desktop_agents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  hostname text not null default 'localhost',
  os_version text not null default 'Windows',
  capabilities jsonb not null default '["UI_AUTOMATION", "MOUSE", "KEYBOARD", "SCREEN", "OCR", "VISION"]'::jsonb,
  status text not null default 'CONNECTED' check (status in ('CONNECTED', 'IDLE', 'RUNNING', 'PAUSED', 'WAITING_FOR_HUMAN', 'FAILED', 'COMPLETED', 'DISCONNECTED', 'REVOKED')),
  active_session_id uuid,
  last_heartbeat_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists desktop_agent_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  agent_id uuid not null references desktop_agents(id) on delete cascade,
  token_hash text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'TERMINATED', 'EXPIRED')),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now()
);

create table if not exists desktop_execution_commands (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  agent_id uuid not null references desktop_agents(id) on delete cascade,
  execution_id uuid not null,
  step_id text not null,
  sequence_number integer not null default 1,
  action_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'PENDING' check (status in ('PENDING', 'DISPATCHED', 'EXECUTING', 'SUCCEEDED', 'FAILED', 'PAUSED_FOR_HUMAN', 'CANCELLED')),
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists desktop_execution_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  agent_id uuid not null references desktop_agents(id) on delete cascade,
  execution_id uuid not null,
  step_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists desktop_corrections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  agent_id uuid references desktop_agents(id) on delete set null,
  execution_id uuid,
  step_id text not null,
  correction_type text not null,
  original_action jsonb not null default '{}'::jsonb,
  corrected_action jsonb not null default '{}'::jsonb,
  rule_or_selector text,
  notes text,
  status text not null default 'ACCEPTED',
  created_at timestamptz not null default now()
);

create table if not exists desktop_application_registry (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  application_id text not null,
  display_name text not null,
  executable_path text not null,
  window_title_patterns jsonb not null default '[]'::jsonb,
  capabilities jsonb not null default '["UI_AUTOMATION", "MOUSE", "KEYBOARD", "SCREEN"]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, application_id)
);

-- Indices for rapid session, run, and tenant lookups
create index if not exists idx_desktop_agents_tenant on desktop_agents(tenant_id);
create index if not exists idx_desktop_agent_sessions_agent on desktop_agent_sessions(agent_id);
create index if not exists idx_desktop_commands_agent on desktop_execution_commands(agent_id, status);
create index if not exists idx_desktop_events_exec on desktop_execution_events(execution_id, step_id);
create index if not exists idx_desktop_corrections_tenant on desktop_corrections(tenant_id);
create index if not exists idx_desktop_app_registry_tenant on desktop_application_registry(tenant_id);

-- Row Level Security
alter table desktop_agents enable row level security;
alter table desktop_agent_sessions enable row level security;
alter table desktop_execution_commands enable row level security;
alter table desktop_execution_events enable row level security;
alter table desktop_corrections enable row level security;
alter table desktop_application_registry enable row level security;

-- Tenant RLS Policies
create policy tenant_desktop_agents_all on desktop_agents
  for all using (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()))
  with check (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()));

create policy tenant_desktop_sessions_all on desktop_agent_sessions
  for all using (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()))
  with check (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()));

create policy tenant_desktop_commands_all on desktop_execution_commands
  for all using (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()))
  with check (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()));

create policy tenant_desktop_events_all on desktop_execution_events
  for all using (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()))
  with check (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()));

create policy tenant_desktop_corrections_all on desktop_corrections
  for all using (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()))
  with check (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()));

create policy tenant_desktop_app_registry_all on desktop_application_registry
  for all using (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()))
  with check (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()));

-- Grants for Supabase API roles
GRANT ALL ON TABLE desktop_agents TO anon, authenticated, service_role;
GRANT ALL ON TABLE desktop_agent_sessions TO anon, authenticated, service_role;
GRANT ALL ON TABLE desktop_execution_commands TO anon, authenticated, service_role;
GRANT ALL ON TABLE desktop_execution_events TO anon, authenticated, service_role;
GRANT ALL ON TABLE desktop_corrections TO anon, authenticated, service_role;
GRANT ALL ON TABLE desktop_application_registry TO anon, authenticated, service_role;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
