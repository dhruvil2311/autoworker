# Platform verification: five role-specific experiences on one backend

Date: 2026-10-30. Everything described here is uncommitted on `main`, on top of the earlier evidence-grounding pass ([video-workflow-reliability-audit.md](../video-workflow-reliability-audit.md)). Baseline before this work: [integration-inventory.md](../architecture/integration-inventory.md).

## 1. Status at a glance

| Status | What it covers |
|---|---|
| **Implemented** | Server-side role and permission model on every route; 17 new platform endpoints; a frame-serving endpoint; worker `/health`; shared Zod contracts; a typed web client; five experiences under `/app` (Workspace, Automation Studio, Operations, Organization, Audit); persisted policies and settings; published-vs-candidate workflow versions; retry safety; tenant-safe deletes. |
| **Automatically tested** | API: 13 platform tests, including a role matrix, contracts, version pinning, retry safety, HITL policy, admin safeguards, policies, exports, frame path containment and a cross-tenant sweep. Web: 9 client tests. Browser e2e: 6 scenarios across all five experiences, in headless Chromium against the real API, the real worker runtime and a local test app. |
| **Live-tested** | Nothing new against third-party services in this phase. The e2e drives a real browser and a real local application (not a mock), with storage in memory. The earlier live OpenRouter attempt was blocked by the free-tier daily limit. |
| **Not verified** | Supabase store paths for the new features (no test database; migrations `202610290001` and `202610300001` not applied anywhere). Live model compile of the e2e recording (no key in the e2e). Browserbase cloud sessions. Desktop-agent execution. |
| **Blocked** | Removing `D:\aw-tmp` (deletion was refused by the permission classifier; the user can delete it). Live model calls (OpenRouter free-tier quota). |

## 2. Architecture found

See the baseline inventory for detail. In short:

- An Express API with an `AppStore` interface (Supabase or in-memory).
- A Playwright worker daemon.
- A React web app with one untyped client.
- Supabase JWT or development tokens (`dev:<user>:<tenant>:<role>`).

The defects that mattered for this work:

- No server-side authorization beyond one HITL check.
- Settings held in a process-local `Map`.
- Pause did not stop the runtime.
- The web app silently signed every user in as `owner`.
- A hard-coded worker URL.
- No concept of a version published for business use.

## 3. What changed

### Backend (`apps/api`)
- **`src/authorization.ts`** (new). Defines roles → permissions, experience requirements, `requirePermission(...)` middleware and `canAccessRun`. All 60 pre-existing routes and the evidence router now carry an explicit permission check.
- **`src/routes/platform.ts`** (new) and **`src/services/platform-service.ts`** (new). They provide:
  - `/me` and the task catalogue;
  - task launch with input validation against the published workflow;
  - version history and publish;
  - retry, run evidence and run report;
  - service health and incidents;
  - members and roles, policies and usage;
  - audit events and run export.
  - Run controls (`canPause/canResume/canCancel/canRetry/canDecide` plus reasons) are computed server-side from persisted state.
- **`src/app.ts`**:
  - `GET /runs` gains filters (`state`, `worker_id`, `workflow_version_id`, `from`, `to`, `outcome`), and holders of only `tasks.run` see only their own runs.
  - Run detail returns `controls`, `worker` and `workflow_version`.
  - HITL list and decisions apply the `membersMayApproveOwnRuns` policy.
  - Cancel works on own runs and returns 409 on terminal runs.
  - Pause stops at the next decision point.
  - Settings are validated and persisted per organization.
  - The worker trigger URL comes from `WORKER_TRIGGER_URL`.
  - Worker auto-spawn is limited to `NODE_ENV=development` outside Vitest.
- **Tenant-safe deletes** (fixed in this session after the cross-tenant sweep found them):
  - `DELETE /ghost-workers/:id/documents/:docId`, `DELETE /ghost-workers/:id/evidence/:docId` and `DELETE /schedules/:id` returned 200 "deleted" for resources that did not exist in the caller's organization.
  - The two document routes also then ran the worker purge. So inside a tenant, a builder sending a non-existent document id to a worker with no documents wiped that worker's workflow and memory.
  - All three now return 404 and do nothing unless the resource exists in the caller's tenant and belongs to that worker.
  - Another tenant's data was never modified, because the store calls are tenant-scoped and the purge ran under the caller's own tenant. But the success response was false.
