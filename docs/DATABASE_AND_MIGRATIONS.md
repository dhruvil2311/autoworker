# Database Architecture & Migration Guide

## 1. Overview & Architecture

Ghost Retail Worker / Autoworker uses PostgreSQL managed through Supabase as its primary relational store. The database provides strong multi-tenant isolation, immutable recording and event ledgers, atomic execution queueing, Human-in-the-Loop (HITL) pause/resume state management, native desktop automation sessions, and multimodal evidence asset tracking.

Every tenant-facing table enforces Row-Level Security (RLS) anchored to an `organizations` tenant identifier, ensuring absolute data segregation between organizations.

---

## 2. Migration Inventory & Execution Sequence

Database migrations are stored in `supabase/migrations/` and must be applied in strict alphabetical/timestamp order:

| # | Migration File | Target Subsystem | Primary Responsibilities |
|---|---|---|---|
| 1 | `202607220001_initial_schema.sql` | Core Platform | Core multi-tenant tables (`organizations`, `organization_members`, `recordings`, `recording_events`, `workflows`, `workflow_versions`, `workflow_secrets`, `execution_runs`, `execution_steps`, `hitl_requests`, `audit_logs`, `webhook_endpoints`), RLS policies, and performance indexes. |
| 2 | `202607220002_hitl_support.sql` | HITL Engine | State transition validation and resolution triggers for human approval requests. |
| 3 | `202607220003_execution_checkpoints.sql` | Runtime Engine | `execution_checkpoints` table for step-level state serialization, crash recovery, and state rehydration. |
| 4 | `202607220004_ghost_product_layer.sql` | SaaS Product Layer | `ghost_workers`, `ghost_worker_schedules`, and external integration `connections`. |
| 5 | `202607230001_phase3_bpi_layer.sql` | Business Process Intelligence | `business_process_specifications`, `clarification_answers`, `worker_configurations`, and operator `notifications`. |
| 6 | `202607230002_phase3_5_capabilities.sql` | Capability Registry | `background_tasks`, `capability_registry`, `mcp_tool_discovery`, `capability_mappings`, and `executable_plans`. |
| 7 | `202607230003_atomic_queue.sql` | Task Queue | Stored procedure `claim_background_task(claim_limit integer)` using PostgreSQL `FOR UPDATE SKIP LOCKED`. |
| 8 | `202607240002_user_bootstrap.sql` | Auth & Profiles | `profiles` table and trigger on `auth.users` for automatic profile provisioning upon signup. |
| 9 | `202607250001_documents.sql` | Knowledge Ingestion | `worker_documents` table for SOPs, CSVs, guides, and merchant training artifacts. |
| 10 | `202607250002_grants.sql` | Security & Grants | Role permissions and table grants for `authenticated` and `service_role`. |
| 11 | `202607250003_execution_checkpoints_unique.sql` | Runtime Resilience | Unique index constraint on `execution_checkpoints(run_id, step_id)` to ensure checkpoint idempotency. |
| 12 | `202607260001_ghost_memory.sql` | Long-term Memory | `ghost_memory` table for persistent cross-run knowledge retention and belief state. |
| 13 | `202608120001_workspace_settings.sql` | Configuration | Workspace-level key-value settings and provider configurations. |
| 14 | `202608130001_worker_documents_type_check.sql` | Document Types | Extended check constraint on `worker_documents(type)` supporting enriched media and document formats. |
| 15 | `202609200001_desktop_execution.sql` | Desktop Agent Layer | Tables for native desktop agent lifecycle: `desktop_agents`, `desktop_agent_sessions`, `desktop_execution_commands`, `desktop_execution_events`, `desktop_corrections`, `desktop_application_registry`. |
| 16 | `202609280001_desktop_evidence_intelligence.sql` | Video & Media Intelligence | Multimodal evidence processing: `evidence_assets`, `media_analysis_jobs`, `evidence_timeline_events`, `workflow_step_provenance`, `evidence_uncertainties`. |

---

## 3. Relational Schema & Hierarchy

```
organizations (tenant root)
├── organization_members (user-to-tenant mapping with roles: owner, admin, operator, viewer)
├── profiles (user metadata synced from auth.users)
├── recordings (raw user interaction sessions)
│   └── recording_events (ordered, sequence-indexed interaction events)
├── workflows (business automation processes)
│   ├── workflow_versions (immutable versioned AST definitions)
│   │   └── workflow_secrets (encrypted credentials referenced by workflow steps)
│   └── execution_runs (dispatched automation runs)
│       ├── execution_steps (granular step state, timings, and outcomes)
│       ├── execution_checkpoints (serialized state snapshots for crash recovery)
│       └── hitl_requests (human intervention pauses: approvals, credentials, CAPTCHA)
├── ghost_workers (high-level autonomous worker agents)
│   ├── ghost_worker_schedules (cron / interval execution triggers)
│   ├── worker_documents (SOPs, CSVs, demonstration videos, guidelines)
│   ├── evidence_assets (multimodal video recordings, screenshots, keyframes)
│   │   ├── media_analysis_jobs (asynchronous video extraction & OCR pipeline state)
│   │   └── evidence_timeline_events (reconstructed temporal action events)
│   └── ghost_memory (durable episodic and semantic learned beliefs)
├── desktop_agents (registered native computer agents)
│   ├── desktop_agent_sessions (secure 24h JWT-hashed agent sessions)
│   ├── desktop_execution_commands (dispatched OS commands: UI Automation, mouse, keyboard)
│   ├── desktop_execution_events (OS telemetry and execution receipts)
│   └── desktop_corrections (human operator takeovers and corrective actions)
└── audit_logs (append-only security and operational audit trail)
```

