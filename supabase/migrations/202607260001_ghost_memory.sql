create table ghost_memory (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  worker_id uuid not null references ghost_workers(id) on delete cascade,
  type text not null check (type in ('RULE', 'INSTRUCTION', 'FACT', 'EXCEPTION', 'UNKNOWN')),
  content text not null,
  structured_data jsonb not null default '{}',
  confidence numeric not null default 1.0,
  created_at timestamptz not null default now()
);

create index on ghost_memory (tenant_id, worker_id);

alter table ghost_memory enable row level security;

create policy tenant_ghost_memory_all on ghost_memory
  for all using (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()))
  with check (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()));

GRANT ALL ON TABLE public.ghost_memory TO anon, authenticated, service_role;