- **`src/routes/evidence.ts`**: adds `GET /jobs/:jobId/frames/:frameId`. A frame is served only if its resolved path is inside the job's own output directory. Compiled versions are tagged with the worker id.
- **`src/store.ts`**:
  - `RunRow.createdBy`; members; organization settings; version history per worker; `publishedVersionId`.
  - New audit actions: `WORKFLOW_PUBLISHED`, `RUN_RETRIED`, `MEMBER_ROLE_CHANGED`, `POLICIES_UPDATED`, `AUDIT_EXPORTED`.
  - The Supabase `deleteSchedule` now reports whether a row was actually deleted.

### Worker (`apps/worker`)
- `GET /health`. A run stops at `WAITING_FOR_HUMAN` and `PAUSING`. The HITL timeout comes from the organization policy. `runQueuedWorkflow` accepts injected dependencies (used by the e2e).

### Contracts (`packages/shared-types`)
- `src/contracts.ts` (new, exported as `@ghost/shared-types/contracts`, Zod 4) holds 35 schemas: `MeResponse`, `RunSummary`, `RunDetailResponse`, `RunControls`, `TaskList/Detail`, `VersionList`, `Publish`, `Health`, `Members`, `Policies`, `Usage`, `AuditEvents`, `Evidence`, `HitlList`, `Decision` and others.

### Frontend (`apps/web`)
- **`src/platform/`** (new):
  - The typed client `api/client.ts` and the resource map `api/resources.ts`.
  - Session (`/me`), `Layout` with permission-gated navigation, shared UI, shared run panels.
  - Five experiences in `experiences/`.
- `/app/*` is the new default route. The classic workspace (`/workforce`, `/command`, …) stays reachable from the header.
- **`src/api.ts`** (classic client):
  - An existing session is never replaced by the hard-coded development login.
  - Calls to non-existent routes (`deleteWorker`, `submitEvidenceClarification`) were removed.
- **Token normalization** (this session). The classic client stores the token as `Bearer dev:…`, and the new client added its own prefix, so frame images were requested with `Bearer Bearer …` and got 401. `currentToken()` now strips the prefix, and `authorizationHeader()` is the single place that builds the header (used by `apiRequest` and the authenticated image loader).

### Database (`supabase/migrations`)
- `202610300001_platform_roles_publication.sql`: additive only.
  - Widens the `organization_members.role` check to add `builder`, `auditor` and `member`.
  - Adds `ghost_workers.published_version_id`.
  - Adds an index on the worker id inside version definitions.
  - Existing rows stay valid. **Not applied to any database.**

## 4. Endpoints

**New** (all under `/api/v1`, all authenticated; permission shown; "a, b" means either):

| Endpoint | Permission |
|---|---|
| `GET /me` | authenticated |
| `GET /tasks`, `GET /tasks/:workerId` | tasks.view |
| `POST /tasks/:workerId/runs` | tasks.run |
| `GET /ghost-workers/:id/versions` | workflows.build, audit.read |
| `POST /workflows/:versionId/publish` | workflows.publish |
| `POST /runs/:id/retry` | runs.control, tasks.run (own run; policy `retryRequiresOperator`) |
| `GET /runs/:id/evidence`, `GET /runs/:id/report` | runs.view, tasks.run (own), audit.read |
| `GET /ops/health` | ops.view |
| `GET /org/members`, `PATCH /org/members/:userId` | org.manage |
| `GET /org/policies` | org.view, org.manage |
| `PATCH /org/policies` | org.manage |
| `GET /org/usage` | org.view |
| `GET /audit/events` | audit.read |
| `GET /audit/runs/export?format=csv\|json` | audit.export |
| `GET /ghost-workers/:id/evidence/jobs/:jobId/frames/:frameId` | workflows.build |
| Worker: `GET /health` | (internal) |

