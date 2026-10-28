-- Phase 3.5: Capabilities, MCP integration, and Phase 3 structural fixes


-- Fix: Phase 3 Durable Queue missing table
create table background_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  type text not null,
  payload jsonb not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  retry_count integer not null default 0,
  scheduled_for timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Phase 3.5: Capabilities Registry
create table capability_registry (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  connection_id uuid references connections(id) on delete cascade,
  semantic_operation text not null, -- e.g., UPDATE_RECORD
  entity_type text not null, -- e.g., InventoryItem
  execution_type text not null, -- 'MCP', 'API', 'BROWSER', 'DATA'
  provider_type text, -- 'official', 'platform_connector', 'custom'
  input_schema jsonb,
  output_schema jsonb,
  side_effect text not null default 'READ' check (side_effect in ('READ', 'MUTATION', 'UNCERTAIN')),
  risk_level text not null default 'LOW' check (risk_level in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  verification_status text not null default 'DISCOVERED' check (verification_status in ('DISCOVERED', 'PROPOSED', 'VERIFIED', 'REJECTED')),
  confidence numeric not null default 0.0,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Phase 3.5: MCP Tool Discovery
create table mcp_tool_discovery (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  connection_id uuid not null references connections(id) on delete cascade,
  tool_name text not null,
  description text,
  input_schema jsonb,
  output_schema jsonb,
  read_write text not null default 'READ',
  discovered_at timestamptz not null default now(),
  unique (connection_id, tool_name)
);

-- Phase 3.5: Semantic Tool Mappings
create table capability_mappings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  semantic_operation text not null,
  tool_id uuid not null references mcp_tool_discovery(id) on delete cascade,
  confidence numeric not null,
  verification_status text not null default 'PROPOSED',
  evidence jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(semantic_operation, tool_id)
);

-- Phase 3.5: Executable Plans
create table executable_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  bps_id uuid not null references business_process_specifications(id) on delete cascade,
  version integer not null default 1,
  plan_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Update Execution Runs for Executable Plan binding
alter table execution_runs
  add column executable_plan_id uuid references executable_plans(id);

-- Indexes
create index idx_bg_tasks_status on background_tasks (status, scheduled_for) where status = 'PENDING';
create index idx_capability_tenant on capability_registry (tenant_id);
create index idx_mcp_discovery_tenant on mcp_tool_discovery (tenant_id, connection_id);
create index idx_executable_plans_bps on executable_plans (tenant_id, bps_id);

-- RLS

alter table background_tasks enable row level security;
alter table capability_registry enable row level security;
alter table mcp_tool_discovery enable row level security;
alter table capability_mappings enable row level security;
alter table executable_plans enable row level security;


create policy tenant_bg_tasks_all on background_tasks for all using (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid())) with check (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()));
create policy tenant_capabilities_all on capability_registry for all using (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid())) with check (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()));
create policy tenant_mcp_discovery_all on mcp_tool_discovery for all using (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid())) with check (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()));
create policy tenant_mappings_all on capability_mappings for all using (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid())) with check (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()));
create policy tenant_executable_plans_all on executable_plans for all using (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid())) with check (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()));
