-- Persisted, per-workspace settings (item #9 of the functionality pass).
-- Previously the Settings page only edited local browser state (API URL / token)
-- with nothing backed by the database.

alter table organizations
  add column if not exists settings jsonb not null default '{}'::jsonb;

comment on column organizations.settings is
  'Arbitrary workspace-level settings (notification preferences, defaults, etc.), keyed by feature.';