**Modified**:

- **Every route**: a permission check was added.
- **Run routes**:
  - `GET /runs`: filters and own-run scoping.
  - `GET /runs/:id/detail`: controls, worker and version.
  - `POST /runs/:id/cancel`: own runs; 409 when terminal.
  - `POST /runs/:id/pause`: actually stops at a decision point.
- **HITL routes**: `GET /hitl` and `POST /hitl/:id/decision` are policy-aware.
- **Settings**: `GET/PATCH /settings` are persisted and validated.
- **Deletes**: `DELETE /ghost-workers/:id/documents/:docId`, `DELETE /ghost-workers/:id/evidence/:docId` and `DELETE /schedules/:id` return 404 unless the resource exists.
- **Evidence compile**: tags the worker id.

**Reused unchanged apart from authorization**:

- Recordings: `/recordings/*`.
- Workers and documents:
  - `/ghost-workers` (CRUD);
  - `/ghost-workers/:id/documents`, `/memory`, `/plan`, `/oir`, `/gaps`, `/schedules`, `/chat`;
  - `POST /ghost-workers/:id/run`;
  - `/ghost-workers/:id/evidence/*` (upload, analyze, jobs, timeline, compile).
- Workflows: `/workflows`, `/workflows/:versionId`, `/workflows/:versionId/activate`, `/workflows/:versionId/run`.
- Other: `/connections`, `/notifications`, `/exceptions`, `/audit-log`, `/overview`.

**Deprecated or removed**:

- No server route was removed.
- Removed from the classic client:
  - `deleteWorker`, which called `DELETE /ghost-workers/:id` (no such route);
  - `submitEvidenceClarification`, which called `POST …/evidence/clarification` (no such route).
- `POST /workflows/:versionId/activate` now means "make candidate". Business users run only the **published** version.

## 5. Role-based routing and authorization

| Role | Permissions | Experiences offered |
|---|---|---|
| owner, admin | all 13 | all five |
| builder | tasks.view, tasks.run, runs.view, workflows.build, workflows.publish, hitl.decide_own | Workspace, Studio |
| operator | tasks.view, tasks.run, runs.view, runs.control, hitl.decide, ops.view | Workspace, Operations |
| auditor | runs.view, audit.read, audit.export | Audit |
| member | tasks.view, tasks.run, hitl.decide_own | Workspace |
| viewer | tasks.view, runs.view | Workspace (read-only) |

How the model is enforced:

- **The server is the boundary.** `requirePermission` runs on every protected route, and the store scopes every query by tenant. Run-level ownership (`canAccessRun`) limits `tasks.run`-only users to runs they launched, and `hitl.decide_own` limits them to deciding their own runs, and only when the policy allows it.
- **The frontend only reflects the server.** It reads `/me`, then shows the experiences listed there and hides controls the server would refuse. `/app/<experience>` for an experience the role lacks shows an explanation, not the page.
- **Development role switcher.** The header has one for development tokens only. The server validates the role in the token, and production uses Supabase membership.

## 6. API client and contract strategy

- **One client.** `apiRequest` is the only HTTP path for the new experiences. It handles:
  - the base URL, and one normalized `Authorization` header;
  - timeouts, abort, idempotency keys;
  - both server error shapes (`{error:{code,message,…}}` and `{error:"…", status, …fields}`), keeping every field so refusal reasons and draft ids reach the UI;
  - a `ghost:unauthorized` event on 401.
- **Shared contracts.** The web client validates every response against the shared Zod schemas, and the API tests parse responses with the same schemas. A backend change that breaks the shape fails the API test and, at runtime, shows `CONTRACT_MISMATCH` instead of wrong data.
- **Idempotency and refusals.** Mutations that create runs send an `Idempotency-Key`. Destructive actions (cancel, retry, role change) go through a confirmation dialog, and the server re-checks everything.

## 7. Integration matrix

Each row is a UI action → endpoint → permission → persistence → where it is tested. "API" = `apps/api/test/platform-api.test.ts`. "E2E" = `apps/worker/src/platform.e2e.test.ts`.

