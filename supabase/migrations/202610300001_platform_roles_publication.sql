-- Role-specific experiences and publication of workflow versions for business use.
-- Additive only: existing roles and rows remain valid.

-- Business users (member), automation builders (builder) and auditors (auditor) join the existing roles.
alter table organization_members drop constraint if exists organization_members_role_check;
alter table organization_members
  add constraint organization_members_role_check
  check (role in ('owner', 'admin', 'builder', 'operator', 'auditor', 'member', 'viewer'));

-- The version business users run. Separate from active_version_id (the builder's current candidate),
-- so recompiling never changes what a published task executes until it is published again.
alter table ghost_workers
  add column if not exists published_version_id uuid references workflow_versions(id);

-- Workflow history per worker without scanning every version definition.
create index if not exists workflow_versions_worker_idx
  on workflow_versions ((definition -> 'compiler' ->> 'worker_id'));
