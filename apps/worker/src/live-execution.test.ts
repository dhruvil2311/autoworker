/**
 * LIVE execution tests (Tests C, E, F, G): a real headless Chromium driven by the production
 * V2BrowserExecutor and WorkflowRuntime against a local order-management test application.
 *
 * Mocked: only the vision model. Its answers come from the synthetic evidence below, and the
 * workflow is produced by the real pipeline (grounding, BPI, compiler, readiness). Outcomes are
 * checked independently against the test application's own server-side state.
 * Not covered here: a third-party production application, Browserbase cloud sessions, Supabase.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import { chromium } from "playwright";
import { WorkflowRuntime, ExecutionPlanner, HumanExecutor, type ExecutionPersistence, type RuntimeContextState } from "@ghost/runtime";
import { assessExecutionReadiness, type WorkflowV2 } from "@ghost/workflow-schema";
import { V2BrowserExecutor } from "./executors-v2.js";
import { BrowserbaseExecutionProvider } from "./browserbase.js";
import { OutputExecutor } from "./output-executor.js";
import { classifyOutcome } from "./worker.js";
import { EvidenceToWorkflowPipeline } from "../../api/dist/services/evidence/evidence-pipeline.js";
import { loadConfig } from "../../api/dist/config.js";

const tempDirs: string[] = [];
const APP_HOST = "orders.acme.test";
const OTHER_HOST = "elsewhere.example.test";

// ---------------------------------------------------------------------------------------------
// Local test application with server-side state
// ---------------------------------------------------------------------------------------------
const db = { orders: new Map<string, { status: string; note: string }>(), saves: 0, deletes: 0 };
function resetDb() {
  db.orders = new Map([["42", { status: "Pending", note: "" }], ["43", { status: "Pending", note: "" }]]);
  db.saves = 0;
  db.deletes = 0;
}
let port = 0;
const page = (body: string) => `<!doctype html><html><head><title>Acme Orders</title></head><body>${body}</body></html>`;
const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const send = (html: string, status = 200) => { res.writeHead(status, { "Content-Type": "text/html" }); res.end(html); };
  if (req.method === "POST" && url.pathname.startsWith("/api/orders/")) {
    let body = "";
    req.on("data", c => (body += c));
    req.on("end", () => {
      const id = url.pathname.split("/").pop()!;
      const { status, note } = JSON.parse(body || "{}");
      db.orders.set(id, { status, note });
      db.saves++;
      res.writeHead(204).end();
    });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/delete") { db.deletes++; res.writeHead(204).end(); return; }
  if (url.pathname === "/orders") return send(page(`<h1>Orders</h1><ul><li><a href="/orders/42">Order 42</a></li><li><a href="/orders/43">Order 43</a></li></ul>`));
  const m = url.pathname.match(/^\/orders\/(\d+)$/);
  if (m) {
    const order = db.orders.get(m[1]!);
    const saved = url.searchParams.get("saved") === "1";
    return send(page(`<h1>Order ${m[1]}</h1>
      ${saved ? `<p role="status">Order ${m[1]} has been updated</p>` : ""}
      <p>Current status: ${order?.status}</p>
      <label for="status">Status</label><select id="status"><option>Pending</option><option>Shipped</option><option>Cancelled</option></select>
      <label for="note">Note</label><input id="note" />
      <button id="save">Save order</button>
      <script>
        document.getElementById("save").onclick = async () => {
          await fetch("/api/orders/${m[1]}", { method: "POST", body: JSON.stringify({ status: document.getElementById("status").value, note: document.getElementById("note").value }) });
          location.href = "/orders/${m[1]}?saved=1";
        };
      </script>`));
  }
  if (url.pathname === "/dup") return send(page(`<button onclick="fetch('/api/delete',{method:'POST'})">Delete</button><button onclick="fetch('/api/delete',{method:'POST'})">Delete</button>`));
  if (url.pathname === "/slow") return send(page(`<div id="c"></div><script>setTimeout(() => { const b = document.createElement("button"); b.textContent = "Load details"; b.onclick = () => document.title = "loaded"; document.getElementById("c").appendChild(b); }, 1500);</script>`));
  if (url.pathname === "/go-elsewhere") { res.writeHead(302, { Location: `http://${OTHER_HOST}:${port}/landing` }).end(); return; }
  if (url.pathname === "/landing") return send(page(`<h1>Somewhere else</h1>`));
  send(page("not found"), 404);
});

/** Local Chromium that resolves the test hostnames to this machine. */
class LocalTestProvider extends BrowserbaseExecutionProvider {
  constructor() { super({ browserbaseApiKey: "local" } as any); }
  override async connectBrowser(): Promise<any> {
    return chromium.launch({ headless: true, args: [`--host-resolver-rules=MAP ${APP_HOST} 127.0.0.1, MAP ${OTHER_HOST} 127.0.0.1`] });
  }
}

