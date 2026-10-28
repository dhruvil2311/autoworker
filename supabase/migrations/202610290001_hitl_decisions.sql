-- Durable human-in-the-loop decisions and run metadata.
-- A decision must survive restarts: the worker reads it to resume the exact paused step,
-- and the audit trail records who decided what for which workflow version.

alter table hitl_requests
  add column if not exists workflow_version_id uuid references workflow_versions(id),
  add column if not exists decision text,
  add column if not exists decision_payload jsonb,
  add column if not exists decided_by uuid references auth.users(id),
  add column if not exists decided_at timestamptz;

alter table hitl_requests drop constraint if exists hitl_requests_decision_check;
alter table hitl_requests
  add constraint hitl_requests_decision_check check (decision is null or decision in ('APPROVE', 'REJECT', 'PROVIDE_VALUE'));

create index if not exists hitl_requests_run_state_idx on hitl_requests (run_id, state);

-- Run metadata (resume flags, outcome classification) is written by the API and worker.
alter table execution_runs
  add column if not exists metadata jsonb not null default '{}';
