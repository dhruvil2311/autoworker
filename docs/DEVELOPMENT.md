# Local Development & Contributor Engineering Guide

## 1. Prerequisites

Before running the project locally, verify that your development environment satisfies:

- **Node.js**: `>= 20.11` (Node 22 LTS recommended)
- **Package Manager**: `npm` `>= 10.0` (with workspace support)
- **Python**: `>= 3.10` (Optional: only required for the Desktop Evidence Engine FastMCP bridge in `packages/desktop-evidence-engine`)
- **Docker**: (Optional: only required if running local Supabase via `npx supabase start`)
- **Operating System**: Windows, macOS, or Linux

---

## 2. Initial Setup

### Step 1: Install Dependencies
From the repository root:
```bash
npm install
```

### Step 2: Configure Environment Variables
Copy the template configuration file:
```bash
cp .env.example .env
```
Open `.env` and fill in any required variables.
- For quick stateless local testing, `ALLOW_MEMORY_STORAGE=true` and `STORAGE_PROVIDER=memory` can be used without Supabase.
- For full persistent execution, configure your local or hosted Supabase project credentials.
- Add your `OPENROUTER_API_KEY` or `GEMINI_API_KEY` for video demonstration analysis and workflow planning.

---

## 3. Starting the Local Development Stack

To run the complete platform, three services must be active concurrently:
1. **API Server (`apps/api`)** on port `4000`
2. **Web Dashboard (`apps/web`)** on port `5173`
3. **Worker Daemon (`apps/worker`)** which consumes the execution queue and drives the browser

### Recommended: Single Combined Command
```bash
npm run dev
```

This single command automatically handles:
1. **Port Cleaning (`predev`)**: Invokes `node scripts/free-ports.js` to terminate orphaned processes on ports 4000 and 5173.
2. **User Seeding (`dev:seed`)**: Seeds the local test admin account into your local Supabase instance (`scripts/seed-dev-user.ts`).
3. **Concurrent Boot**: Starts the API, frontend, and worker daemon in parallel with unified terminal log prefixes (`api`, `web`, `worker`).

> **CRITICAL NOTE ON `apps/worker`**:  
> If you only run `dev:api` and `dev:web`, clicking "Run" in the dashboard creates a run record, but **no browser action will execute**. The worker daemon (`npm run dev:worker`) is required to poll the queue, launch Chromium, and execute steps.

---

## 4. Development Authentication

During local development, you can sign in to the web dashboard without manual email confirmation:

- **Email**: `admin@ghost.local`
- **Password**: `Ghost@123456`

For direct local API testing (e.g., using curl, Postman, or HTTP clients), use the development bearer token:
```http
Authorization: Bearer dev:user-a:tenant-a:owner
```

### Security Guardrails
Development authentication is strictly locked to non-production environments:
- If `NODE_ENV=production`, the seeder halts and the dev-auth endpoint returns `403 Forbidden`.
- Production authentication relies strictly on Supabase JWT verification and RLS tenant policies.

---

## 5. Verified Command Reference

All commands are defined in `package.json` and operate across the monorepo workspaces:

| Command | Action | Scope / Notes |
|---|---|---|
| `npm run dev` | Start full stack | Automatically seeds user and boots API, Web, and Worker concurrently |
| `npm run build` | Production build | Compiles all packages and applications via `npm run build --workspaces --if-present` |
| `npm run build:deps` | Compile internal packages | Builds `@ghost/workflow-schema`, `@ghost/oir`, `@ghost/security`, `@ghost/shared-types`, `@ghost/bpi`, `@ghost/observability`, `@ghost/runtime`, `@ghost/university`, and `apps/api` in dependency order |
| `npm run test` | Run test suite | Executes Vitest across all workspace packages with unit, integration, and E2E tests |
| `npm run typecheck` | Strict type checking | Runs `tsc --noEmit` across all workspace projects |
| `npm run lint` | Code linting | Runs linting across all workspace projects |
| `npm run dev:api` | Backend API only | Starts Express API on port 4000 with hot reload (`tsx watch`) |
| `npm run dev:web` | Frontend UI only | Starts Vite development server on port 5173 with HMR |
| `npm run dev:worker` | Worker daemon only | Starts Playwright worker listening for queued workflow runs |
| `npm run dev:extension` | Build Chrome extension | Bundles Chrome Manifest V3 extension into `apps/extension/dist/` |
| `npm run db:migrate` | Apply migrations | Executes `supabase db push` against configured PostgreSQL database |
| `npm run eval:e2e` | Run evaluation suite | Executes the agent benchmark suite via `evaluation/runner/index.ts` |
| `npm run test:openrouter` | Test LLM extraction | Validates OpenRouter connectivity and multimodal reasoning token budgets |
| `npm run demo:video-to-worker` | Demo pipeline | Runs end-to-end video ingestion, BPI normalization, and worker execution |

---

## 6. Browser Automation Configuration

The worker daemon supports both local headed/headless Chromium and cloud browser infrastructure:

- **Headed Mode (Visual Debugging)**: Set `WORKER_HEADLESS=false` in `.env`. The worker will pop up an interactive Chromium window so you can observe navigation, element clicks, form typing, and extraction in real time.
- **Headless Mode (CI / Background)**: Set `WORKER_HEADLESS=true` in `.env`.
- **Browser Delay**: Set `WORKER_SLOW_MO=500` (milliseconds) to slow down automated clicks for visual presentation.
- **Inspect on Complete**: Set `KEEP_BROWSER_OPEN=true` to prevent the browser window from closing after a run finishes.
- **Cloud Execution**: Set `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID` to offload execution to Browserbase.

---

## 7. Troubleshooting & Common Issues

### Issue 1: Port 4000 or 5173 Already in Use
**Solution**: Run `node scripts/free-ports.js` or simply run `npm run dev`, which executes `predev` automatically to kill orphaned Node processes holding those ports.

### Issue 2: Worker Fails to Start with Module Not Found (`apps/api/dist`)
**Root Cause**: `apps/worker` imports compiled shared types from `apps/api/dist`. On fresh checkouts, this directory has not been built yet.  
**Solution**: Run `npm run build:deps` to build internal packages in the required dependency sequence.

### Issue 3: Run Sits "QUEUED" Forever
**Root Cause**: The worker process is not running.  
**Solution**: Ensure `npm run dev:worker` (or the combined `npm run dev`) is active in a terminal window.

### Issue 4: Empty Workflow Plan Generated from Evidence
**Root Cause**: `OPENROUTER_API_KEY` or `GEMINI_API_KEY` is missing or invalid in `.env`. If `NODE_ENV=test`, mock providers are used; ensure `NODE_ENV=development`.

### Issue 5: OpenRouter Minimax Reasoning Token Starvation
**Root Cause**: Models enforcing mandatory reasoning (like `minimax-m3.1-flash`) spend default tokens on internal thinking.  
**Solution**: Verify `options.reasoning = { effort: "low" }` and `max_tokens >= 8000` (configured in `apps/api/src/services/openrouter/openrouter-provider.ts`).
