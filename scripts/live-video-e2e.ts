/**
 * Live end-to-end check: real upload → local CV analysis → configured vision model → grounding →
 * compile → readiness → execution in a local headless Chromium → outcome classification.
 *
 * Storage is in-memory (no Supabase writes). The browser is local (no Browserbase session).
 * Credentials are never entered by this script: a sign-in pauses for a human and is reported.
 *
 * Usage:
 *   npx tsx scripts/live-video-e2e.ts --video <recording.webm> --out <output dir> [--objective "..."] [--no-execute]
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as dotenv from "dotenv";
import request from "supertest";

const args = process.argv.slice(2);
const arg = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const video = arg("video");
const outDir = arg("out");
const objective = arg("objective");
const execute = !args.includes("--no-execute");
if (!video || !outDir) {
  console.error("Usage: --video <path> --out <dir> [--objective \"...\"] [--no-execute]");
  process.exit(2);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(repoRoot, ".env") });
const videoPath = path.resolve(video);
const out = path.resolve(outDir);
fs.mkdirSync(out, { recursive: true });
// Evidence storage, analysis output and child-process temp files all go to the output directory.
process.chdir(out);
process.env.TEMP = out;
process.env.TMP = out;

const { createApp } = await import("../apps/api/src/app.js");
const { InMemoryStore } = await import("../apps/api/src/store.js");
const { loadConfig } = await import("../apps/api/src/config.js");
const { assessExecutionReadiness } = await import("@ghost/workflow-schema");
const { WorkflowRuntime, ExecutionPlanner, HumanExecutor, DataExecutor } = await import("@ghost/runtime");
const { V2BrowserExecutor } = await import("../apps/worker/src/executors-v2.js");
const { BrowserbaseExecutionProvider } = await import("../apps/worker/src/browserbase.js");
const { OutputExecutor } = await import("../apps/worker/src/output-executor.js");
const { hitlBus } = await import("../apps/worker/src/hitl-bus.js");
const { classifyOutcome } = await import("../apps/worker/src/worker.js");

const log = (title: string, value?: unknown) => {
  console.log(`\n=== ${title} ===`);
  if (value !== undefined) console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));
};

const config = loadConfig({ ...process.env, NODE_ENV: "development", STORAGE_PROVIDER: "memory", ALLOW_MEMORY_STORAGE: "true", ALLOW_DEV_AUTH: "true" });
const store = new InMemoryStore();
const app = createApp(config, store);
const tenantId = "11111111-2222-4333-8444-555555555555";
const token = `dev:live-check:${tenantId}:owner`;
const auth = { tenantId, userId: "live-check", role: "owner" as const };
const worker = await store.createGhostWorker(auth, { name: `Live check ${path.basename(videoPath)}` });
const api = (method: "get" | "post", url: string) => request(app)[method](`/api/v1/ghost-workers/${worker.id}/evidence${url}`).set("Authorization", `Bearer ${token}`);

log("Model", { vision: config.openRouterVisionModel, reasoning: config.openRouterReasoningModel, imagesPerRequest: config.maxLlmImagesPerRequest });

// 1. Upload
const bytes = fs.readFileSync(videoPath);
const upload = await api("post", "/upload").send({ name: path.basename(videoPath), content: `data:video/webm;base64,${bytes.toString("base64")}` });
log("Upload", { status: upload.status, documentId: upload.body.document?.id, sha256: upload.body.document?.parsedJson?.sha256, error: upload.body.error });
if (upload.status >= 300) process.exit(1);

// 2. Local computer-vision analysis (the real Python engine)
const analyze = await api("post", "/analyze").send({ documentId: upload.body.document.id });
const jobId = analyze.body.jobId;
const started = Date.now();
let job: any;
for (;;) {
  job = (await api("get", `/jobs/${jobId}`)).body;
  if (["COMPLETED", "FAILED"].includes(job.status) || Date.now() - started > 15 * 60_000) break;
  await new Promise(r => setTimeout(r, 2000));
}
log("Local analysis", {
  jobId, status: job.status, seconds: Math.round((Date.now() - started) / 1000), error: job.error,
  frames: job.result?.frames?.length, localActions: job.result?.semantic_actions?.length,
  droppedActions: job.result?.dropped_actions, localIntent: job.result?.process_understanding?.task_intent
});
if (job.status !== "COMPLETED") process.exit(1);

// 3. Compile through the multimodal, evidence-grounded path
const compileStarted = Date.now();
const compiled = await api("post", `/compile-from-job/${jobId}`).send(objective ? { taskObjective: objective } : {});
const body = compiled.body;
log("Compile", {
  httpStatus: compiled.status, seconds: Math.round((Date.now() - compileStarted) / 1000), status: body.status,
  analysisPath: body.analysisPath, error: body.error, providerFailure: body.providerFailure,
  objective: body.grounding?.objective, destination: body.grounding?.destination, coverage: body.grounding?.coverage,
  provenance: body.provenance && { segments: body.provenance.segments, reusedSegments: body.provenance.reusedSegments, sampling: body.provenance.sampling, unresolved: body.provenance.unresolved, discardedNoise: body.provenance.discardedNoise }
});
const issues = body.grounding?.issues || [...(body.clarifications || []), ...(body.warnings || [])];
log("Grounding issues", issues.length ? issues : "none");
if (body.semanticActions) {
  log("Model actions (as returned)", body.semanticActions.map((a: any, i: number) => `${i + 1}. ${a.action} ${JSON.stringify(a.arguments)} [${a.evidenceStatus}; cites ${(a.evidenceEpisodeIds || []).join(",") || "nothing"}]`).join("\n"));
}
if (body.grounding?.actions) {
  log("Grounded actions", body.grounding.actions.map((g: any) => `${g.index + 1}. ${g.action} ${g.target?.text || g.target?.label || g.url || ""}${g.value !== undefined ? ` = "${/pass/i.test(`${g.target?.label}`) ? "***" : g.value}"` : ""} → ${g.basis}${g.irreversible ? " (irreversible)" : ""}`).join("\n"));
}
fs.writeFileSync(path.join(out, "compile-response.json"), JSON.stringify(body, null, 2));

const versionId = body.workflowVersionId || body.draftWorkflowVersionId;
if (!versionId) {
  log("Result", "Nothing was compiled; see grounding issues above.");
  process.exit(0);
}
const version = await store.getWorkflowVersion(auth, versionId);
const workflow: any = version!.workflow;
const leaves = (s: any, acc: any[] = []): any[] => { if (s.children?.length) s.children.forEach((c: any) => leaves(c, acc)); else acc.push(s); return acc; };
log("Compiled steps", leaves(workflow.root_step).map((s: any, i: number) =>
  `${i + 1}. ${s.operation} [${s.target}] ${s.description}${s.args?.url ? ` url=${s.args.url}` : ""}${s.args?.target ? ` target=${JSON.stringify(s.args.target)}` : ""}${s.args?.provenance?.basis ? ` basis=${s.args.provenance.basis}` : ""}`).join("\n"));
log("Success criteria", workflow.success_criteria || []);
const readiness = assessExecutionReadiness(workflow);
log("Readiness", readiness);
if (!execute || !readiness.executable) {
  log("Result", readiness.executable ? "Compiled; execution skipped (--no-execute)." : "Compiled as a draft only; not executable.");
  process.exit(0);
}

// 4. Execute the exact compiled version in a local browser
class MemoryPersistence {
  stepStates = new Map<string, string>();
  runStates: string[] = [];
  hitl: Array<{ stepId: string; reason: string }> = [];
  checkpoint: any = null;
  terminalState?: string;
  async recordStepStarted(id: string) { this.stepStates.set(id, "RUNNING"); }
  async recordStepCompleted(id: string, state: string, _s?: string, message?: string) { this.stepStates.set(id, state); if (state !== "SUCCEEDED") console.log(`  step ${id}: ${state} ${message || ""}`); }
  async recordRunState(state: string) { this.runStates.push(state); if (state === "SUCCEEDED" || state === "FAILED") this.terminalState = state; }
  async recordHitlPause(stepId: string, reason: string) {
    this.hitl.push({ stepId, reason: reason.split(":").slice(0, 2).join(":") });
    // No human is present in this check: a sign-in request is answered "no response" at once.
    if (reason.startsWith("AUTHENTICATION_REQUIRED")) hitlBus.resolve(runId, { resolution: "TIMEOUT" });
  }
  async saveCheckpoint(cursor: string, contextState: any, iterationPath: number[]) { this.checkpoint = { cursor, contextState, iterationPath }; }
  async loadCheckpoint() { return this.checkpoint; }
  async hasStepCompleted(id: string) { return this.stepStates.get(id) === "SUCCEEDED"; }
  async getStepState(id: string) { return this.stepStates.get(id); }
}
const runId = `live-${Date.now()}`;
const persistence = new MemoryPersistence();
const provider = new BrowserbaseExecutionProvider({ browserbaseApiKey: "local" } as any);
process.env.WORKER_SLOW_MO = "0";
const browser = new V2BrowserExecutor(provider, undefined, persistence);
const runtime = new WorkflowRuntime(new ExecutionPlanner().createPlan(versionId, workflow), persistence as any,
  [new HumanExecutor(), new DataExecutor(), new OutputExecutor(), browser],
  { inputs: {}, variables: {}, outputs: {}, artifacts: {}, scopes: [], executionMetadata: { runId, tenantId, workflowVersionId: versionId } });
const execStarted = Date.now();
await runtime.start();
const page: any = (browser as any).page;
const finalUrl = page?.url?.();
if (page) await page.screenshot({ path: path.join(out, "final-page.png") }).catch(() => undefined);
await browser.cleanup().catch(() => undefined);

const state = runtime.getContext().getState();
const runtimeState = persistence.runStates.at(-1) === "WAITING_FOR_HUMAN" ? "WAITING_FOR_HUMAN" : persistence.terminalState;
const outcome = classifyOutcome({
  runtimeState, workflow, outputs: { ...state.variables, ...state.outputs },
  stepStates: [...persistence.stepStates].map(([stepId, s]) => ({ stepId, state: s }))
});
log("Execution", {
  seconds: Math.round((Date.now() - execStarted) / 1000),
  steps: Object.fromEntries(persistence.stepStates),
  humanRequests: persistence.hitl,
  finalUrl,
  outcomeVerification: state.variables.outcome_verification || state.outputs.outcome_verification || null,
  outcome
});
process.exit(0);
