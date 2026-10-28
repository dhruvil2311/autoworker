/**
 * Regression tests A–H for evidence → workflow → run → HITL integrity (API layer).
 *
 * What is mocked, and where:
 *  - The vision model is a scripted VisionReasoningProvider (ScriptedVision). It answers only from the
 *    evidence packet it receives, so these tests exercise segmentation, grounding, BPI, compilation,
 *    persistence and routing for real, but not a live model's judgement.
 *  - Frames are small placeholder files; images are not decoded because the model is scripted.
 *  - Storage is the InMemoryStore; Supabase is not contacted.
 * Live-browser execution is covered separately in apps/worker/src/live-execution.test.ts.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { randomBytes } from "crypto";
import { createApp } from "../src/app.js";
import { InMemoryStore } from "../src/store.js";
import { loadConfig } from "../src/config.js";
import { DesktopEvidenceBridge } from "../src/services/desktop-evidence-bridge.js";
import { EvidenceToWorkflowPipeline } from "../src/services/evidence/evidence-pipeline.js";
import { OpenRouterError, type SemanticAction, type SemanticEvidencePacket, type VisionReasoningProvider, type OcrFact } from "../src/services/openrouter/types.js";
import type { RawVisualObservation } from "../src/services/evidence/task-relevance-engine.js";
import { assessExecutionReadiness } from "@ghost/workflow-schema";
import type { AuthContext } from "@ghost/shared-types";

const config = loadConfig({
  NODE_ENV: "test", STORAGE_PROVIDER: "memory", ALLOW_MEMORY_STORAGE: "true", ALLOW_DEV_AUTH: "true",
  APP_URL: "http://localhost:3000", API_URL: "http://localhost:3000"
});
const tenantA = "00000000-0000-4000-8000-0000000000aa";
const tenantB = "00000000-0000-4000-8000-0000000000bb";
const authA: AuthContext = { tenantId: tenantA, userId: "user-a", role: "owner" };
const authB: AuthContext = { tenantId: tenantB, userId: "user-b", role: "owner" };
const tokenA = `dev:user-a:${tenantA}:owner`;
const tokenB = `dev:user-b:${tenantB}:owner`;
const viewerA = `dev:viewer-a:${tenantA}:viewer`;

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aw-integrity-"));
afterAll(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

// ---------------------------------------------------------------------------------------------
// Evidence fixtures
// ---------------------------------------------------------------------------------------------
type DemoStep = { t: number; type: "NAVIGATE" | "TYPE" | "CLICK" | "SELECT"; target: string; value?: string };
interface Demo { rawObservations: RawVisualObservation[]; rawFrames: Array<{ frameId: string; timestamp: number; filePath: string }>; ocrFacts: OcrFact[] }

function buildDemo(name: string, steps: DemoStep[], finalTexts: string[]): Demo {
  const dir = fs.mkdtempSync(path.join(tmpRoot, `${name}-`));
  const end = Math.ceil(Math.max(...steps.map(s => s.t))) + 2;
  const rawFrames = Array.from({ length: end + 1 }, (_, i) => {
    const filePath = path.join(dir, `frame_${String(i).padStart(6, "0")}.jpg`);
    fs.writeFileSync(filePath, randomBytes(2048));
    return { frameId: `frame_${String(i).padStart(6, "0")}`, timestamp: i, filePath };
  });
  const ocrFacts: OcrFact[] = [];
  for (const s of steps) ocrFacts.push({ text: s.target, timestamp: s.t, frameId: `frame_${String(Math.floor(s.t)).padStart(6, "0")}` });
  for (const text of finalTexts) ocrFacts.push({ text, timestamp: end, frameId: `frame_${String(end).padStart(6, "0")}` });
  const rawObservations: RawVisualObservation[] = steps.map((s, i) => ({
    id: `obs_${i}`,
    timestamp: s.t,
    type: s.type,
    application: "Browser",
    targetText: s.target,
    ...(s.value ? { value: s.value } : {}),
    isClickTarget: s.type === "CLICK",
    isTextMutation: s.type === "TYPE",
    confidence: 0.95
  }));
  return { rawObservations, rawFrames, ocrFacts };
}

/** MOCK vision model: reports, for each episode in the packet it receives, the action that episode shows. */
class ScriptedVision implements VisionReasoningProvider {
  packets: SemanticEvidencePacket[] = [];
  extra: SemanticAction[] = [];
  omitTargets = new Set<string>();
  failOnSegment?: number;
  failWith?: Error;
  constructor(private intent: string) {}
  async extractSemanticActions(packet: SemanticEvidencePacket) {
    this.packets.push(packet);
    if (this.failOnSegment !== undefined && (packet.segment?.index ?? 0) === this.failOnSegment) throw this.failWith;
    const actions: SemanticAction[] = packet.episodes
      .filter(ep => !this.omitTargets.has(ep.action.targetText || ""))
      .map(ep => {
        const type = ep.action.type;
        const target = ep.action.targetText || "";
        const args: Record<string, unknown> = type === "NAVIGATE" ? { url: target } : { target };
        if (ep.action.value) args.value = ep.action.value;
        const action = type === "TYPE" && /choose:/.test(target) ? "SELECT" : type;
        return { action, arguments: args, application: "Browser", evidenceEpisodeIds: [ep.episodeId], confidence: 0.9, evidenceStatus: "OBSERVED" as const, rationale: `Seen in ${ep.episodeId}` };
      });
    if ((packet.segment?.index ?? 0) === 0) actions.push(...this.extra);
    return { semanticActions: actions, discardedNoise: [], unresolved: [], processUnderstanding: this.understanding() };
  }
  async compileProcessUnderstanding() { return this.understanding(); }
  private understanding() {
    return { taskIntent: this.intent, applicationEnvironment: "Web Browser", processStructure: { type: "LINEAR" as const, stepIndices: [] }, variables: [], businessRules: [], expectedOutcomes: [], exceptions: [], confidence: 0.9 };
  }
}

