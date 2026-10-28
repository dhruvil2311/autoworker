# System Architecture & Technical Specification

## 1. Executive Summary & Core Thesis

Ghost Retail Worker / Autoworker is an enterprise-grade autonomous process automation platform that transitions robotic process automation from fragile static scripts to adaptive cognitive agents. 

The core architectural loop:
1. **Observe & Teach**: A human operator demonstrates a business task via browser recording, native desktop screen captures, video recordings, SOP documents, or CSV batch data.
2. **Normalize to Intermediate Representation (OIR)**: Raw sensory observations are parsed into a mathematically sound, graph-validated Operational Intermediate Representation (OIR).
3. **Synthesize & Criticize**: Multimodal models synthesize business intent (BPI) while independent critics detect contradictory policies, orphaned steps, and safety violations.
4. **Compile to Deterministic DSL**: The validated plan compiles to an immutable, versioned Workflow DSL V2 abstract syntax tree (AST).
5. **Execute with Verification**: Headless/headed worker daemons drive browser and desktop automation with step-level state checkpoints.
6. **Human-in-the-Loop (HITL)**: Unforeseen UI drift, CAPTCHAs, missing credentials, or destructive business actions pause execution for operator verification.
7. **Continuous Learning (KES)**: Every execution is committed as an immutable episode in the Knowledge Evolution System (KES), revising beliefs for future runs.

---

## 2. End-to-End System Pipeline

```
[ Human Demonstration / Media Artifacts ]
  • Chrome Extension Recording (.json)
  • Video Screen Recordings (.webm / .mp4)
  • Standard Operating Procedures (SOP / PDF / Docx)
  • CSV / Excel Batch Data
                    │
                    ▼
[ Ingestion & Evidence Quarantine ]
  • apps/api: /api/v1/ghost-workers/:id/evidence/upload
  • Multi-tenant quarantine storage in Supabase 'evidence' bucket
                    │
                    ▼
[ Desktop Evidence Engine (Python FastMCP) ]
  • packages/desktop-evidence-engine
  • Keyframe temporal extraction & scene change detection
  • Pointer trajectory analysis, click clustering, OCR text anchoring
                    │
                    ▼
[ Multimodal Reasoning & BPI Normalization ]
  • apps/api/src/services/openrouter / gemini
  • Model: minimax/minimax-m3.1-flash:free or gemini-2.0-flash
  • Derivation of high-level semantic steps (NAVIGATE, CLICK, INPUT, EXTRACT)
                    │
                    ▼
[ Operational Intermediate Representation (OIR) ]
  • packages/oir: Builder → Validator → Graph Equivalence
  • IntentOirPlanner & OirCritic
  • packages/bpi: Hybrid heuristic + LLM Business Process Intelligence
                    │
                    ▼
[ Workflow DSL V2 Compilation & Versioning ]
  • packages/workflow-schema validation (Zod v2.0 AST)
  • Active version registered in database (workflow_versions)
                    │
                    ▼
[ Autonomous Worker Execution ]
  • apps/worker (Playwright / Chromium daemon / Browserbase)
  • packages/runtime (Control flow: SEQUENCE, IF, WHILE, PARALLEL)
  • State Checkpointing (execution_checkpoints) for crash resilience
                    │
           ┌────────┴────────┐
           ▼                 ▼
   [ Succeeded ]      [ HITL Pause Condition ]
   • Deliverable      • Destructive Action / CAPTCHA
   • Output Data      • UI Drift / Missing Target
   • Verify Match     • Operator takeover via Dashboard
           │                 │
           └────────┬────────┘
                    ▼
[ Knowledge Evolution System (KES) ]
  • packages/university/src/kes.ts
  • Immutable Episode appended to episodes.jsonl
  • OutcomeEvaluator & KnowledgeCritic
  • BeliefRevisionEngine updates tenant-scoped belief store
```

---

## 3. Subsystem Responsibilities

The codebase is structured as an npm monorepo with clean boundary enforcement between applications (`apps/`) and reusable internal libraries (`packages/`).

### 3.1 Applications (`apps/`)

| Application | Technology | Primary Responsibilities |
|---|---|---|
| `apps/web` | React 18, Vite, Tailwind CSS, Lucide, Three.js, Framer Motion | Operational dashboard. Renders the interactive Process Visualizer, Live Execution viewer, Teaching Workspace, Evidence Viewer, HITL approval queue, and historical execution metrics. |
| `apps/api` | Node.js, Express, TypeScript, Zod, Supabase Client | Core backend service. Provides authenticated REST API endpoints for recording ingestion, worker scheduling, workflow compilation, capability resolution, run dispatch, and webhook event notifications. |
| `apps/worker` | Node.js, Playwright, Chromium, Stagehand, Browserbase | Execution runtime daemon. Polls queued runs using PostgreSQL atomic row locking, manages Chromium lifecycle, executes browser actions, records runtime steps, and persists state checkpoints. |
| `apps/extension` | Chrome Manifest V3, TypeScript, esbuild | Browser recording extension. Injects content scripts to capture user clicks, keyboard input, DOM mutations, scroll actions, and network transactions during business workflows. |
| `apps/desktop-agent`| Node.js, TypeScript | Desktop computer control bridge. Connects local Windows UI Automation and operating system primitives with the central execution coordinator. |

