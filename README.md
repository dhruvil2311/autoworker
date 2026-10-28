# Autoworker (Ghost Retail Worker)

**Enterprise-Grade Demonstration-to-Automation Cognitive Agent Platform**

Autoworker is a production-oriented platform that turns human browser and desktop demonstrations into resilient, self-healing, deterministic business automations. Rather than recording fragile CSS selectors or relying on unconstrained LLM loops, Autoworker converts multimodal screen recordings, SOPs, and spreadsheets into a mathematically validated **Operational Intermediate Representation (OIR)**, compiles an executable **Workflow DSL V2** abstract syntax tree (AST), and executes tasks autonomously with step-level state checkpoints and Human-in-the-Loop (HITL) safety controls.

---

## 1. Problem Statement & Intended Users

- **The Problem**: Traditional Robotic Process Automation (RPA) breaks whenever websites update their DOM, change CSS classes, or alter page layouts. Pure LLM web agents, conversely, are unpredictable, suffer from token starvation, hallucinate destructive side effects, and lack auditability.
- **The Autoworker Solution**: Combines deterministic heuristic compilers with multimodal reasoning models. Demonstrations are parsed into an intermediate DAG, validated by independent critics, compiled to strict schemas, and executed deterministically with human checkpoints for uncertain or destructive steps.
- **Intended Users**: Retail operations teams, e-commerce managers (Shopify, Amazon, WooCommerce, Magento), enterprise back-office operators, and DevOps engineers managing cross-application data synchronization.

---

## 2. Core Capabilities & Implementation Status

| Status | Capability | Implementation Details |
|---|---|---|
| **Implemented** | Chrome Extension Demonstration Recording | Manifest V3 recorder (`apps/extension`) capturing pointer paths, DOM events, and mutations. |
| **Implemented** | Video Demonstration Extraction | Multi-stage pipeline (`VIDEO_EXTRACTION_ARCHITECTURE.md`) extracting interaction keyframes from `.webm`/`.mp4` media via OpenRouter multimodal models (`minimax/minimax-m3.1-flash:free`). |
| **Implemented** | Desktop Evidence Engine (FastMCP Python) | Python computer vision service (`packages/desktop-evidence-engine`) for scene transition detection, click clustering, and OCR text anchoring. |
| **Implemented** | Operational Intermediate Representation (OIR) | Graph builder, graph equivalence validation, Intent-to-OIR planner, and `OirCritic` (`packages/oir`). |
| **Implemented** | Hybrid Business Process Intelligence (BPI) | Deterministic + semantic normalization of human observations into business process specifications (`packages/bpi`). |
| **Implemented** | Workflow DSL V2 Compiler & Runtime | Strict Zod AST schema (`packages/workflow-schema`), conditional branching (`IF`, `WHILE`), and capability executors (`packages/runtime`). |
| **Implemented** | Step Checkpoints & Crash Recovery | Database-backed state checkpoints (`execution_checkpoints`) enabling resume-after-failure without re-executing completed side effects. |
| **Implemented** | Human-in-the-Loop (HITL) Controls | Pauses execution for human takeover on CAPTCHAs, MFA, unexpected DOM drift, or destructive actions (`hitl_requests`). |
| **Implemented** | Multi-Tenant Database with PostgreSQL RLS | 16 Supabase migrations enforcing strict tenant isolation across all tables. |
| **Implemented** | Continuous Learning (KES) | Knowledge Evolution System (`packages/university`) recording immutable episodes and versioned belief revisions without catastrophic forgetting. |
| **Partially Implemented** | Native Desktop Agent Execution | Desktop application registry and commands schema (`apps/desktop-agent`, `supabase/migrations/202609200001_desktop_execution.sql`). Full production service packaging pending. |
| **Partially Implemented** | Cloud Browserbase Offload | Integration drivers present in `apps/worker`; local Chromium headed/headless execution fully verified. |
| **Planned** | Redis Task Queue Clustering | Distributed multi-node queueing (local atomic Postgres `FOR UPDATE SKIP LOCKED` currently implemented and active). |

---

## 3. Technology Stack & Dependencies