const restockDemo = () => buildDemo("restock", [
  { t: 0.5, type: "NAVIGATE", target: "https://inventory.acme.test/items" },
  { t: 2, type: "CLICK", target: "SKU-7 Ergonomic Chair" },
  { t: 3, type: "TYPE", target: "Restock quantity", value: "40" },
  { t: 4.5, type: "CLICK", target: "Submit restock" }
], ["Restock request submitted", "inventory.acme.test/items/sku-7/restock"]);

const leaveDemo = () => buildDemo("leave", [
  { t: 0.5, type: "NAVIGATE", target: "https://hr.globex.test/leave/requests" },
  { t: 2, type: "CLICK", target: "Request LR-19 Priya Nair" },
  { t: 3, type: "TYPE", target: "Manager comment", value: "Covered by Sam" },
  { t: 4.5, type: "CLICK", target: "Approve" }
], ["Leave request has been approved", "hr.globex.test/leave/requests/lr-19"]);

async function compile(demo: Demo, vision: ScriptedVision, objective: string, jobId: string, checkpointDir?: string) {
  const pipeline = new EvidenceToWorkflowPipeline({ ...config, maxLlmImagesPerRequest: 6 }, vision);
  return pipeline.executePipeline({ jobId, mediaPath: path.join(tmpRoot, `${jobId}.webm`), tenantId: tenantA, workerId: "w", taskObjective: objective, activeApplication: "Browser", ...demo, ...(checkpointDir ? { checkpointDir } : {}) });
}

function leafSteps(step: any, out: any[] = []): any[] {
  if (step.children?.length) step.children.forEach((c: any) => leafSteps(c, out)); else out.push(step);
  return out;
}

// Minimal real container headers so uploads pass format validation.
const WEBM_HEADER = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01]);
const asDataUrl = (bytes: Buffer, mime = "video/webm") => `data:${mime};base64,${bytes.toString("base64")}`;