| Experience | UI action | Endpoint | Permission | Persistence | Tested |
|---|---|---|---|---|---|
| All | Load identity, role, menus | `GET /me` | auth | members | API, E2E (role badge asserted per user) |
| Workspace | Task catalogue | `GET /tasks` | tasks.view | workers.published_version_id | API, E2E |
| Workspace | Run a task with inputs | `POST /tasks/:id/runs` | tasks.run | execution_runs (pinned version, inputs, created_by) | API, E2E |
| Workspace | Approve a save step | `POST /hitl/:id/decision` | hitl.decide_own (policy) | hitl_requests decision columns | API, E2E |
| Workspace | Result and evidence | `GET /runs/:id/detail`, `/evidence` | tasks.run (own) | steps, result_summary | API, E2E |
| Workspace | Report download | `GET /runs/:id/report` | tasks.run (own) / audit.read | — | API |
| Studio | Upload recording | `POST /ghost-workers/:id/evidence/upload` | workflows.build | documents, files | E2E (real webm) |
| Studio | Analyse; view frames and actions | `POST …/evidence/analyze`, `GET …/jobs/:id`, `…/frames/:fid` | workflows.build | evidence job output | API (path containment), E2E |
| Studio | Compile (refused when ungrounded) | `POST …/evidence/compile-from-job/:jobId` | workflows.build | workflow_versions (draft) | E2E |
| Studio | Versions, readiness, publish | `GET /ghost-workers/:id/versions`, `POST /workflows/:v/publish` | workflows.build / publish | published_version_id, audit | API, E2E |
| Operations | Live runs with filters | `GET /runs?state=…` | runs.view | — | API, E2E |
| Operations | Failing-step diagnosis | `GET /runs/:id/detail` | runs.view | steps | E2E |
| Operations | Cancel / retry as new run | `POST /runs/:id/cancel`, `/retry` | runs.control | runs, audit | API, E2E |
| Operations | Service health and incidents | `GET /ops/health` | ops.view | — (live probes) | API, E2E |
| Organization | Change a member's role | `PATCH /org/members/:id` | org.manage | organization_members, audit | API, E2E |
| Organization | Policies | `GET/PATCH /org/policies` | org.view / org.manage | organizations.settings, audit | API, E2E |
| Organization | Usage | `GET /org/usage` | org.view | — | API, E2E |
| Organization | Connections | `GET/POST/DELETE /connections` | org.view / org.manage | connections | not exercised end-to-end |
| Audit | Execution history and run trace | `GET /runs`, `/runs/:id/detail` | audit.read | — | API, E2E |
| Audit | Audit events | `GET /audit/events` | audit.read | audit_logs | API, E2E |
| Audit | Export runs (CSV/JSON) | `GET /audit/runs/export` | audit.export | audit (AUDIT_EXPORTED) | API, E2E |

## 8. Persistence and state

- **Run state.** Transitions go through `run-state.ts`, and `CANCELLED` is reachable from every non-terminal state.
- **Run controls.** These are derived from persisted run, step and HITL state, never from the client. Retry is refused once a side-effecting step has succeeded, because the application has already changed. In that case a new run is required, and it is pinned to the same version.
- **HITL decisions.** They are durable (`decideHitlRequest`), and the worker resumes from the checkpoint.
- **Policies.** `hitlTimeoutMinutes`, `membersMayApproveOwnRuns` and `retryRequiresOperator` are stored in organization settings, and the worker reads the timeout from them.
- **Published vs candidate.** Recompiling changes only the candidate (`active_version_id`). What business users run changes only on publish, which re-checks readiness.

## 9. Security verification

The following were automatically tested and pass:

- **Role matrix.** 21 representative route × role cases return the expected 200/201/403, and every 403 carries code `FORBIDDEN`.
- **Own-run scoping.** A member cannot see another member's run, evidence or report.
- **Cross-tenant sweep** (added this session). An **owner of another organization** probes 26 id-addressed routes (reads and writes on tasks, workers, versions, runs, HITL, documents and schedules) and 11 list or export routes. The test asserts:
  - no write succeeds and no request causes a server error;
  - no response contains any of this tenant's ids;
  - run, HITL, worker, document and schedule state is unchanged afterwards.

  The sweep found the three delete routes in §3, which are now fixed.