- **Runtime**: Node.js `>= 20.11`, npm workspaces
- **Frontend (`apps/web`)**: React 18, Vite 6, Tailwind CSS, Three.js, Lucide React, Framer Motion, Zustand
- **Backend API (`apps/api`)**: Express 4, TypeScript 5.7, Zod 3, Pino structured logging
- **Worker Daemon (`apps/worker`)**: Playwright Chromium, Stagehand, Browserbase client
- **Extension (`apps/extension`)**: Chrome Extension Manifest V3, esbuild
- **Evidence Engine (`packages/desktop-evidence-engine`)**: Python 3.10+, FastMCP, OpenCV, Pillow
- **Database & Auth**: Supabase PostgreSQL 15, Row-Level Security (RLS), `pgcrypto`
- **Testing**: Vitest 4, Playwright E2E test runner

---

## 4. System Architecture & Data Flow

```
[ Operator Demonstration ] 
  (Chrome Extension / Video / SOP / CSV)
            │
            ▼
[ Ingestion & Evidence Isolation ] ───▶ [ Desktop Evidence Engine ]
  (apps/api multi-tenant storage)         (FastMCP Python OpenCV/OCR)
            │                                       │
            ▼                                       ▼
[ Multimodal Reasoning (OpenRouter) ] ◀─────────────┘
  (minimax-m3.1-flash / gemini-2.0-flash)
            │
            ▼
[ Operational Intermediate Representation (OIR) ]
  • Builder → Validator → Graph Equivalence
  • IntentOirPlanner & OirCritic
            │
            ▼
[ Workflow DSL V2 Compiler ] ───▶ [ Supabase Database ]
  (Zod AST validation)              (Versioned workflow_versions)
            │
            ▼
[ Autonomous Worker Daemon ] ───▶ [ Target Web App / System ]
  (apps/worker Playwright)          (SauceDemo, Shopify, ERP)
            │
      ┌─────┴────────────────┐
      ▼                      ▼
[ Step Checkpoints ]   [ HITL Pause Session ]
(Crash resilience)     (Human operator verification)
      │                      │
      └─────────┬────────────┘
                ▼
[ Knowledge Evolution System (KES) ]
(Immutable episodes.jsonl & knowledge.jsonl)
```