describe("Evidence-to-execution integrity (Tests A–H)", () => {
  let store: InMemoryStore;
  let app: any;
  beforeEach(() => {
    store = new InMemoryStore();
    app = createApp(config, store);
  });

  // ===========================================================================================
  it("Test A: two different recordings produce different, task-specific workflows", async () => {
    const restock = await compile(restockDemo(), new ScriptedVision("Request a restock of 40 units for SKU-7"), "Request a restock of 40 units for SKU-7", "job_restock");
    const leave = await compile(leaveDemo(), new ScriptedVision("Approve leave request LR-19 with a manager comment"), "Approve leave request LR-19 with a manager comment", "job_leave");
    expect(restock.status).toBe("COMPLETED");
    expect(leave.status).toBe("COMPLETED");

    const r = restock.workflow!, l = leave.workflow!;
    const firstNav = (w: any) => leafSteps(w.root_step).find(s => s.operation === "NAVIGATE")?.args.url;
    expect(firstNav(r)).toBe("https://inventory.acme.test/items");
    expect(firstNav(l)).toBe("https://hr.globex.test/leave/requests");
    expect(r.expected_domains).toEqual(["inventory.acme.test"]);
    expect(l.expected_domains).toEqual(["hr.globex.test"]);
    expect((r.compiler as any).source_recording_id).toBe("job_restock");
    expect((l.compiler as any).source_recording_id).toBe("job_leave");
    const rText = JSON.stringify(r), lText = JSON.stringify(l);
    expect(rText).not.toContain("globex");
    expect(lText).not.toContain("acme");
    expect(r.success_criteria?.map(c => c.value)).toContain("Restock request submitted");
    expect(l.success_criteria?.map(c => c.value)).toContain("Leave request has been approved");

    // Bound to two workers, each run is pinned to its own version.
    const wR = await store.createGhostWorker(authA, { name: "Inventory clerk" });
    const wL = await store.createGhostWorker(authA, { name: "HR assistant" });
    for (const [worker, workflow, job] of [[wR, r, "job_restock"], [wL, l, "job_leave"]] as const) {
      const v = await store.createWorkflowVersion(authA, workflow as any);
      await store.updateGhostWorker(authA, worker.id, { activeVersionId: v.id, workflowId: v.workflowId, trainingSource: { type: "VIDEO_RECORDING", name: job, jobId: job } } as any);
    }
    const runR = await request(app).post(`/api/v1/ghost-workers/${wR.id}/run`).set("Authorization", `Bearer ${tokenA}`)
      .send({ workflow_version_id: (await store.getGhostWorker(authA, wR.id))!.activeVersionId, recording_id: "job_restock" });
    const runL = await request(app).post(`/api/v1/ghost-workers/${wL.id}/run`).set("Authorization", `Bearer ${tokenA}`)
      .send({ workflow_version_id: (await store.getGhostWorker(authA, wL.id))!.activeVersionId, recording_id: "job_leave" });
    expect(runR.status).toBe(202);
    expect(runL.status).toBe(202);
    const vR = await store.getWorkflowVersion(authA, runR.body.run.workflowVersionId);
    const vL = await store.getWorkflowVersion(authA, runL.body.run.workflowVersionId);
    expect(firstNav(vR!.workflow)).toContain("inventory.acme.test");
    expect(firstNav(vL!.workflow)).toContain("hr.globex.test");
  });

  // ===========================================================================================
  it("Test B: every observed action is represented with provenance; nothing is capped or silently merged", async () => {
    const steps: DemoStep[] = [{ t: 0.5, type: "NAVIGATE", target: "https://claims.northwind.test/queue" }];
    for (let i = 0; i < 29; i++) steps.push({ t: 1 + i, type: "CLICK", target: i === 10 || i === 11 ? "Next page" : `Claim C-${100 + i}` });
    const demo = buildDemo("long", steps, []);
    const vision = new ScriptedVision("Review the claims queue page by page");
    vision.omitTargets.add("Claim C-120"); // the model misses one observed click
    const result = await compile(demo, vision, "Review the claims queue page by page", "job_long");

    expect(result.status).toBe("COMPLETED");
    expect(vision.packets.length).toBeGreaterThan(1); // long recording processed in several segments
    const actionSteps = leafSteps(result.workflow!.root_step).filter(s => ["NAVIGATE", "CLICK", "TYPE", "SELECT"].includes(s.operation));
    expect(actionSteps).toHaveLength(29); // 30 observed - 1 the model missed; no 25-step cap
    expect(actionSteps.filter(s => s.args.target?.text === "Next page")).toHaveLength(2); // repeated click kept
    for (const s of actionSteps) {
      expect(s.args.provenance.basis).toBe("OBSERVED");
      expect(s.args.provenance.episode_ids.length).toBeGreaterThan(0);
      expect(typeof s.args.provenance.start_timestamp).toBe("number");
    }
    const coverage = result.grounding!.coverage;
    expect(coverage.fidelity).toBe("PARTIAL");
    expect(coverage.uncovered.map(u => u.targetText)).toEqual(["Claim C-120"]);
    expect((result.workflow!.compiler as any).grounding.coverage.fidelity).toBe("PARTIAL");
  });

  it("Test B: an action the evidence does not support blocks compilation instead of being executed", async () => {
    const vision = new ScriptedVision("Request a restock of 40 units for SKU-7");
    vision.extra.push({ action: "CLICK", arguments: { target: "Delete all items" }, application: "Browser", evidenceEpisodeIds: [], confidence: 0.9, evidenceStatus: "OBSERVED" });
    const result = await compile(restockDemo(), vision, "Request a restock of 40 units for SKU-7", "job_hallucinated");
    expect(result.status).toBe("NEEDS_CLARIFICATION");
    expect(result.workflow).toBeUndefined();
    const blocking = result.grounding!.issues.filter(i => i.severity === "BLOCKING");
    expect(blocking.map(i => i.code)).toContain("UNGROUNDED_ACTION");
    expect(blocking.find(i => i.code === "UNGROUNDED_ACTION")!.message).toContain("Delete all items");
  });

  // ===========================================================================================
  it("Test C: the workflow targets the recorded application and contains no static fallback destination", async () => {
    const result = await compile(leaveDemo(), new ScriptedVision("Approve leave request LR-19"), "Approve leave request LR-19", "job_c");
    const text = JSON.stringify(result.workflow);
    for (const forbidden of ["saucedemo", "amazon.com", "orangehrm", "about:blank", "{{url}}", "app.workspace.internal", "button, a", "\"body\""]) {
      expect(text).not.toContain(forbidden);
    }
    const readiness = assessExecutionReadiness(result.workflow!);
    expect(readiness.executable).toBe(true);
    // Irreversible "Approve" is gated by an approval checkpoint bound to that step.
    const leaves = leafSteps(result.workflow!.root_step);
    const approveIdx = leaves.findIndex(s => s.args?.target?.text === "Approve");
    expect(leaves[approveIdx - 1].operation).toBe("REQUIRE_APPROVAL");
    expect(leaves[approveIdx - 1].args.gates_step_id).toBe(leaves[approveIdx].id);
  });

  it("Test C: without an established destination nothing is compiled; an invented URL is rejected", async () => {
    const noUrl = buildDemo("nourl", [{ t: 1, type: "CLICK", target: "Open record" }, { t: 2, type: "CLICK", target: "Close" }], []);
    const r1 = await compile(noUrl, new ScriptedVision("Open and close a record"), "Open and close a record", "job_nourl");
    expect(r1.status).toBe("NEEDS_CLARIFICATION");
    expect(r1.grounding!.issues.map(i => i.code)).toContain("DESTINATION_UNKNOWN");

    const vision = new ScriptedVision("Open and close a record");
    vision.extra.push({ action: "NAVIGATE", arguments: { url: "https://www.saucedemo.com" }, application: "Browser", evidenceEpisodeIds: [], confidence: 0.9, evidenceStatus: "INFERRED" });
    const r2 = await compile(noUrl, vision, "Open and close a record", "job_invented");
    expect(r2.status).toBe("NEEDS_CLARIFICATION");
    expect(r2.grounding!.issues.some(i => i.code === "UNGROUNDED_URL" || i.code === "UNGROUNDED_ACTION")).toBe(true);
  });

  // ===========================================================================================
  it("Test D: Run executes exactly the version compiled from the selected recording; replaced versions cannot run", async () => {
    const worker = await store.createGhostWorker(authA, { name: "Order desk" });
    const bridge = DesktopEvidenceBridge.getInstance();
    const job = (jobId: string, url: string, field: string) => {
      (bridge as any).jobs.set(jobId, {
        jobId, tenantId: tenantA, workerId: worker.id, status: "COMPLETED", progressPercent: 100, currentStage: "COMPLETE",
        mediaPath: path.join(tmpRoot, `${jobId}.webm`), mediaType: "VIDEO", contentSha256: `sha-${jobId}`, createdAt: new Date().toISOString(),
        result: {
          tenant_id: tenantA, media_id: jobId, frames: [],
          timeline: { states: [{ timestamp: 0, frame_id: "frame_000000", active_application: "Browser", visible_texts: [url] }] },
          process_understanding: { task_intent: "Autonomous multi-step procedure across Browser", applications_involved: ["Browser"], detected_url: url, variables: {}, uncertainties: [] },
          semantic_actions: [
            { id: "a0", action_type: "NAVIGATE", application: "Browser", parameters: { url }, summary: `Open ${url}`, start_timestamp: 0, inference_status: "INFERRED" },
            { id: "a1", action_type: "TYPE", application: "Browser", target_description: field, parameters: { value: "Expedite", field_label: field }, summary: `Type into ${field}`, start_timestamp: 2 },
            { id: "a2", action_type: "CLICK", application: "Browser", target_description: "Save order", summary: "Click Save order", start_timestamp: 4 }
          ]
        }
      });
    };
    job("job_d1", "https://orders.contoso.test/o/1", "Priority");
    job("job_d2", "https://orders.contoso.test/o/2", "Shipping note");

    // No task objective and only a heuristic one from the CV engine: compilation must ask.
    const unclear = await request(app).post(`/api/v1/ghost-workers/${worker.id}/evidence/compile-from-job/job_d1`).set("Authorization", `Bearer ${tokenA}`).send({});
    expect(unclear.status).toBe(422);
    expect(unclear.body.status).toBe("NEEDS_CLARIFICATION");

    const c1 = await request(app).post(`/api/v1/ghost-workers/${worker.id}/evidence/compile-from-job/job_d1`).set("Authorization", `Bearer ${tokenA}`).send({ taskObjective: "Set order 1 priority to Expedite" });
    expect(c1.status).toBe(201);
    expect(c1.body.analysisPath).toBe("LOCAL_CV");
    const v1 = c1.body.workflowVersionId;
    const run1 = await request(app).post(`/api/v1/ghost-workers/${worker.id}/run`).set("Authorization", `Bearer ${tokenA}`).send({ workflow_version_id: v1, recording_id: "job_d1" });
    expect(run1.status).toBe(202);

    const c2 = await request(app).post(`/api/v1/ghost-workers/${worker.id}/evidence/compile-from-job/job_d2`).set("Authorization", `Bearer ${tokenA}`).send({ taskObjective: "Add a shipping note to order 2" });
    expect(c2.status).toBe(201);
    const v2 = c2.body.workflowVersionId;
    expect(v2).not.toBe(v1);

    // The in-flight run of the replaced version is cancelled, not deleted.
    const oldRun = await store.getRun(authA, run1.body.run.id);
    expect(oldRun?.state).toBe("CANCELLED");
    expect((oldRun?.resultSummary as any)?.outcome).toBe("SUPERSEDED");

    const stale = await request(app).post(`/api/v1/ghost-workers/${worker.id}/run`).set("Authorization", `Bearer ${tokenA}`).send({ workflow_version_id: v1, recording_id: "job_d1" });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("ACTIVE_WORKFLOW_CHANGED");
    const mismatch = await request(app).post(`/api/v1/ghost-workers/${worker.id}/run`).set("Authorization", `Bearer ${tokenA}`).send({ workflow_version_id: v2, recording_id: "job_d1" });
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.code).toBe("WORKFLOW_SOURCE_MISMATCH");

    const run2 = await request(app).post(`/api/v1/ghost-workers/${worker.id}/run`).set("Authorization", `Bearer ${tokenA}`).send({ workflow_version_id: v2, recording_id: "job_d2" });
    expect(run2.status).toBe(202);
    expect(run2.body.run.workflowVersionId).toBe(v2);
    const executed = await store.getWorkflowVersion(authA, v2);
    const nav = leafSteps((executed!.workflow as any).root_step).find((s: any) => s.operation === "NAVIGATE");
    expect(nav.args.url).toBe("https://orders.contoso.test/o/2");
    expect(JSON.stringify(executed!.workflow)).toContain("Shipping note");
    expect(JSON.stringify(executed!.workflow)).not.toContain("Priority");
  });

  it("Test D: a same-named worker without its own workflow never borrows another worker's version", async () => {
    const trained = await store.createGhostWorker(authA, { name: "Twin" });
    const untrained = await store.createGhostWorker(authA, { name: "Twin" });
    const v = await store.createWorkflowVersion(authA, { workflow_version: "2.0", name: "x", description: "x", status: "ACTIVE", variables: [], secrets: [], root_step: { id: "r", operation: "SEQUENCE", target: "DATA", description: "r", children: [] }, compiler: { version: "1", source_specification_id: "s", compiled_at: "" } } as any);
    await store.updateGhostWorker(authA, trained.id, { activeVersionId: v.id, workflowId: v.workflowId } as any);
    expect((await store.getGhostWorker(authA, untrained.id))?.activeVersionId).toBeUndefined();
    const res = await request(app).post(`/api/v1/ghost-workers/${untrained.id}/run`).set("Authorization", `Bearer ${tokenA}`).send({ workflow_version_id: v.id });
    expect(res.status).toBe(400);
  });

  // ===========================================================================================
  it("Test E: uploads are identified by content and validated as real media", async () => {
    const worker = await store.createGhostWorker(authA, { name: "Uploader" });
    const up = (name: string, bytes: Buffer) => request(app).post(`/api/v1/ghost-workers/${worker.id}/evidence/upload`).set("Authorization", `Bearer ${tokenA}`).send({ name, content: asDataUrl(bytes) });

    const corrupt = await up("demo.webm", randomBytes(64));
    expect(corrupt.status).toBe(415);
    const empty = await up("demo.webm", Buffer.alloc(0));
    expect(empty.status).toBe(400);

    const first = await up("demo.webm", Buffer.concat([WEBM_HEADER, randomBytes(64)]));
    const second = await up("demo.webm", Buffer.concat([WEBM_HEADER, randomBytes(64)])); // same name, different recording
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.document.id).not.toBe(first.body.document.id);
    expect(second.body.document.parsedJson.sha256).not.toBe(first.body.document.parsedJson.sha256);

    const bytes = Buffer.concat([WEBM_HEADER, randomBytes(32)]);
    const a = await up("a.webm", bytes);
    const b = await up("renamed.webm", bytes); // same bytes, different name
    expect(b.status).toBe(200);
    expect(b.body.duplicateOf).toBe(a.body.document.id);

    // Analysis only accepts this worker's own evidence, never an arbitrary server path.
    const outside = await request(app).post(`/api/v1/ghost-workers/${worker.id}/evidence/analyze`).set("Authorization", `Bearer ${tokenA}`).send({ filePath: path.resolve("package.json") });
    expect(outside.status).toBe(400);
    const otherTenant = await request(app).post(`/api/v1/ghost-workers/${worker.id}/evidence/analyze`).set("Authorization", `Bearer ${tokenB}`).send({ documentId: first.body.document.id });
    expect(otherTenant.status).toBe(404);
  });

  it("Test E: a quota failure mid-recording is reported truthfully and the retry resumes from completed segments", async () => {
    const steps: DemoStep[] = [{ t: 0.5, type: "NAVIGATE", target: "https://tickets.fabrikam.test/open" }];
    for (let i = 0; i < 11; i++) steps.push({ t: 1 + i, type: "CLICK", target: `Ticket T-${i}` });
    const demo = buildDemo("quota", steps, []);
    const checkpointDir = path.join(tmpRoot, "quota-checkpoints");

    const failing = new ScriptedVision("Triage open tickets");
    failing.failOnSegment = 1;
    failing.failWith = new OpenRouterError("RATE_LIMITED", "429 rate limit", 429);
    const first = await compile(demo, failing, "Triage open tickets", "job_quota", checkpointDir);
    expect(first.status).toBe("AI_QUOTA_EXHAUSTED");
    expect(first.success).toBe(false);
    expect(first.workflow).toBeUndefined();
    expect(first.resumable).toBe(true);
    expect(first.provenance?.completedSegments).toBe(1);
    expect(fs.existsSync(path.join(checkpointDir, "segment_0.json"))).toBe(true);

    const healthy = new ScriptedVision("Triage open tickets");
    const second = await compile(demo, healthy, "Triage open tickets", "job_quota", checkpointDir);
    expect(second.status).toBe("COMPLETED");
    expect(second.provenance?.reusedSegments).toBe(1);
    expect(healthy.packets.every(p => (p.segment?.index ?? 0) >= 1)).toBe(true); // segment 0 was not re-sent

    const malformed = new ScriptedVision("Triage open tickets");
    malformed.failOnSegment = 0;
    malformed.failWith = new OpenRouterError("MALFORMED_OUTPUT", "schema validation failed");
    const third = await compile(demo, malformed, "Triage open tickets", "job_malformed");
    expect(third.status).toBe("NEEDS_RETRY");
    expect(third.workflow).toBeUndefined();
  });

  it("Test E: a storage failure is not reported as a successful compilation", async () => {
    const worker = await store.createGhostWorker(authA, { name: "Storage victim" });
    (DesktopEvidenceBridge.getInstance() as any).jobs.set("job_dbfail", {
      jobId: "job_dbfail", tenantId: tenantA, workerId: worker.id, status: "COMPLETED", mediaPath: "x.webm", mediaType: "VIDEO", createdAt: "",
      result: {
        tenant_id: tenantA, frames: [], timeline: { states: [{ timestamp: 0, frame_id: "f0", active_application: "Browser", visible_texts: ["https://orders.contoso.test/o/9"] }] },
        process_understanding: { applications_involved: ["Browser"], detected_url: "https://orders.contoso.test/o/9", variables: {} },
        semantic_actions: [{ action_type: "NAVIGATE", application: "Browser", parameters: { url: "https://orders.contoso.test/o/9" }, start_timestamp: 0 }]
      }
    });
    store.createWorkflowVersion = async () => { throw new Error("database unavailable"); };
    const res = await request(app).post(`/api/v1/ghost-workers/${worker.id}/evidence/compile-from-job/job_dbfail`).set("Authorization", `Bearer ${tokenA}`).send({ taskObjective: "Open order 9" });
    expect(res.status).toBe(500);
    expect((await store.getGhostWorker(authA, worker.id))?.activeVersionId).toBeUndefined();
  });

  it("Test E: an analysis interrupted by a restart is reported as failed, not left running", () => {
    const outputDir = path.join(tmpRoot, "evidence_output", tenantA, "w-restart");
    const jobDir = path.join(outputDir, "job_restart");
    fs.mkdirSync(jobDir, { recursive: true });
    fs.writeFileSync(path.join(jobDir, "job.json"), JSON.stringify({ jobId: "job_restart", tenantId: tenantA, workerId: "w-restart", status: "RUNNING", outputDir }));
    const cwd = process.cwd();
    process.chdir(tmpRoot);
    try {
      const job = DesktopEvidenceBridge.getInstance().getJob("job_restart", tenantA);
      expect(job?.status).toBe("FAILED");
      expect(job?.error).toMatch(/interrupted/);
      expect(DesktopEvidenceBridge.getInstance().getJob("job_restart", tenantB)).toBeUndefined();
    } finally {
      process.chdir(cwd);
    }
  });

  it("Test E: a workflow with a generic target is refused at Run time", async () => {
    const worker = await store.createGhostWorker(authA, { name: "Generic" });
    const v = await store.createWorkflowVersion(authA, {
      workflow_version: "2.0", name: "g", description: "Close the open ticket", status: "ACTIVE", variables: [], secrets: [], expected_domains: ["tickets.fabrikam.test"],
      compiler: { version: "1", source_specification_id: "s", compiled_at: "" },
      root_step: { id: "r", operation: "SEQUENCE", target: "DATA", description: "r", children: [
        { id: "n", operation: "NAVIGATE", target: "BROWSER_DETERMINISTIC", description: "Open", args: { url: "https://tickets.fabrikam.test" } },
        { id: "c", operation: "CLICK", target: "BROWSER_DETERMINISTIC", description: "Click", args: { selector: "button, a" } }
      ] }
    } as any);
    await store.updateGhostWorker(authA, worker.id, { activeVersionId: v.id, workflowId: v.workflowId } as any);
    const res = await request(app).post(`/api/v1/ghost-workers/${worker.id}/run`).set("Authorization", `Bearer ${tokenA}`).send({ workflow_version_id: v.id });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("WORKFLOW_NOT_EXECUTABLE");
    expect(res.body.issues.map((i: any) => i.code)).toContain("GENERIC_TARGET");
  });

  // ===========================================================================================
  async function pausedRun(auth: AuthContext, stepId = "approve_step_3_click") {
    const run = await store.createRun(auth, "wv-paused", undefined, undefined, "PRODUCTION");
    await store.updateRunState(auth, run.id, "STARTING");
    await store.updateRunState(auth, run.id, "RUNNING");
    await store.updateRunState(auth, run.id, "WAITING_FOR_HUMAN");
    await store.createHitlRequest(auth, { runId: run.id, workflowStepId: stepId, challengeType: "MANUAL_APPROVAL", expiresAt: new Date(Date.now() + 60_000).toISOString() });
    const hitl = (await store.listHitlRequests(auth)).find(h => h.runId === run.id)!;
    return { run, hitl };
  }
  const decide = (id: string, body: any, token = tokenA) => request(app).post(`/api/v1/hitl/${id}/decision`).set("Authorization", `Bearer ${token}`).send(body);

  it("Test F: approvals are durable, authorised, idempotent and stale-safe", async () => {
    const { run, hitl } = await pausedRun(authA);
    expect(hitl.workflowStepId).toBe("approve_step_3_click");
    expect(hitl.workflowVersionId).toBe("wv-paused");

    expect((await decide(hitl.id, { action: "APPROVE" }, viewerA)).status).toBe(403);
    expect((await decide(hitl.id, { action: "APPROVE" }, tokenB)).status).toBe(404);
    const stale = await decide(hitl.id, { action: "APPROVE", workflow_version_id: "wv-other" });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("STALE_DECISION");

    // A paused run cannot be resumed past a pending decision.
    const resume = await request(app).post(`/api/v1/runs/${run.id}/resume`).set("Authorization", `Bearer ${tokenA}`);
    expect(resume.status).toBe(409);
    expect(resume.body.error.code).toBe("DECISION_REQUIRED");

    const approved = await decide(hitl.id, { action: "APPROVE", note: "Checked the order" });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe("APPLIED");
    expect(approved.body.run.state).toBe("RESUMING");

    const duplicate = await decide(hitl.id, { action: "APPROVE", note: "Checked the order" });
    expect(duplicate.body.status).toBe("DUPLICATE");
    const conflicting = await decide(hitl.id, { action: "REJECT" });
    expect(conflicting.status).toBe(409);

    const stored = (await store.listHitlRequests(authA)).find(h => h.id === hitl.id)!;
    expect(stored.decision).toBe("APPROVE");
    expect(stored.decidedBy).toBe("user-a");
    const audits = await store.listAudits(authA);
    const audit = audits.find(a => a.action === "HITL_DECISION" && a.resourceId === run.id);
    expect(audit?.metadata).toMatchObject({ decision: "APPROVE", step_id: "approve_step_3_click", resulting_state: "RESUMING", workflow_version_id: "wv-paused" });
  });

  it("Test F: rejection stops the run; expiry times it out; cancellation and illegal transitions are enforced", async () => {
    const { run, hitl } = await pausedRun(authA);
    const rejected = await decide(hitl.id, { action: "REJECT", note: "Wrong customer" });
    expect(rejected.status).toBe(200);
    expect(rejected.body.run.state).toBe("CANCELLED");
    expect((await store.getRun(authA, run.id))?.resultSummary).toMatchObject({ outcome: "REJECTED_BY_HUMAN" });
    expect((await decide(hitl.id, { action: "APPROVE" })).status).toBe(409);

    const expiredRun = await store.createRun(authA, "wv-x");
    await store.updateRunState(authA, expiredRun.id, "RUNNING");
    await store.updateRunState(authA, expiredRun.id, "WAITING_FOR_HUMAN");
    await store.createHitlRequest(authA, { runId: expiredRun.id, workflowStepId: "s", challengeType: "MANUAL_APPROVAL", expiresAt: new Date(Date.now() - 1000).toISOString() });
    const expiredHitl = (await store.listHitlRequests(authA)).find(h => h.runId === expiredRun.id)!;
    expect((await decide(expiredHitl.id, { action: "APPROVE" })).status).toBe(410);
    expect((await store.getRun(authA, expiredRun.id))?.state).toBe("TIMED_OUT");

    // A paused run cannot be marked successful without resuming.
    const p2 = await pausedRun(authA, "s2");
    expect(await store.updateRunState(authA, p2.run.id, "SUCCEEDED")).toBeUndefined();

    const cancel = await request(app).post(`/api/v1/runs/${p2.run.id}/cancel`).set("Authorization", `Bearer ${tokenA}`);
    expect(cancel.status).toBe(202);
    expect((await store.getRun(authA, p2.run.id))?.state).toBe("CANCELLED");
    expect((await decide(p2.hitl.id, { action: "APPROVE" })).status).toBe(409);
    const again = await request(app).post(`/api/v1/runs/${p2.run.id}/cancel`).set("Authorization", `Bearer ${tokenA}`);
    expect(again.status).toBe(409);
  });

  // ===========================================================================================
  it("Test H: concurrent jobs and decisions stay isolated", async () => {
    const vA = new ScriptedVision("Request a restock of 40 units for SKU-7");
    const vB = new ScriptedVision("Approve leave request LR-19");
    const [rA, rB] = await Promise.all([
      compile(restockDemo(), vA, "Request a restock of 40 units for SKU-7", "job_h_a", path.join(tmpRoot, "h_a")),
      compile(leaveDemo(), vB, "Approve leave request LR-19", "job_h_b", path.join(tmpRoot, "h_b"))
    ]);
    expect(rA.status).toBe("COMPLETED");
    expect(rB.status).toBe("COMPLETED");
    const seenByA = JSON.stringify(vA.packets.map(p => p.episodes.map(e => e.action.targetText)));
    const seenByB = JSON.stringify(vB.packets.map(p => p.episodes.map(e => e.action.targetText)));
    expect(seenByA).not.toMatch(/LR-19|globex/);
    expect(seenByB).not.toMatch(/SKU-7|acme/);
    expect(JSON.stringify(rA.workflow)).not.toMatch(/globex|LR-19/);
    expect(JSON.stringify(rB.workflow)).not.toMatch(/acme|SKU-7/);
    expect(fs.readdirSync(path.join(tmpRoot, "h_a")).length).toBeGreaterThan(0);

    // Two simultaneous decisions on one request: exactly one is applied.
    const { hitl } = await pausedRun(authA, "conc");
    const [d1, d2] = await Promise.all([decide(hitl.id, { action: "APPROVE" }), decide(hitl.id, { action: "REJECT" })]);
    const outcomes = [d1, d2].map(d => d.body.status || d.body.error?.code).sort();
    expect(outcomes).toEqual(["APPLIED", "STALE_DECISION"]);

    // Tenant B cannot see or decide tenant A's requests.
    const listB = await request(app).get("/api/v1/hitl").set("Authorization", `Bearer ${tokenB}`);
    expect(listB.body.hitl_requests.find((h: any) => h.id === hitl.id)).toBeUndefined();
  });
});