### 3.2 Packages (`packages/`)

| Package | Purpose & Architecture |
|---|---|
| `packages/workflow-schema` | Single source of truth for workflow AST schemas. Defines step operations (`SEQUENCE`, `CLICK`, `INPUT`, `NAVIGATE`, `EXTRACT`, `IF`, `REQUIRE_APPROVAL`, `CALL_API`, `CALL_MCP`), parameter bindings, and validation rules using Zod. |
| `packages/oir` | Operational Intermediate Representation (OIR). Implements graph building (`OirBuilder`), graph equivalence validation (`isomorphism`), intent planning (`IntentOirPlanner`), independent criticism (`OirCritic`), and semantic reasoning engines. |
| `packages/bpi` | Business Process Intelligence (BPI). Normalizes unstructured user observations into structured business process specifications, resolving discrepancies between human instructions and software UI states. |
| `packages/runtime` | Execution engine. Evaluates Workflow DSL V2 trees with control flow (conditional branching, variable interpolation, loops), execution checkpoints for pause/resume, and modular capability executors (`BROWSER`, `API`, `DATA`, `HUMAN`, `DESKTOP`). |
| `packages/desktop-evidence-engine` | Python FastMCP evidence engine (`ghost_evidence`). Performs computer vision analysis on demonstration recordings, optical character recognition (OCR), pointer trajectory smoothing, and keyframe selection. |
| `packages/university` | Knowledge Evolution System (KES). Implements durable, tenant-scoped episodic memory (`episodes.jsonl`) and semantic knowledge revision (`knowledge.jsonl`) to enable continuous learning across runs without catastrophic forgetting. |
| `packages/security` | Defense-in-depth security layer. Masks credentials and sensitive data in logs, detects PII, enforces SSRF URL safety (blocking loopback, private ranges, metadata APIs), and evaluates mutation safety policies. |
| `packages/observability` | Structured, sanitized logging engine based on Pino. Automatically redacts secrets, passwords, and authorization tokens. |
| `packages/shared-types` | Shared TypeScript interfaces, enums, and utility types utilized across frontend, backend, and runtime packages. |

---

## 4. Key Architectural Patterns & Concepts

### 4.1 BPI (Business Process Intelligence) & OIR (Operational Intermediate Representation)
- **Problem**: Raw human demonstrations contain noise (hesitation clicks, accidental scrolls, irrelevant tab switches). Directly prompting an LLM with raw browser events results in brittle, hallucinated automation.
- **Solution**: The system parses events into a DAG-based OIR. Each node represents an atomic operational intention linked to grounding evidence (coordinates, selectors, text). The `OirCritic` evaluates graph topology, detecting dangling references or disconnected steps before compiling to the executable DSL.

### 4.2 Crash Resilience & Step-Level Checkpoints
Every workflow execution records immutable checkpoints (`execution_checkpoints` table). When a worker encounters an error, power failure, or HITL pause:
1. The complete execution state (variable scope, evaluated conditions, completed steps) is serialized.
2. Upon operator resolution or worker reboot, the runtime rehydrates state from the checkpoint and resumes from the exact paused step without repeating earlier side-effects.

### 4.3 Tenant Isolation by Construction
- Every data entity is strictly scoped to an `organization_id` (tenant ID).
- PostgreSQL Row-Level Security (RLS) policies prevent unauthorized read/write access.
- Cross-tenant memory isolation in KES ensures that knowledge learned in one organization never contaminates another tenant's belief store.

---

## 5. Architectural References & Specialized Deep Dives

For exhaustive documentation on specific subsystems, consult the following specialized reports:
- [Video Demonstration Extraction & Pipeline Architecture](file:///d:/GHOST_WORKING_VS_fixed_copy1/GHOST_WORKING_VS_fixed_copy/GHOST_WORKING_VS_fixed/VIDEO_EXTRACTION_ARCHITECTURE.md)
- [Desktop Evidence Intelligence Architecture](file:///d:/GHOST_WORKING_VS_fixed_copy1/GHOST_WORKING_VS_fixed_copy/GHOST_WORKING_VS_fixed/docs/DESKTOP_EVIDENCE_INTELLIGENCE_ARCHITECTURE.md)
- [Native Desktop Computer Execution](file:///d:/GHOST_WORKING_VS_fixed_copy1/GHOST_WORKING_VS_fixed_copy/GHOST_WORKING_VS_fixed/docs/desktop-execution.md)
- [Workflow DSL V2 Specification](file:///d:/GHOST_WORKING_VS_fixed_copy1/GHOST_WORKING_VS_fixed_copy/GHOST_WORKING_VS_fixed/docs/WORKFLOW_DSL.md)
- [Knowledge Evolution System (KES) Architecture](file:///d:/GHOST_WORKING_VS_fixed_copy1/GHOST_WORKING_VS_fixed_copy/GHOST_WORKING_VS_fixed/KNOWLEDGE_ARCHITECTURE.md)
- [Database Schema & Migrations](file:///d:/GHOST_WORKING_VS_fixed_copy1/GHOST_WORKING_VS_fixed_copy/GHOST_WORKING_VS_fixed/docs/DATABASE_AND_MIGRATIONS.md)