For complete architecture specifications, see [docs/ARCHITECTURE.md](file:///d:/GHOST_WORKING_VS_fixed_copy1/GHOST_WORKING_VS_fixed_copy/GHOST_WORKING_VS_fixed/docs/ARCHITECTURE.md).

---

## 5. Prerequisites & Environment Setup

### 5.1 System Requirements
- Node.js `>= 20.11` (Node 22 LTS recommended)
- npm `>= 10.0`
- Python `>= 3.10` (Optional: for Python FastMCP desktop evidence engine)
- Docker Desktop (Optional: for running local Supabase via `npx supabase start`)

### 5.2 Environment Variables
Copy the template configuration file:
```bash
cp .env.example .env
```

Key environment variables in `.env`:
- `STORAGE_PROVIDER`: Set to `supabase` for persistent multi-tenant workflows or `memory` for stateless mock mode.
- `SUPABASE_URL` & `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase PostgreSQL credentials.
- `OPENROUTER_API_KEY`: API key for multimodal video keyframe understanding (`minimax/minimax-m3.1-flash:free`).
- `GEMINI_API_KEY`: Secondary fallback provider.
- `WORKER_HEADLESS`: Set `false` to display the interactive Chromium browser during automated runs.

See [.env.example](file:///d:/GHOST_WORKING_VS_fixed_copy1/GHOST_WORKING_VS_fixed_copy/GHOST_WORKING_VS_fixed/.env.example) for detailed comments on every configuration variable.

---

## 6. Installation & Quickstart

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Build Dependency Packages
```bash
npm run build:deps
```

### Step 3: Start the Full Development Stack
```bash
npm run dev
```

`npm run dev` executes:
1. `predev`: Runs `node scripts/free-ports.js` to clear ports 4000 and 5173.
2. `dev:seed`: Seeds the local development admin user into Supabase.
3. Concurrently launches:
   - **API Server** on [http://localhost:4000](http://localhost:4000)
   - **Web Dashboard** on [http://localhost:5173](http://localhost:5173)
   - **Worker Daemon** (listening for queued execution runs)

> **Important**: Both the API and Worker must run concurrently. If the worker is not running, runs submitted from the dashboard will remain in `QUEUED` state indefinitely.

---

## 7. Local Development Authentication

The dashboard is pre-configured for local testing:
- **Email**: `admin@ghost.local`
- **Password**: `Ghost@123456`

For direct API calls, pass the development bearer token:
```http
Authorization: Bearer dev:user-a:tenant-a:owner
```
*(This mock token format is strictly blocked when `NODE_ENV=production`).*

---

## 8. Available Commands

All scripts are configured in the root `package.json`:

```bash
# Development
npm run dev             # Start full stack (API + Web + Worker)
npm run dev:api         # Start API server only (port 4000)
npm run dev:web         # Start Web dashboard only (port 5173)
npm run dev:worker      # Start Worker execution daemon only
npm run dev:extension   # Build Chrome extension into apps/extension/dist

# Building & Type Checking
npm run build           # Build all applications and packages
npm run build:deps      # Build internal packages in dependency sequence
npm run typecheck       # Run TypeScript typecheck across all workspaces
npm run lint            # Run linting across all workspaces

# Testing & Evaluation
npm run test            # Run Vitest test suite across all packages
npm run eval:e2e        # Run agent benchmark evaluation runner
npm run test:openrouter # Test OpenRouter connectivity and token budgets
npm run demo:video-to-worker # Run end-to-end video demonstration compilation demo

# Database
npm run db:migrate      # Push pending migrations to database (supabase db push)
```

---

## 9. Database & Migrations

Database schema and RLS policies are maintained under `supabase/migrations/`:
- 16 timestamped SQL migrations manage organizations, recordings, workflows, execution runs, checkpoints, HITL requests, and multimodal assets.
- To apply migrations to your database:
  ```bash
  npm run db:migrate
  ```
- To inspect migration status:
  ```bash
  npx supabase migration list
  ```

For full relational diagrams and policy documentation, refer to [docs/DATABASE_AND_MIGRATIONS.md](file:///d:/GHOST_WORKING_VS_fixed_copy1/GHOST_WORKING_VS_fixed_copy/GHOST_WORKING_VS_fixed/docs/DATABASE_AND_MIGRATIONS.md).

---

## 10. Security & Secret Management

- **Zero Secrets in Git**: Real credentials must reside strictly in `.env` (which is excluded by `.gitignore`).
- **Secret Masking**: `packages/security` and `packages/observability` automatically redact API keys, session tokens, and passwords in all logs and execution steps.
- **SSRF Hardening**: Network executors validate outbound URLs against private IP ranges and cloud metadata endpoints.
- **Reporting Vulnerabilities**: See [SECURITY.md](file:///d:/GHOST_WORKING_VS_fixed_copy1/GHOST_WORKING_VS_fixed_copy/GHOST_WORKING_VS_fixed/SECURITY.md) for responsible disclosure instructions.

---

## 11. Known Limitations & Unverified Integrations

- **Multi-Node Task Queue**: Task claiming currently uses atomic PostgreSQL `FOR UPDATE SKIP LOCKED`. High-throughput distributed clustering using Redis is architecturally planned.
- **Live Supabase Auth E2E Tests**: Automated integration tests in `apps/api` skip live Supabase calls when live external credentials are not configured in CI.
- **Browserbase Cloud Fleet**: Verified with local headed Chromium; Browserbase cloud sessions require an active Browserbase project configuration.

---

## 12. Documentation Index

- [System Architecture](file:///d:/GHOST_WORKING_VS_fixed_copy1/GHOST_WORKING_VS_fixed_copy/GHOST_WORKING_VS_fixed/docs/ARCHITECTURE.md)
- [Database & Migrations Guide](file:///d:/GHOST_WORKING_VS_fixed_copy1/GHOST_WORKING_VS_fixed_copy/GHOST_WORKING_VS_fixed/docs/DATABASE_AND_MIGRATIONS.md)
- [Local Development Guide](file:///d:/GHOST_WORKING_VS_fixed_copy1/GHOST_WORKING_VS_fixed_copy/GHOST_WORKING_VS_fixed/docs/DEVELOPMENT.md)
- [Contributing Guidelines](file:///d:/GHOST_WORKING_VS_fixed_copy1/GHOST_WORKING_VS_fixed_copy/GHOST_WORKING_VS_fixed/CONTRIBUTING.md)
- [Security Policy](file:///d:/GHOST_WORKING_VS_fixed_copy1/GHOST_WORKING_VS_fixed_copy/GHOST_WORKING_VS_fixed/SECURITY.md)
- [License Draft](file:///d:/GHOST_WORKING_VS_fixed_copy1/GHOST_WORKING_VS_fixed_copy/GHOST_WORKING_VS_fixed/LICENSE)
