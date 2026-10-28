-- Desktop Evidence Intelligence Layer Migration
-- Expands worker_documents to support VIDEO, DESKTOP_RECORDING, SCREENSHOT
-- Adds tables for evidence_assets, media_analysis_jobs, evidence_timeline_events, and workflow_step_provenance

-- 1. Update worker_documents check constraint
alter table worker_documents drop constraint if exists worker_documents_type_check;

alter table worker_documents
  add constraint worker_documents_type_check
  check (type in ('CSV', 'SOP', 'EXCEL', 'PDF', 'DOCX', 'TXT', 'IMAGE', 'VIDEO', 'DESKTOP_RECORDING', 'SCREENSHOT'));

-- 2. Evidence Assets Table
-- Tracks raw media files, video files, screenshots, and native desktop recordings
create table if not exists evidence_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  worker_id uuid references ghost_workers(id) on delete cascade,
  source_type text not null check (source_type in ('VIDEO', 'SCREENSHOT', 'IMAGE', 'DESKTOP_RECORDING', 'DOCUMENT')),
  file_name text not null,
  file_size_bytes bigint not null,
  mime_type text not null,
  storage_path text not null,
  storage_bucket text not null default 'evidence',
  duration_seconds numeric(10, 3),
  width integer,
  height integer,
  fps numeric(6, 2),
  frame_count integer,
  codec text,
  has_audio boolean default false,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_evidence_assets_worker on evidence_assets(worker_id);
create index if not exists idx_evidence_assets_tenant on evidence_assets(tenant_id);

-- 3. Media Analysis Jobs Table
-- Asynchronous tracking of video and desktop recording processing
create table if not exists media_analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  worker_id uuid references ghost_workers(id) on delete cascade,
  evidence_asset_id uuid references evidence_assets(id) on delete set null,
  status text not null check (status in (
    'QUEUED',
    'RUNNING',
    'EXTRACTING',
    'OCR',
    'UNDERSTANDING',
    'BUILDING_TIMELINE',
    'BUILDING_WORKFLOW',
    'NEEDS_CLARIFICATION',
    'COMPLETED',
    'FAILED'
  )),
  progress_percent integer not null default 0 check (progress_percent >= 0 and progress_percent <= 100),
  stage_message text,
  error_message text,
  observations_count integer default 0,
  timeline_events_count integer default 0,
  semantic_events_count integer default 0,
  result_payload jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_media_analysis_jobs_worker on media_analysis_jobs(worker_id);
create index if not exists idx_media_analysis_jobs_status on media_analysis_jobs(status);

-- 4. Evidence Timeline Events
-- Reconstructed temporal observations, state transitions, pointer events, and application switches
create table if not exists evidence_timeline_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  worker_id uuid references ghost_workers(id) on delete cascade,
  evidence_asset_id uuid references evidence_assets(id) on delete cascade,
  job_id uuid references media_analysis_jobs(id) on delete set null,
  timestamp_seconds numeric(10, 3) not null,
  event_type text not null, -- APPLICATION_SWITCH, POINTER_CLICK, KEYBOARD_TYPE, UI_INTERACT, DIALOG_APPEAR, etc.
  application_name text,
  window_title text,
  inference_status text not null check (inference_status in ('OBSERVED', 'INFERRED', 'UNKNOWN')),
  confidence numeric(4, 3) not null default 1.0,
  data jsonb not null default '{}'::jsonb,
  frame_thumbnail_path text,
  created_at timestamptz not null default now()
);

create index if not exists idx_timeline_events_worker on evidence_timeline_events(worker_id);
create index if not exists idx_timeline_events_asset on evidence_timeline_events(evidence_asset_id);
create index if not exists idx_timeline_events_timestamp on evidence_timeline_events(timestamp_seconds);

-- 5. Workflow Step Provenance
-- Direct link from every compiled workflow step back to evidence, timestamps, and confidence
create table if not exists workflow_step_provenance (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  worker_id uuid references ghost_workers(id) on delete cascade,
  workflow_version integer not null default 1,
  step_id text not null,
  step_title text not null,
  evidence_asset_id uuid references evidence_assets(id) on delete cascade,
  start_timestamp numeric(10, 3) not null,
  end_timestamp numeric(10, 3) not null,
  frame_ids text[] default '{}',
  confidence numeric(4, 3) not null default 1.0,
  inference_status text not null check (inference_status in ('OBSERVED', 'INFERRED', 'UNKNOWN')),
  source_observations jsonb default '[]'::jsonb,
  justification text,
  created_at timestamptz not null default now()
);

create index if not exists idx_step_provenance_worker_step on workflow_step_provenance(worker_id, step_id);

-- 6. Evidence Uncertainties & Ambiguities
create table if not exists evidence_uncertainties (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  worker_id uuid references ghost_workers(id) on delete cascade,
  evidence_asset_id uuid references evidence_assets(id) on delete cascade,
  step_id text,
  timestamp_seconds numeric(10, 3),
  uncertainty_type text not null, -- AMBIGUOUS_TARGET, LOW_CONFIDENCE, CONFLICTING_DEMONSTRATION, MISSING_PRECONDITION
  description text not null,
  suggested_clarification_question text,
  resolved boolean default false,
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_evidence_uncertainties_worker on evidence_uncertainties(worker_id);

-- 7. Grants for Supabase API roles
grant all on table evidence_assets to anon, authenticated, service_role;
grant all on table media_analysis_jobs to anon, authenticated, service_role;
grant all on table evidence_timeline_events to anon, authenticated, service_role;
grant all on table workflow_step_provenance to anon, authenticated, service_role;
grant all on table evidence_uncertainties to anon, authenticated, service_role;

-- Notify PostgREST to reload schema cache
notify pgrst, 'reload schema';
