# Integration inventory (baseline, before the five-experience work)

Audited 2026-10-30 from the repository as it stood after the evidence-grounding pass (uncommitted on `main`).

## Architecture found

- **Monorepo** (npm workspaces): `apps/api` (Express 4 + TypeScript, Zod 3), `apps/worker` (Playwright/Browserbase executor + runtime), `apps/web` (React 18 + Vite + react-router 7, Tailwind, three.js "spatial office" UI), `apps/extension`, `apps/desktop-agent`, `packages/*` (workflow-schema, runtime, bpi, oir, security, shared-types, observability, university), Python `desktop-evidence-engine`.
- **Persistence**: `SupabaseStore` (production) and `InMemoryStore` (dev/test) behind one `AppStore` interface. Supabase migrations in `supabase/migrations`.
- **Auth**: Supabase JWT → `organization_members` lookup; development tokens `dev:<user>:<tenant>:<role>` when dev auth is enabled. Roles in the DB: `owner, admin, operator, viewer`.
- **Frontend**: one shell (`/workforce` HQ 3D view, `/command`, `/workers/:id`, `/workers/:id/teach`, `/settings`) using a single untyped client `apps/web/src/api.ts` (59 calls). The dev token defaults to `owner` on every page load.
- **Execution**: API creates runs; a separate worker daemon (`apps/worker`, port 4005) polls Supabase and runs the V2 runtime.

## Categories

### Working and verified (by existing or earlier-pass tests)
- Video upload → content-hash identity → local CV analysis → evidence-grounded compile → readiness gate → version binding (`/ghost-workers/:id/evidence/*`).
- Version-pinned Run (`POST /ghost-workers/:id/run`), idempotent replay, cancel, HITL decision API (`POST /hitl/:id/decision`), exception resolve, run detail (`GET /runs/:id/detail`).
- Worker runtime: approval gates, resume from checkpoint, cancellation checks, outcome classification (live-tested against a local test app).

### Implemented but not integrated
- `POST /workflows/:versionId/activate` exists; no UI calls it, and "published for business use" is not a concept (a recompile replaces the only active version).
- `GET /audit-log`, `GET /hitl`, `POST /hitl/:id/decision`, `/connections` — partly or not surfaced in the UI.
- Run `createdBy` is stored in Supabase but not mapped into `RunRow`.

### Present but broken
- **No server-side authorization** beyond the HITL decision check: any authenticated user can create/compile/run/delete, change settings, read the audit log.
- `PATCH /settings` stores arbitrary bodies in an in-process `Map` (lost on restart) although `organizations.settings` exists.
- `POST /runs/:id/pause` marks a run `WAITING_FOR_HUMAN` but the runtime keeps executing steps (it only stops on terminal states).
- Client calls with no backend route: `DELETE /ghost-workers/:id`, `POST /ghost-workers/:id/evidence/clarification` (no UI callers).
- The web app silently falls back to a hard-coded `owner` dev token for every user.
- API Run trigger URL is hard-coded to `127.0.0.1:4005`.

### Missing and required
- Current user, role, permissions and permitted experiences (`/me`).
- Role model for business users, builders and auditors; permission checks on every protected route.
- Business task catalogue (published workflows), task launch with validated inputs, per-run report.
- Publish + version history per worker.
- Run filters, retry with non-idempotent safety, control eligibility computed server-side.
- Service health (store, worker daemon, model provider, queue) and incidents.
- Organization members/roles, persisted policies, usage.
- Audit search, run export (CSV/JSON), evidence listing.
- Five role-specific experiences, a shared typed client with contract validation, frontend and end-to-end tests.

### Unverified because of environment
- Supabase store paths (no test database available; production database not used for tests).
- Live model compile (OpenRouter free-tier daily limit exhausted at audit time).
- Browserbase cloud sessions; desktop agent execution.

## After the five-experience work

Every item under "Present but broken" and "Missing and required" above was addressed. The two client calls that had no backend route were removed rather than implemented. Results, endpoint changes, the authorization model and what is still unverified (Supabase paths, live model compile) are in [platform-verification.md](../verification/platform-verification.md).