---

## 4. Key Constraints, Primary Keys & JSON/JSONB Usage

### 4.1 Primary & Foreign Keys
- **Primary Keys:** UUID v4 generated via `gen_random_uuid()` (backed by PostgreSQL `pgcrypto` extension).
- **Foreign Keys:** All tenant-scoped entities reference `organizations(id)` with `ON DELETE CASCADE`. Run steps cascade from `execution_runs(id)`. Workflow versions cascade from `workflows(id)`.

### 4.2 Unique Constraints & Indexes
- `recording_events(recording_id, sequence)` — Guarantees strict event ordering without sequence collisions.
- `workflow_versions(tenant_id, workflow_id, version desc)` — Optimizes fetching the active/latest version.
- `execution_checkpoints(run_id, step_id)` — Enforces exactly-once checkpoint storage per step.
- `organization_members(organization_id, user_id)` — Composite primary key preventing duplicate memberships.
- `execution_runs(tenant_id, state, created_at desc)` — High-performance worker queue polling index.

### 4.3 JSON / JSONB Storage
PostgreSQL `jsonb` is used deliberately for semi-structured data:
- `workflows.definition`: Full compiled Workflow DSL V2 AST (steps, condition trees, targets).
- `recording_events.event`: Raw DOM and pointer capture (coordinates, selectors, mutation attributes).
- `execution_checkpoints.state_snapshot`: Serialized variable scope and runtime stack.
- `evidence_assets.metadata`: Video codec info, resolution, extracted keyframe hashes.
- `desktop_agents.capabilities`: Array of supported agent primitives (`["UI_AUTOMATION", "MOUSE", "KEYBOARD", "SCREEN", "OCR", "VISION"]`).

---

## 5. Row-Level Security (RLS) & Tenant Isolation

Row-Level Security is enabled across all tenant tables (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`).

### 5.1 Client-Side Query Policy Pattern
For queries executed with an authenticated user JWT (`role: authenticated`), tenant isolation is enforced by verifying membership in `organization_members`:

```sql
CREATE POLICY tenant_isolation_policy ON <table_name>
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM organization_members m
      WHERE m.organization_id = tenant_id
        AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members m
      WHERE m.organization_id = tenant_id
        AND m.user_id = auth.uid()
    )
  );
```

### 5.2 Service Role Execution Pattern
The backend API (`apps/api`) and worker daemons (`apps/worker`) use `SUPABASE_SERVICE_ROLE_KEY`. The service role automatically bypasses RLS in PostgreSQL, allowing workers to process runs across all tenants while enforcing tenant boundaries programmatically in application logic (`tenant_id` query scoping).

---

## 6. Stored Procedures & Database Functions

### `claim_background_task(claim_limit integer)`
Implemented in `202607230003_atomic_queue.sql`:
- Uses `FOR UPDATE SKIP LOCKED` on `background_tasks`.
- Allows multiple distributed workers to claim pending tasks concurrently without race conditions or deadlocks.
- Atomically updates claimed tasks from `PENDING` to `PROCESSING`.

### User Bootstrap Trigger
Implemented in `202607240002_user_bootstrap.sql`:
- Automatically inserts a corresponding row into `public.profiles` whenever a new user is created in `auth.users`.

---

## 7. Development Setup & Migration Operations

### 7.1 Required Environment Variables
Configure the following in your local `.env`:
```bash
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=replace-with-your-anon-key
SUPABASE_SERVICE_ROLE_KEY=replace-with-your-service-role-key
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

### 7.2 Applying Migrations to Local Emulator
1. Start the local Supabase emulator:
   ```bash
   npx supabase start
   ```
2. Apply pending migrations:
   ```bash
   npm run db:migrate
   # Or directly via Supabase CLI:
   npx supabase db push
   ```

### 7.3 Verifying Migration Status
Check applied migration status against the target database:
```bash
npx supabase migration list
```

### 7.4 Testing Tenant Isolation
Automated tests verify that users cannot read or modify data belonging to other tenants:
```bash
npm run test -w packages/runtime -- src/__tests__/isolation.e2e.test.ts
npm run test -w apps/api -- test/tenant-isolation.test.ts
```

---

## 8. Safety & Operational Rules

1. **Never edit an existing migration** that has already been pushed to a shared environment. Always create a new sequential migration with a newer timestamp.
2. **Never drop tables or columns** without a two-phase deprecation cycle.
3. **Never disable RLS** on tenant-facing tables.
4. **Never run migrations against production** without a pre-migration database snapshot.