class MemoryPersistence implements ExecutionPersistence {
  stepStates = new Map<string, string>();
  runStates: string[] = [];
  hitl: Array<{ stepId: string; reason: string }> = [];
  checkpoint: { cursor: string; contextState: RuntimeContextState; iterationPath: number[] } | null = null;
  terminalState?: string;
  async recordStepStarted(id: string) { this.stepStates.set(id, "RUNNING"); }
  async recordStepCompleted(id: string, state: string) { this.stepStates.set(id, state); }
  async recordRunState(state: string) { this.runStates.push(state); if (state === "SUCCEEDED" || state === "FAILED") this.terminalState = state; }
  async recordHitlPause(stepId: string, reason: string) { this.hitl.push({ stepId, reason }); }
  async saveCheckpoint(cursor: string, contextState: RuntimeContextState, iterationPath: number[]) {
    this.checkpoint = { cursor, contextState: JSON.parse(JSON.stringify(contextState)), iterationPath };
  }
  async loadCheckpoint() { return this.checkpoint; }
  async hasStepCompleted(id: string) { return this.stepStates.get(id) === "SUCCEEDED"; }
  async getStepState(id: string) { return this.stepStates.get(id); }
}

const ctx = (inputs: Record<string, unknown> = {}): RuntimeContextState => ({
  inputs, variables: {}, outputs: {}, artifacts: {}, scopes: [], executionMetadata: { runId: "live-run", tenantId: "t", workflowVersionId: "wv-live" }
});

function leaves(step: any, out: any[] = []): any[] {
  if (step.children?.length) step.children.forEach((c: any) => leaves(c, out)); else out.push(step);
  return out;
}

/** Builds the workflow through the real pipeline from synthetic evidence of the demonstration. */
async function compileOrderWorkflow(): Promise<WorkflowV2> {
  const base = `http://${APP_HOST}:${port}`;
  const steps = [
    { t: 0.5, type: "NAVIGATE", action: "NAVIGATE", target: `${base}/orders` },
    { t: 2, type: "CLICK", action: "CLICK", target: "Order 42" },
    { t: 3, type: "SELECT", action: "SELECT", target: "Status", value: "Shipped" },
    { t: 4, type: "TYPE", action: "TYPE", target: "Note", value: "Dispatched via courier" },
    { t: 5, type: "CLICK", action: "CLICK", target: "Save order" }
  ];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aw-live-"));
  tempDirs.push(dir);
  const rawFrames = Array.from({ length: 8 }, (_, i) => {
    const filePath = path.join(dir, `frame_${i}.jpg`);
    fs.writeFileSync(filePath, randomBytes(1024));
    return { frameId: `frame_${i}`, timestamp: i, filePath };
  });
  const ocrFacts = [
    ...steps.map(s => ({ text: s.target, timestamp: s.t })),
    { text: "Order 42 has been updated", timestamp: 7 },
    { text: `${APP_HOST}:${port}/orders/42?saved=1`, timestamp: 7 }
  ];
  const rawObservations = steps.map((s, i) => ({
    id: `o${i}`, timestamp: s.t, type: s.type, application: "Browser", targetText: s.target,
    ...(s.value ? { value: s.value } : {}), isClickTarget: s.type === "CLICK", isTextMutation: s.type !== "CLICK" && s.type !== "NAVIGATE", confidence: 0.95
  }));
  const understanding = { taskIntent: "Mark order 42 as shipped with a dispatch note", applicationEnvironment: "Web Browser", processStructure: { type: "LINEAR" as const, stepIndices: [] }, variables: [], businessRules: [], expectedOutcomes: [], exceptions: [], confidence: 0.9 };
  // MOCK vision model: reports each episode's action as shown in the evidence.
  const vision = {
    async extractSemanticActions(packet: any) {
      return {
        semanticActions: packet.episodes.map((ep: any) => {
          const s = steps.find(x => x.target === ep.action.targetText)!;
          return {
            action: s.action,
            arguments: s.action === "NAVIGATE" ? { url: s.target } : { target: s.target, ...(s.value ? { value: s.value } : {}) },
            application: "Browser", evidenceEpisodeIds: [ep.episodeId], confidence: 0.9, evidenceStatus: "OBSERVED"
          };
        }),
        discardedNoise: [], unresolved: [], processUnderstanding: understanding
      };
    },
    async compileProcessUnderstanding() { return understanding; }
  };
  const config = loadConfig({ NODE_ENV: "test", STORAGE_PROVIDER: "memory", ALLOW_MEMORY_STORAGE: "true" });
  const result = await new EvidenceToWorkflowPipeline(config, vision as any).executePipeline({
    jobId: "job_live_orders", mediaPath: path.join(dir, "demo.webm"), tenantId: "t", workerId: "w",
    taskObjective: "Mark order 42 as shipped with a dispatch note", activeApplication: "Browser",
    rawFrames, rawObservations: rawObservations as any, ocrFacts
  });
  if (!result.workflow) throw new Error(`Compilation failed: ${result.status} ${result.message} ${JSON.stringify(result.grounding?.issues)}`);
  return result.workflow as WorkflowV2;
}

