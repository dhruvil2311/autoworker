alter table execution_runs
  add column provider_session_id text,
  add column provider_session_created_at timestamptz,
  add column provider_session_expires_at timestamptz,
  add column hitl_deadline_at timestamptz;

alter table hitl_requests
  add column workflow_step_id text,
  add column challenge_type text,
  add column expires_at timestamptz,
  add column resolver_id uuid references auth.users(id);

alter table hitl_requests drop constraint hitl_requests_state_check;

update hitl_requests set state = 'PENDING' where state = 'OPEN';

alter table hitl_requests
  alter column state set default 'PENDING',
  add constraint hitl_requests_state_check check (state in ('PENDING', 'CONTROL_ACTIVE', 'VERIFYING', 'RESOLVED', 'EXPIRED', 'CANCELLED'));
