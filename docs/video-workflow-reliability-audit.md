# Video → workflow → execution: reliability audit

Two passes. The first (earlier) pass removed synthesized steps from empty extractions, scoped evidence jobs to tenants, pinned Run to a version/recording, and removed several SauceDemo fallbacks. This document records the second pass: what was still wrong, what changed, and what is and is not proven.

## 1. Confirmed root causes (second pass)

| # | Defect (confirmed by reading the runtime path, most also by a failing test) | Where |
|---|---|---|
| R1 | The vision prompt primed the model with a SauceDemo flow ("username, password, first name, postal code, add to cart, checkout…") and told it never to omit such steps, inviting plausible but unobserved steps. | `services/openrouter/openrouter-provider.ts` |
| R2 | Only 6 frames were ever sent, regardless of video length; OCR sent to the model was cut to the first 50 lines of the whole video. Later parts of long recordings were invisible to the model. | `openrouter-provider.ts`, `evidence-episode-builder.ts` |
| R3 | Model output defaults fabricated certainty: missing `evidenceStatus` became `OBSERVED`, missing intent became "Unknown Business Task", citations were optional. | `openrouter/types.ts` |
| R4 | Selectors were invented from keyword maps for SauceDemo, Amazon, OrangeHRM and a "fulfillment" domain (e.g. any target containing "search" → Amazon result selectors, with `body` fallback); generic `button, a`, `input:not([type='hidden'])` catch-alls were appended. | `evidence-pipeline.ts`, `desktop-evidence-bridge.ts` |
| R5 | The most "specific" URL anywhere in OCR overwrote the model's navigation URL — including the final page of the demo, so the workflow could start on the wrong page. | `evidence-pipeline.ts`, `grounding.ts` (found by Test A) |
| R6 | The task-relevance filter discarded every navigation (`^https?://` noise rule; its comment said "unless navigation" but that was never implemented) and substring rules dropped real actions ("Clock in", "Volume discount", "notification"). | `task-relevance-engine.ts` (found by Test A) |
| R7 | Silent step loss: hard 25-step caps (bridge and compiler), consecutive clicks with the same (generic) selector dropped, broad "noise" substrings ("hide", "new tab", "roadmap") removing actions, frame extraction stopping at a frame cap instead of covering the video. | bridge, `compiler.ts`, `frame-sampler.ts` |
| R8 | Fabricated timestamps (`idx * 1.5`, `i * 1.0`) and fabricated frame-transition "CLICK" episodes with OCR text as the target. | pipeline, episode builder, evidence route |
| R9 | Python CV engine invented business rules ("Completed invoices must be uploaded to the portal…" for any browser video) and intents from the list of apps on screen; synthesized navigation was labelled `OBSERVED`. | `ghost_evidence/semantic/*.py` |
| R10 | Browser executor reported success without doing the demonstrated action: typed into the first empty input, clicked any submit button, swallowed click errors, and EXTRACT could return the step's own instruction text as "extracted" data. | `apps/worker/src/executors-v2.ts` |
| R11 | `BUILD_OUTPUT` injected hard-coded Amazon "ergonomic mouse" products as observations when nothing was captured; `VERIFY_OUTPUT` then passed on that data. Recommendations returned an invented "Approve for expedited fulfillment". | `apps/worker/src/output-executor.ts` |
| R12 | Upload identity was the file name: a different video with the same name reused the old file. `/analyze` accepted any server file path. | `routes/evidence.ts` |
| R13 | Workers borrowed a same-named worker's active workflow; Supabase reads fell back to unscoped (cross-tenant) queries for workers, versions, runs and steps. | `store.ts` |
| R14 | `CANCELLED` was unreachable (cancel always 404/no-op); `WAITING_FOR_HUMAN → SUCCEEDED` was allowed; the two stores had different transition tables; transitions were not compare-and-set. | `store.ts` |
| R15 | HITL could not complete: no approve/reject decision was stored, and checkpoint restore replaced the inputs that carry the decision, so an approved step paused again forever. No reject path. Duplicate/stale decisions were re-applied. | `app.ts`, `runtime.ts`, `worker.ts` |
| R16 | Resolving an exception recompiled the worker from documents and activated that version — replacing a video-trained worker's demonstrated workflow. The UI then started a *new* run, which could repeat side effects. | `app.ts`, `RunInspector.tsx` |
| R17 | Recompiling deleted the worker's whole run history (runs, steps, HITL, checkpoints). `/pipeline/compile` returned 201 with `workflowVersionId: null` when persistence failed. | `routes/evidence.ts`, `store.ts` |
| R18 | Run success = "all steps executed"; no check against the expected end state. Run was marked SUCCEEDED by the runtime before output verification, after which the worker's FAILED update was silently rejected. | `runtime.ts`, `worker.ts` |
| R19 | Provider resilience: 429 never retried, `Retry-After` ignored, timeouts not retried, token-limit truncation parsed as a complete list, JSON "repair" could add actions, configured fallback model could never run because a 5xx tripped the global breaker (found by test). | `openrouter-provider.ts`, `quota-manager.ts` |
| R20 | After a HITL pause the browser was closed; a resumed step would act on a blank page with the filled-in fields lost. | `worker.ts`, `executors-v2.ts` (found while writing the live test) |