function handWorkflow(children: any[]): WorkflowV2 {
  return {
    workflow_version: "2.0", name: "probe", description: "Probe the live application", status: "ACTIVE", variables: [], secrets: [],
    expected_domains: [APP_HOST], compiler: { version: "test", source_specification_id: "s", compiled_at: "" },
    root_step: { id: "root", operation: "SEQUENCE", target: "DATA", description: "root", children }
  } as any;
}

async function run(workflow: WorkflowV2, executor: V2BrowserExecutor, persistence: MemoryPersistence, inputs: Record<string, unknown> = {}) {
  const plan = new ExecutionPlanner().createPlan("wv-live", workflow);
  const runtime = new WorkflowRuntime(plan, persistence, [new HumanExecutor(), new OutputExecutor(), executor], ctx(inputs));
  await runtime.start();
  return runtime;
}

describe("LIVE browser execution against a local test application", () => {
  beforeAll(async () => {
    process.env.WORKER_SLOW_MO = "0";
    await new Promise<void>(r => server.listen(0, "127.0.0.1", () => r()));
    port = (server.address() as any).port;
  });
  afterAll(async () => {
    await new Promise(r => server.close(() => r(undefined)));
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
  });

  it("Tests C/F/G: executes the compiled workflow, pauses before saving, resumes on approval, and verifies the real outcome", async () => {
    resetDb();
    const workflow = await compileOrderWorkflow();
    expect(assessExecutionReadiness(workflow).executable).toBe(true);
    const nav = leaves(workflow.root_step).find(s => s.operation === "NAVIGATE");
    expect(nav.args.url).toBe(`http://${APP_HOST}:${port}/orders`);
    expect(workflow.success_criteria?.map(c => c.value)).toContain("Order 42 has been updated");

    const persistence = new MemoryPersistence();
    const executor = new V2BrowserExecutor(new LocalTestProvider(), undefined, undefined);
    try {
      await run(workflow, executor, persistence);
      expect(persistence.runStates.at(-1)).toBe("WAITING_FOR_HUMAN");
      expect(persistence.hitl[0]?.reason).toBe("MANUAL_APPROVAL");
      expect(db.saves).toBe(0); // nothing committed before approval

      const gate = persistence.hitl[0]!.stepId;
      const resumed = await run(workflow, executor, persistence, { [`hitl_response_${gate}`]: { action: "APPROVE" } });
      expect(persistence.terminalState).toBe("SUCCEEDED");

      const state = resumed.getContext().getState();
      const outcome = classifyOutcome({
        runtimeState: persistence.terminalState,
        workflow,
        outputs: { ...state.variables, ...state.outputs },
        stepStates: [...persistence.stepStates].map(([stepId, s]) => ({ stepId, state: s }))
      });
      expect(outcome.classification).toBe("VERIFIED_SUCCESS");

      // Independent check against the application's own state: changed exactly once, as demonstrated.
      expect(db.saves).toBe(1);
      expect(db.orders.get("42")).toEqual({ status: "Shipped", note: "Dispatched via courier" });
      expect(db.orders.get("43")).toEqual({ status: "Pending", note: "" });
    } finally {
      await executor.cleanup();
    }
  }, 90_000);

  it("Test G: reports FAILED when the application does not reach the expected state", async () => {
    resetDb();
    const persistence = new MemoryPersistence();
    const executor = new V2BrowserExecutor(new LocalTestProvider());
    const workflow = handWorkflow([
      { id: "n", operation: "NAVIGATE", target: "BROWSER_DETERMINISTIC", description: "Open order 43", args: { url: `http://${APP_HOST}:${port}/orders/43` } },
      { id: "v", operation: "VERIFY", target: "BROWSER_DETERMINISTIC", description: "Order saved", args: { criteria: [{ id: "c1", type: "TEXT_VISIBLE", value: "Order 43 has been updated" }] } }
    ]);
    (workflow as any).success_criteria = [{ id: "c1", type: "TEXT_VISIBLE", value: "Order 43 has been updated", source: "USER_OBJECTIVE", evidenceFrameIds: [] }];
    try {
      const runtime = await run(workflow, executor, persistence);
      const state = runtime.getContext().getState();
      const outcome = classifyOutcome({ runtimeState: persistence.terminalState, workflow, outputs: { ...state.variables, ...state.outputs }, stepStates: [] });
      expect(persistence.terminalState).toBe("FAILED");
      expect(outcome.classification).toBe("FAILED");
      expect(state.variables.outcome_verification?.checks?.[0]?.passed).toBe(false);
    } finally {
      await executor.cleanup();
    }
  }, 60_000);

  it("Test E: a missing or ambiguous target pauses without acting on anything else", async () => {
    resetDb();
    const executor = new V2BrowserExecutor(new LocalTestProvider());
    try {
      const missing = new MemoryPersistence();
      await run(handWorkflow([
        { id: "n", operation: "NAVIGATE", target: "BROWSER_DETERMINISTIC", description: "Open orders", args: { url: `http://${APP_HOST}:${port}/orders` } },
        { id: "c", operation: "CLICK", target: "BROWSER_DETERMINISTIC", description: "Open order 99", args: { target: { text: "Order 99" } } }
      ]), executor, missing);
      expect(missing.hitl.map(h => h.reason)).toEqual(["TARGET_NOT_RESOLVED"]);
      expect(missing.stepStates.get("c")).toBe("PAUSED_FOR_HUMAN");

      const ambiguous = new MemoryPersistence();
      const ex2 = new V2BrowserExecutor(new LocalTestProvider());
      try {
        await run(handWorkflow([
          { id: "n", operation: "NAVIGATE", target: "BROWSER_DETERMINISTIC", description: "Open list", args: { url: `http://${APP_HOST}:${port}/dup` } },
          { id: "d", operation: "CLICK", target: "BROWSER_DETERMINISTIC", description: "Delete", args: { target: { text: "Delete" } } }
        ]), ex2, ambiguous);
        expect(ambiguous.hitl.map(h => h.reason)).toEqual(["TARGET_AMBIGUOUS"]);
        expect(db.deletes).toBe(0);
      } finally {
        await ex2.cleanup();
      }
    } finally {
      await executor.cleanup();
    }
  }, 90_000);

  it("Test E: waits for a slow-rendering control, and pauses on a redirect to another site", async () => {
    const slow = new MemoryPersistence();
    const ex1 = new V2BrowserExecutor(new LocalTestProvider());
    try {
      await run(handWorkflow([
        { id: "n", operation: "NAVIGATE", target: "BROWSER_DETERMINISTIC", description: "Open", args: { url: `http://${APP_HOST}:${port}/slow` } },
        { id: "c", operation: "CLICK", target: "BROWSER_DETERMINISTIC", description: "Load details", args: { target: { text: "Load details" } } }
      ]), ex1, slow);
      expect(slow.stepStates.get("c")).toBe("SUCCEEDED");
    } finally {
      await ex1.cleanup();
    }

    const redirected = new MemoryPersistence();
    const ex2 = new V2BrowserExecutor(new LocalTestProvider());
    try {
      await run(handWorkflow([
        { id: "n", operation: "NAVIGATE", target: "BROWSER_DETERMINISTIC", description: "Open", args: { url: `http://${APP_HOST}:${port}/go-elsewhere` } },
        { id: "c", operation: "CLICK", target: "BROWSER_DETERMINISTIC", description: "Anything", args: { target: { text: "Somewhere else" } } }
      ]), ex2, redirected);
      expect(redirected.hitl.map(h => h.reason)).toEqual(["UNEXPECTED_REDIRECT"]);
      expect(redirected.stepStates.get("c")).toBeUndefined();
    } finally {
      await ex2.cleanup();
    }
  }, 90_000);

  it("Test F: resuming without the paused browser session pauses instead of acting on a blank page", async () => {
    const executor = new V2BrowserExecutor(new LocalTestProvider());
    const persistence = new MemoryPersistence();
    const plan = new ExecutionPlanner().createPlan("wv-live", handWorkflow([
      { id: "c", operation: "CLICK", target: "BROWSER_DETERMINISTIC", description: "Save order", args: { target: { text: "Save order" } } }
    ]));
    const state = ctx();
    state.browser_context = { currentUrl: `http://${APP_HOST}:${port}/orders/42` };
    await new WorkflowRuntime(plan, persistence, [executor], state).start();
    expect(persistence.hitl.map(h => h.reason)).toEqual(["RESUME_CONTEXT_LOST"]);
    expect(db.saves).toBe(0);
  }, 30_000);
});