- **Publish safeguards.** Publishing needs readiness and ownership.
- **Admin safeguards.** Admins cannot demote the last owner (409 `LAST_OWNER`), change their own role, or change a member of another organization (404).
- **CSV export.** Formula injection is neutralized (`=HYPERLINK(...)` is exported as `'=HYPERLINK(...)`), and exports are tenant-scoped and audited.
- **Frames.** A frame outside the job's output directory returns 404, a frame requested through another worker returns 404, and a member gets 403.
- **No secrets in logs.** No credentials appear in logs, the UI or this report. Development tokens appear only inside the test harness.

Not verified: Supabase row-level security (`test/tenant-isolation.test.ts` is skipped without a database) and Supabase JWT sign-in.

## 10. Test commands and results

Run on 2026-10-30, with `TEMP`/`TMP` pointed at `D:\aw-tmp`.

| Command | Result |
|---|---|
| `npx vitest run --exclude "dist/**"` in `apps/api` | **112 passed, 3 skipped** (32 files passed, 3 skipped) |
| `npx vitest run test/platform-api.test.ts` in `apps/api` | **13 passed** |
| `npx vitest run --exclude "dist/**"` in `apps/web` | **9 passed** (client tests) |
| `npx vitest run --exclude "dist/**" --maxWorkers=1` in `apps/worker` | **22 passed, 6 skipped** (the 6 skipped are the opt-in e2e scenarios, run in the next rows) |
| `npx vitest run --exclude "dist/**"` in `packages/runtime` | **42 passed** (20 files) |
| `npx vitest run --exclude "dist/**"` in `packages/workflow-schema` | **1 passed** |
| `npm run test:e2e:platform -w apps/worker` | **6 passed** (final run: 132 s) |
| `npx tsc --noEmit` in api, web, worker, runtime, workflow-schema, shared-types | all exit 0 |
| `npm run build -w apps/api`, `npm run build -w apps/worker` | exit 0 |
| `npx vite build` in `apps/web` | exit 0 (chunk-size warning for the existing three.js vendor bundle) |

Notes:

- `npm test` in `apps/api` without `--exclude` also collects compiled copies under `dist/` and reports inflated counts (49 files / 177 tests). The source-only numbers above are the meaningful ones.
- Skipped API tests are opt-in: `atomic-queue` and `tenant-isolation` need Supabase, and `live-auth.integration` needs a real Supabase session.
- Pre-existing failures that also fail on unmodified HEAD, and that this work does not touch: 5 tests in `packages/bpi/src/pipeline.test.ts`, and `test_13_tri_state_keyboard_inference` in the Python desktop-evidence-engine.

## 11. End-to-end scenarios actually run

The harness is `apps/worker/src/platform.e2e.test.ts`, run with `npm run test:e2e:platform -w apps/worker`.

What is real in it:

- The production web build (`apps/web/dist`) in headless Chromium.
- The real Express app with every middleware and permission check.
- The Python evidence engine analysing `saucedemo_demonstration.webm`.
- The worker runtime and browser executor driving a second Chromium against a local order-management application (`orders.acme.test`, resolved to localhost). That application's own server state is asserted independently: its save counter and its order record.

What is not real:

- Storage is the in-memory store.
- No model key is configured.
- The executable "Ship orders" workflow comes from the real evidence pipeline fed with synthetic evidence and a scripted model.

