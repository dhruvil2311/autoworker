set search_path = public;

create table worker_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  worker_id uuid not null references ghost_workers(id) on delete cascade,
  type text not null check (type in ('CSV', 'SOP', 'EXCEL')),
  name text not null,
  parsed_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on worker_documents (tenant_id, worker_id);

alter table worker_documents enable row level security;

create policy tenant_documents_all on worker_documents
  for all using (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()))
  with check (exists (select 1 from organization_members m where m.organization_id = tenant_id and m.user_id = auth.uid()));

grant all on table public.worker_documents to anon, authenticated, service_role;