## 2. Intelligence layer added

`apps/api/src/services/evidence/grounding.ts` (deterministic, testable; no LLM):
- **Evidence extraction vs interpretation**: each model action is classified `OBSERVED` (cited frame/episode), `INFERRED` (cited or corroborated by on-screen text), `REQUIRED_BY_OBJECTIVE` (named in the user's objective) or `UNSUPPORTED`. Unknown citations are ignored and reported.
- **Blocking checks**: unsupported action types, unsupported consequential actions, missing target, missing typed value (credentials go to HITL instead), navigation URL not seen in the recording, no established destination, objective naming a different site than the recording.
- **Warnings**: uncorroborated targets, conflicting values for the same field.
- **Completeness**: every meaningful observed transition (episode) must be cited, textually matched, or explicitly discarded by the model; otherwise it is listed as uncovered and fidelity is `PARTIAL`.
- **Success criteria**: derived only from the demonstrated final state (new confirmation text, final URL path of the same site) or quoted expectations in the user's objective — never from the model's description.

`packages/workflow-schema/src/readiness.ts` (`assessExecutionReadiness`), used at compile, at Run, and by the worker before executing: objective present, executable steps, established first destination, no generic or missing targets, values present, navigation within `expected_domains`, approval gate bound to every irreversible step, no blocking grounding issues; warns when no success criteria exist.

## 3. Changes, by layer

- **Ingestion**: SHA-256 content identity; magic-byte validation (webm/mkv/mp4/mov/avi/png/jpg/webp); empty/corrupt uploads rejected (400/415). Analysis only on the worker's own documents or files inside its storage dir. Reuse of an analysis only for identical bytes, same tenant and worker.
- **Jobs**: `job.json` persisted per job; a job interrupted by a restart reports `FAILED (interrupted)` instead of 404/RUNNING forever; 15-minute watchdog on the CV process.
- **Frames**: extraction covers the full duration (step widened instead of truncating); sampling over budget keeps first/last and spreads evenly; extraction/sampling reports in provenance.
- **LLM**: neutral evidence-citing prompt; each image labelled `FRAME <id> @ <t>s`; chronological segmentation by `MAX_LLM_IMAGES_PER_REQUEST`, bounded by `MAX_SEGMENTS_PER_VIDEO` (explicit failure if exceeded); preceding-actions context per segment; per-segment checkpoints keyed by media fingerprint + prompt version + model + evidence, reused on retry; truncation → `OUTPUT_TRUNCATED`; repair may not add actions; `Retry-After`, jittered backoff, bounded retries, wait-for-slot concurrency, `OPENROUTER_FALLBACK_VISION_MODELS` used only for provider-side failures.
- **Compile**: no step cap; only consecutive edits of the same identified field merge (recorded in `compiler.consolidation`); grounded steps carry `target` descriptors (text/label/role) and provenance (basis, episode ids, frame ids, timestamps, corroborating text); `REQUIRE_APPROVAL` inserted before irreversible actions; final `VERIFY` step from success criteria; no synthesized/default/AI-generated steps for evidence-sourced specs; no order-domain output schema.
- **Activation**: a version becomes active only if readiness passes; otherwise saved as a draft and 422 returned with the issues. In-flight runs of the replaced version are `CANCELLED (SUPERSEDED)`; history kept.
- **Store**: one transition table (`run-state.ts`); compare-and-set updates; no sibling borrowing; no unscoped fallbacks; `decideHitlRequest` (role-checked at the route, tenant-scoped, idempotent for identical repeats, `STALE_DECISION` for conflicting/late/wrong-version decisions, `EXPIRED` → run `TIMED_OUT`, REJECT → run `CANCELLED` and sibling requests cancelled, audit entry with decision and resulting state); `supersedeWorkerRuns`. Migration `202610290001_hitl_decisions.sql`.
- **Routes**: `POST /api/v1/hitl/:id/decision`; resume refused while a decision is pending; cancel works and refuses terminal runs; `/exceptions/:id/resolve` and credential submission go through the decision API (credentials still only to the live session); document recompile kept for non-video workers only.
- **Runtime**: decision inputs survive checkpoint restore; cancellation checked before every step; a side-effecting step found `RUNNING` after a restart pauses (`INTERRUPTED_SIDE_EFFECT_UNVERIFIED`) instead of repeating; `ALREADY_DONE` decision completes a step without executing it; `retry_limit` honoured (never for irreversible steps).
- **Executor**: target resolution by accessible role/name, label, placeholder, visible text or an evidence selector — accepted only when exactly one visible element matches, with bounded polling for slow pages; ambiguity/absence → HITL with page state; typed value read back; unexpected cross-site redirect → HITL; `VERIFY` checks criteria on the live page; paused sessions kept in-process for resume; a lost session → `RESUME_CONTEXT_LOST`.
- **Outcome**: worker classifies `VERIFIED_SUCCESS`, `PARTIAL_COMPLETION`, `WAITING_FOR_HUMAN`, `FAILED`, `UNABLE_TO_VERIFY` and writes the final state once, after verification, with expected vs observed in `resultSummary.outcome`.
- **UI**: Run Inspector records Approve/Reject on the paused run instead of starting a new run; the fake "Workflow recompiled" animation was replaced by real states.

## 4. Tests and results (commands run in this pass)

| Command | Result |
|---|---|
| `apps/api`: `npx vitest run --maxWorkers=1 --exclude '**/dist/**'` | **99 passed, 3 skipped** (34 files; baseline was 75/32) |
| `apps/worker`: same | **22 passed** (5 files). One earlier run had 3 files fail to load; two later runs were clean — cause not identified |
| `packages/runtime`: `npx vitest run --maxWorkers=1` | **42 passed** (20 files). A parallel run crashed a Vitest fork worker (Node fatal error) |
| `packages/workflow-schema` | 2 passed |
| `packages/bpi` | 5 failed, 3 passed — **pre-existing**: same 5 fail on unmodified `HEAD` |
| `packages/desktop-evidence-engine`: `python -m pytest` | 14 passed, 1 failed (`test_13_tri_state_keyboard_inference`) — **pre-existing**: fails without this pass's edits |
| `tsc --noEmit` in workflow-schema, runtime, bpi, api, worker, web | all clean |
| `npm run build:deps`, worker build, web build | all succeed (web: existing large-chunk warning) |
| Lint | no lint scripts exist in the repository |

New tests and what they use:

| Test | File | Mocked |
|---|---|---|
| A different videos → different workflows, URLs, domains, versions, runs | `apps/api/test/evidence-to-execution-integrity.test.ts` | vision model (scripted from the evidence packet), placeholder frames, in-memory store |
| B 30-action recording across segments, repeated click kept, provenance per step, uncovered action reported; hallucinated action blocks | same | same |
| C no static destination; invented/absent URL blocks; approval gate bound to irreversible step | same + live test | same |
| D Run executes exactly the version of the selected recording; replaced version refused; old run cancelled not deleted; no sibling borrowing | same | in-memory store, local-CV path |
| E corrupt/empty upload, path restriction, quota failure mid-video with checkpoint resume, malformed output, DB failure, interrupted job, generic target refused | same + `provider-resilience.test.ts` (fake `fetch`) | HTTP transport, model |
| F HITL: authz, tenant, stale version, duplicate, conflicting, expired, reject, cancel, resume gating, audit; runtime resume/restart/cancel/retry | integrity test + `packages/runtime/src/__tests__/hitl-resume-integrity.test.ts` | in-memory persistence |
| G outcome verified only when the live page shows the expected state | `apps/worker/src/live-execution.test.ts` | vision model only |
| H concurrent compiles and concurrent decisions stay isolated | integrity test | as A |

**Live (not mocked) execution**: `live-execution.test.ts` drives real headless Chromium through the production `V2BrowserExecutor` and `WorkflowRuntime` against a local order-management app (hostnames mapped to 127.0.0.1). The workflow is produced by the real pipeline from synthetic evidence; only the model's answers are scripted. It verifies: pause before "Save order" with zero server writes; approval resume on the same page; `VERIFIED_SUCCESS`; and, independently, the server's own state (order 42 = Shipped with the demonstrated note, saved exactly once; order 43 untouched). Also: unmet criteria → FAILED; missing/ambiguous target → HITL with no other control activated; slow-rendering control waited for; cross-site redirect → HITL; lost session → `RESUME_CONTEXT_LOST`.

## 5. Not verified / remaining limitations

- **No live model call and no real third-party application run** in this pass. The model's judgement on a real recording, and execution against a production system, are unproven. No recording of an order-fulfilment task exists in the repository.
- **Supabase not exercised.** The Supabase implementations of the decision API, compare-and-set transitions and `supersedeWorkerRuns` are type-checked only. Migration `202610290001_hitl_decisions.sql` must be applied; until then decisions fail loudly rather than silently.
- `getTenantScope` still merges two hard-coded workspace tenant IDs into one read scope (left unchanged to avoid hiding existing dev data); this is a tenant-isolation weakness to resolve deliberately.
- Resume after a worker *process restart* pauses with `RESUME_CONTEXT_LOST` (safe) but cannot rebuild page-local state automatically.
- Frame de-duplication compares compressed bytes, not pixels.
- Output synthesizers still apply fixed classification thresholds (e.g. total > 2000 → EXCEPTION) to observed data; `capturePageOutputs` still scrapes Amazon result cards when present (real page data, but site-specific).
- `take-control` returns a constructed Browserbase debug URL that was not verified; the 15-minute "zombie run" rule can fail long runs.
- Browserbase cloud sessions and the desktop executor were not exercised.
- When a workflow has no observable success condition, a fully executed run is stored as `SUCCEEDED` with outcome `UNABLE_TO_VERIFY` (the run-state enum has no unverified state); consumers must read `resultSummary.outcome`.