| # | Scenario | Signed in as | What is asserted |
|---|---|---|---|
| 1 | Automation Studio | builder | Uploads the real recording; the analysis job completes; 36 extracted frames load through the authenticated frame endpoint; compiling with only local analysis is **refused** with reasons; the draft is saved but not activated and shows as "1 blocking"; the executable version's steps and readiness are shown; publish succeeds and `publishedVersionId` is set in the store. |
| 2 | Business Workspace | member | Only the Workspace experience is offered; the published task runs pinned to the published version; it pauses before the irreversible save (the app's save counter is still 0); the member approves; the result is shown as "Completed and verified"; the app has saved exactly once with the right values; the outcome is `VERIFIED_SUCCESS`; the member is refused `/ops/health` (403). |
| 3 | Operations | operator | A run whose control no longer exists pauses with a precise locator diagnosis; the operator cancels it (state `CANCELLED`), retries it as a new run pinned to the same version, and cancels the retry through the API; service health shows the API, database and worker as ok and the model provider as down (truthful: no key); the incidents page loads. |
| 4 | Organization | owner | Changes a member's role and two policies, both persisted (store and reload); usage is shown; an operator is refused both changes (403). |
| 5 | Audit | auditor | Execution history; the run trace shows the exact workflow version, the HITL decision (APPROVE by u-member), the steps, the outcome evidence and the audit event; CSV export contains the version column and the run. |
| 6 | Shared state | member, operator, auditor | The same run shows the same run id, version id and result in the Workspace, Operations and Audit experiences. |

Iterations this session:

- Run 3: Studio failed. Frame requests returned 401 because of the doubled `Bearer` prefix (fixed), and the dependent scenarios failed with it.
- Run 4: 5/6 passed. Audit failed on an ambiguous test locator: `getByText("APPROVE")` also matched the step id `approve_step_4_click`. Fixed with `exact: true`.
- Run 5: 6/6 passed.
- Run 6 (final, after two UI fixes found by reviewing the screenshots: a raw `null` under "Recorded result", and a "history" label on a refused draft, now "inactive"): **6/6 passed in 132 s**, and all 21 screenshots below come from this run.

## 12. Screenshots

All are in `docs/verification/screenshots/`, taken by the e2e from the running app:

- Studio: `studio-1-recording-evidence.png`, `studio-2-compile-refused-truthfully.png`, `studio-3-workflow-steps-and-readiness.png`, `studio-4-published.png`.
- Workspace: `business-1-tasks.png`, `business-2-approval-requested.png`, `business-3-verified-result.png`.
- Operations: `ops-1-live-runs.png`, `ops-2-failing-step-diagnosis.png`, `ops-3-retried-as-new-run.png`, `ops-4-service-health.png`, `ops-5-incidents.png`.
- Organization: `admin-1-people-and-roles.png`, `admin-2-policies-persisted.png`, `admin-3-usage.png`.
- Audit: `audit-1-execution-history.png`, `audit-2-run-trace.png`, `audit-3-export.png`.
- Shared state: `shared-1-business.png`, `shared-2-operations.png`, `shared-3-audit.png`.

## 13. Remaining defects, limitations and blockers

1. **Supabase is untested for everything in this phase.** Both migrations must be applied and the new store methods exercised against a real database before production use:
   - migrations `202610290001_hitl_decisions.sql` and `202610300001_platform_roles_publication.sql`;
   - store methods: members, organization settings, version history, `published_version_id`, `audit_logs` reads, `createdBy`.
2. **The in-memory store still merges the hard-coded `WORKSPACE_TENANTS`** for development sessions. This does not affect Supabase, but it means development tenants are not fully isolated.
3. **Live model compile is unverified.** The OpenRouter free-tier daily limit blocked the live attempt, and the e2e runs without a key, so the Studio shows the truthful local-only refusal.
4. **People are shown by user id** (for example `u-member`) in run and audit views. Display names and emails are not resolved yet.
5. **Some features are not exercised end-to-end:**
   - Organization connections management.
   - Studio "Testing" with real inputs.
   - Pause/resume through the UI (covered by API tests only).
   - Business "Reports" download through the UI.
6. **Classic workspace.** The classic workspace (`/workforce`, `/command`, 3D HQ) still uses the untyped classic client. It is reachable, but outside the contract-validated path.
7. **Leftover scratch folder.** `D:\aw-tmp` holds scratch output from test runs. Removing it was refused by the permission classifier, so it needs manual deletion.
8. **Pre-existing failures** in `packages/bpi` (5) and in one Python engine test, as listed in §10.
