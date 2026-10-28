-- Add profiles table
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;
create policy profile_self_all on profiles
  for all using (id = auth.uid())
  with check (id = auth.uid());

-- Ensure user workspace RPC
create or replace function ensure_user_workspace(user_id_val uuid)
returns table (
  organization_id uuid,
  role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_role text;
begin
  -- 1. Ensure profile exists (idempotent)
  insert into profiles (id)
  values (user_id_val)
  on conflict (id) do nothing;

  -- 2. Check if the user already has a membership
  select om.organization_id, om.role
  into v_org_id, v_role
  from organization_members om
  where om.user_id = user_id_val
  order by om.created_at asc
  limit 1;

  -- 3. If they don't have one, create an organization and membership atomically
  if v_org_id is null then
    insert into organizations (name)
    values ('My Workspace')
    returning id into v_org_id;
    
    v_role := 'owner';
    
    insert into organization_members (organization_id, user_id, role)
    values (v_org_id, user_id_val, v_role);
  end if;

  return query select v_org_id, v_role;
end;
$$;
