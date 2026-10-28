/**
 * End-to-end verification of the five role-specific experiences through the real frontend and
 * backend, with genuine screenshots written to docs/verification/screenshots.
 *
 * What is real: the production web build (apps/web/dist) in headless Chromium; the Express API with
 * all middleware and permission checks; the Python evidence engine analysing a real recording;
 * the worker runtime and browser executor (imported in-process) driving a second Chromium against a
 * local order-management test application whose own server state is checked independently.
 *
 * What is not real: storage is the InMemoryStore (no Supabase); no model provider key is configured
 * (compilation of the uploaded recording uses local analysis only); the executable "Ship orders"
 * workflow is produced by the real evidence pipeline from synthetic evidence with a scripted model.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { createApp } from "../../api/dist/app.js";
import { InMemoryStore } from "../../api/dist/store.js";
import { loadConfig } from "../../api/dist/config.js";
import { EvidenceToWorkflowPipeline } from "../../api/dist/services/evidence/evidence-pipeline.js";
import { BrowserbaseExecutionProvider } from "./browserbase.js";
import { runQueuedWorkflow } from "./worker.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SHOTS = path.join(ROOT, "docs/verification/screenshots");
const WEB_DIST = path.join(ROOT, "apps/web/dist");
const VIDEO = path.join(ROOT, "saucedemo_demonstration.webm");
// The in-memory bootstrap assigns this organization to every development session.
const TENANT = "6ef50df4-58bb-48e3-9796-d25ba85d4dac";
const APP_HOST = "orders.acme.test";

const users = {
  owner: { id: "u-owner", role: "owner" },
  builder: { id: "u-builder", role: "builder" },
  member: { id: "u-member", role: "member" },
  operator: { id: "u-operator", role: "operator" },
  auditor: { id: "u-auditor", role: "auditor" },
  temp: { id: "u-temp", role: "member" }
} as const;
type UserKey = keyof typeof users;
const tokenFor = (u: UserKey) => `dev:${users[u].id}:${TENANT}:${users[u].role}`;

// ── Local order-management application (the system under automation) ──────────────────────────
const db = { orders: new Map<string, { status: string; note: string }>(), saves: 0 };
db.orders.set("42", { status: "Pending", note: "" });
const html = (body: string) => `<!doctype html><html><head><title>Acme Orders</title></head><body>${body}</body></html>`;
const ordersApp = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const send = (b: string) => { res.writeHead(200, { "Content-Type": "text/html" }); res.end(b); };
  if (req.method === "POST" && url.pathname.startsWith("/api/orders/")) {
    let body = "";
    req.on("data", c => (body += c));
    req.on("end", () => { const { status, note } = JSON.parse(body || "{}"); db.orders.set(url.pathname.split("/").pop()!, { status, note }); db.saves++; res.writeHead(204).end(); });
    return;
  }
  if (url.pathname === "/orders") return send(html(`<h1>Orders</h1><a href="/orders/42">Order 42</a>`));
  const m = url.pathname.match(/^\/orders\/(\d+)$/);
  if (m) {
    return send(html(`<h1>Order ${m[1]}</h1>${url.searchParams.get("saved") ? `<p role="status">Order ${m[1]} has been updated</p>` : ""}
      <label for="status">Status</label><select id="status"><option>Pending</option><option>Shipped</option></select>
      <label for="note">Note</label><input id="note" /><button id="save">Save order</button>
      <script>document.getElementById("save").onclick = async () => {
        await fetch("/api/orders/${m[1]}", { method: "POST", body: JSON.stringify({ status: document.getElementById("status").value, note: document.getElementById("note").value }) });
        location.href = "/orders/${m[1]}?saved=1"; };</script>`));
  }
  res.writeHead(404).end();
});

class LocalTestProvider extends BrowserbaseExecutionProvider {
  constructor() { super({ browserbaseApiKey: "local" } as any); }
  override async connectBrowser(): Promise<any> {
    return chromium.launch({ headless: true, args: [`--host-resolver-rules=MAP ${APP_HOST} 127.0.0.1`] });
  }
}

// ── Harness state ───────────────────────────────────────────────────────────────────────────────
let store: InstanceType<typeof InMemoryStore>;
let apiUrl = "", webUrl = "", appPort = 0;
const servers: http.Server[] = [];
const executions = new Set<Promise<unknown>>();
let browser: Browser;
const tempDirs: string[] = [];
const ids: Record<string, string> = {};

function listen(server: http.Server): Promise<number> {
  servers.push(server);
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve((server.address() as any).port)));
}

/** Serves the production web build with single-page-app fallback. */
function staticWeb(): http.Server {
  return http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url || "/", "http://x").pathname);
    let file = path.join(WEB_DIST, pathname);
    if (!file.startsWith(WEB_DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(WEB_DIST, "index.html");
    const type = file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : file.endsWith(".svg") ? "image/svg+xml" : "text/html";
    res.writeHead(200, { "Content-Type": type });
    fs.createReadStream(file).pipe(res);
  });
}

/** Stands in for the worker daemon's trigger endpoint and runs the real worker code in this process. */
function triggerServer(): http.Server {
  return http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true, activeRuns: executions.size }));
    }
    const m = req.url?.match(/^\/trigger\/(.+)$/);
    if (req.method === "POST" && m) {
      const runId = m[1]!;
      res.writeHead(202).end();
      const run = (store as any).runs.get(runId);
      const exec = runQueuedWorkflow(runId, {
        store: store as any,
        owner: { tenantId: run.tenantId, userId: run.createdBy || users.owner.id },
        browserProvider: new LocalTestProvider()
      }).catch(err => console.error("worker run failed", runId, err)).finally(() => executions.delete(exec));
      executions.add(exec);
      return;
    }
    res.writeHead(404).end();
  });
}

async function openAs(user: UserKey): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(({ api, token }) => {
    localStorage.setItem("ghost_api_url", api);
    localStorage.setItem("ghost_api_token", token);
  }, { api: apiUrl, token: tokenFor(user) });
  return { ctx, page: await ctx.newPage() };
}

/** Fails if the UI is not signed in as the intended role (guards against identity drift). */
async function expectRole(page: Page, user: UserKey) {
  await page.locator(".pf-role").waitFor();
  expect((await page.locator(".pf-role").innerText()).toLowerCase()).toBe(users[user].role);
}

async function api(user: UserKey, method: string, url: string, body?: unknown) {
  const res = await fetch(`${apiUrl}${url}`, {
    method,
    headers: { authorization: `Bearer ${tokenFor(user)}`, "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  return { status: res.status, body: await res.json().catch(() => null) as any };
}

const shot = (page: Page, name: string) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });

async function waitForRunState(runId: string, predicate: (state: string) => boolean, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const run = (store as any).runs.get(runId);
    if (run && predicate(run.state)) return run;
    if (Date.now() > deadline) throw new Error(`Run ${runId} did not reach the expected state; last state ${run?.state}`);
    await new Promise(r => setTimeout(r, 500));
  }
}

/** Real evidence pipeline (grounding, BPI, compiler) on synthetic evidence; only the model is scripted. */
async function compileShipOrders(workerId: string) {
  const base = `http://${APP_HOST}:${appPort}`;
  const steps = [
    { t: 0.5, type: "NAVIGATE", target: `${base}/orders` },
    { t: 2, type: "CLICK", target: "Order 42" },
    { t: 3, type: "SELECT", target: "Status", value: "Shipped" },
    { t: 4, type: "TYPE", target: "Note", value: "Dispatched via courier" },
    { t: 5, type: "CLICK", target: "Save order" }
  ];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aw-e2e-frames-"));
  tempDirs.push(dir);
  const rawFrames = Array.from({ length: 8 }, (_, i) => { const f = path.join(dir, `f${i}.jpg`); fs.writeFileSync(f, randomBytes(1024)); return { frameId: `frame_${i}`, timestamp: i, filePath: f }; });
  const ocrFacts = [...steps.map(s => ({ text: s.target, timestamp: s.t })), { text: "Order 42 has been updated", timestamp: 7 }];
  const rawObservations = steps.map((s, i) => ({ id: `o${i}`, timestamp: s.t, type: s.type, application: "Browser", targetText: s.target, ...(s.value ? { value: s.value } : {}), isClickTarget: s.type === "CLICK", isTextMutation: s.type === "TYPE" || s.type === "SELECT", confidence: 0.95 }));
  const understanding = { taskIntent: "Mark order 42 as shipped with a dispatch note", applicationEnvironment: "Web Browser", processStructure: { type: "LINEAR", stepIndices: [] }, variables: [], businessRules: [], expectedOutcomes: [], exceptions: [], confidence: 0.9 };
  const scriptedModel = {
    async extractSemanticActions(packet: any) {
      return {
        semanticActions: packet.episodes.map((ep: any) => {
          const s = steps.find(x => x.target === ep.action.targetText)!;
          return { action: s.type, arguments: s.type === "NAVIGATE" ? { url: s.target } : { target: s.target, ...(s.value ? { value: s.value } : {}) }, application: "Browser", evidenceEpisodeIds: [ep.episodeId], confidence: 0.9, evidenceStatus: "OBSERVED" };
        }),
        discardedNoise: [], unresolved: [], processUnderstanding: understanding
      };
    },
    async compileProcessUnderstanding() { return understanding; }
  };
  const result = await new EvidenceToWorkflowPipeline(loadConfig({ NODE_ENV: "test" }), scriptedModel as any).executePipeline({
    jobId: "job_e2e_ship_orders", mediaPath: path.join(dir, "demo.webm"), tenantId: TENANT, workerId,
    taskObjective: "Mark order 42 as shipped with a dispatch note", activeApplication: "Browser", rawFrames, rawObservations: rawObservations as any, ocrFacts
  });
  if (!result.workflow) throw new Error(`fixture compile failed: ${result.message}`);
  const wf: any = result.workflow;
  wf.compiler.worker_id = workerId;
  const auth = { tenantId: TENANT, userId: users.builder.id, role: "builder" as const };
  const version = await store.createWorkflowVersion(auth, wf);
  await store.updateGhostWorker(auth, workerId, { activeVersionId: version.id, workflowId: version.workflowId, status: "READY_FOR_REVIEW" } as any);
  return version.id;
}

// Opt-in: needs a current production build of apps/web. Run with `npm run test:e2e:platform -w apps/worker`.
describe.skipIf(!process.env.PLATFORM_E2E)("Platform end-to-end (real UI, real API, real worker)", () => {
  beforeAll(async () => {
    fs.mkdirSync(SHOTS, { recursive: true });
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "aw-e2e-work-"));
    tempDirs.push(work);
    process.chdir(work); // evidence storage and analysis output stay out of the repository
    process.env.WORKER_SLOW_MO = "0";
    appPort = await listen(ordersApp);
    process.env.WORKER_TRIGGER_URL = `http://127.0.0.1:${await listen(triggerServer())}`;
    store = new InMemoryStore();
    const app = createApp(loadConfig({ NODE_ENV: "test", STORAGE_PROVIDER: "memory", ALLOW_MEMORY_STORAGE: "true", ALLOW_DEV_AUTH: "true", OPENROUTER_API_KEY: "" }), store as any);
    apiUrl = `http://127.0.0.1:${await listen(http.createServer(app))}`;
    webUrl = `http://127.0.0.1:${await listen(staticWeb())}`;
    browser = await chromium.launch({ headless: true });
  }, 60_000);

  afterAll(async () => {
    await Promise.allSettled([...executions]);
    await browser?.close();
    for (const s of servers) s.close();
    process.chdir(ROOT);
    // Analysis output may still be held briefly by the engine on Windows; leftovers live in the temp directory.
    for (const d of tempDirs) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 }); } catch { /* best effort */ } }
  }, 60_000);

  it("Automation Studio: upload a real recording, inspect real evidence, refuse an ungrounded compile, publish an executable version", async () => {
    const { ctx, page } = await openAs("builder");
    await page.goto(`${webUrl}/app/studio`);
    await page.getByRole("heading", { name: "Recordings" }).waitFor();
    await expectRole(page, "builder");
    await page.getByLabel("Name").fill("SauceDemo checkout (recording)");
    await page.getByLabel("Purpose").fill("Built from the uploaded SauceDemo demonstration video");
    await page.getByRole("button", { name: "Create" }).click();
    await page.getByRole("link", { name: "SauceDemo checkout (recording)" }).click();

    await page.setInputFiles("#rec-file", VIDEO);
    await page.getByText("COMPLETED").first().waitFor({ timeout: 240_000 });
    await page.getByText(/Extracted frames \(\d+\)/).waitFor();
    // Frames are fetched with the session token; wait until they have actually loaded.
    const frameResponses: string[] = [];
    page.on("response", r => { if (r.url().includes("/frames/")) frameResponses.push(`${r.status()} ${r.request().method()} ${r.url().split("/evidence/")[1]}`); });
    page.on("console", m => { if (m.type() === "error") frameResponses.push(`console: ${m.text().slice(0, 200)}`); });
    await page.reload();
    await page.getByText(/Extracted frames \(\d+\)/).waitFor({ timeout: 60_000 });
    try {
      await page.locator(".pf-thumbs img").first().waitFor({ timeout: 30_000 });
    } catch (err) {
      await shot(page, "debug-studio-frames");
      throw new Error(`Frames did not load. Responses: ${frameResponses.slice(0, 6).join(" | ") || "none"}`);
    }
    await page.waitForFunction(() => document.querySelectorAll(".pf-thumbs img").length >= Math.min(8, document.querySelectorAll(".pf-thumbs figure").length));
    expect(await page.locator(".pf-thumbs img").count()).toBeGreaterThan(0);
    await shot(page, "studio-1-recording-evidence");

    await page.getByLabel("Task objective (what the recording should accomplish)").fill("Sign in and check out one item");
    await page.getByRole("button", { name: "Compile workflow" }).click();
    const refusal = page.locator(".pf-alert", { hasText: /More information is needed|provider is unavailable|Compilation failed/ });
    await refusal.waitFor({ timeout: 240_000 });
    await refusal.locator("li").first().waitFor();
    await page.locator("table", { hasText: "Readiness" }).getByText(/blocking/).first().waitFor();
    await shot(page, "studio-2-compile-refused-truthfully");
    expect(await page.getByText("Workflow compiled and saved").count()).toBe(0);
    await ctx.close();

    // Executable workflow for the order application (pipeline output, scripted model) and publish through the UI.
    const worker = await store.createGhostWorker({ tenantId: TENANT, userId: users.builder.id, role: "builder" } as any, { name: "Ship orders", description: "Mark an order as shipped with a dispatch note" });
    ids.shipWorker = worker.id;
    ids.shipVersion = await compileShipOrders(worker.id);

    const b = await openAs("builder");
    await b.page.goto(`${webUrl}/app/studio/workers/${worker.id}?version=${ids.shipVersion}`);
    await b.page.getByRole("heading", { name: /Steps of version/ }).waitFor();
    await b.page.getByText("executable").first().waitFor();
    await shot(b.page, "studio-3-workflow-steps-and-readiness");
    await b.page.getByRole("button", { name: "Publish" }).click();
    await b.page.getByRole("dialog").getByRole("button", { name: "Publish" }).click();
    await b.page.getByText(/is now the published task version/).waitFor();
    await b.page.getByText("published", { exact: true }).first().waitFor();
    await shot(b.page, "studio-4-published");
    expect((await store.getGhostWorker({ tenantId: TENANT } as any, worker.id))?.publishedVersionId).toBe(ids.shipVersion);
    await b.ctx.close();
  }, 600_000);

  it("Business Workspace: run the published task, approve the save, and see a verified result", async () => {
    const { ctx, page } = await openAs("member");
    await page.goto(`${webUrl}/app/business`);
    await page.getByTestId("task-card").filter({ hasText: "Ship orders" }).waitFor();
    await expectRole(page, "member");
    await shot(page, "business-1-tasks");
    expect(await page.getByRole("link", { name: "Automation Studio" }).count()).toBe(0);
    expect(await page.getByRole("link", { name: "Operations" }).count()).toBe(0);

    await page.getByTestId("task-card").filter({ hasText: "Ship orders" }).getByRole("link", { name: "Open task" }).click();
    await page.getByRole("button", { name: "Run task" }).click();
    await page.waitForURL(/\/app\/business\/runs\//);
    ids.shipRun = page.url().split("/").pop()!;
    const run = (store as any).runs.get(ids.shipRun);
    expect(run.workflowVersionId).toBe(ids.shipVersion);

    await page.getByText("Needs your approval").first().waitFor({ timeout: 120_000 });
    expect(db.saves).toBe(0);
    await shot(page, "business-2-approval-requested");
    await page.getByRole("button", { name: "Approve and continue" }).click();
    await page.getByText("Completed and verified").first().waitFor({ timeout: 120_000 });
    await page.getByText(/Outcome verification/).waitFor();
    await shot(page, "business-3-verified-result");

    expect(db.saves).toBe(1);
    expect(db.orders.get("42")).toEqual({ status: "Shipped", note: "Dispatched via courier" });
    expect((store as any).runs.get(ids.shipRun).resultSummary.outcome.classification).toBe("VERIFIED_SUCCESS");

    await page.goto(`${webUrl}/app/ops`);
    await page.getByText("Not available for your role").waitFor();
    expect((await api("member", "GET", "/api/v1/ops/health")).status).toBe(403);
    await ctx.close();
  }, 300_000);

  it("Operations Console: diagnose a paused run, cancel it, retry it, and read live service health", async () => {
    // A published task whose demonstrated control no longer exists on the page.
    const auth = { tenantId: TENANT, userId: users.builder.id, role: "builder" as const };
    const worker = await store.createGhostWorker(auth as any, { name: "Open order 99" });
    const version = await store.createWorkflowVersion(auth as any, {
      workflow_version: "2.0", name: "Open order 99", description: "Open order 99 in the order list", status: "DRAFT", variables: [], secrets: [], expected_domains: [APP_HOST],
      compiler: { version: "e2e", source_specification_id: "e2e", compiled_at: new Date().toISOString(), worker_id: worker.id },
      root_step: { id: "root", operation: "SEQUENCE", target: "DATA", description: "root", children: [
        { id: "step_0_navigate", operation: "NAVIGATE", target: "BROWSER_DETERMINISTIC", description: "Open the order list", args: { url: `http://${APP_HOST}:${appPort}/orders` } },
        { id: "step_1_click", operation: "CLICK", target: "BROWSER_DETERMINISTIC", description: "Click \"Order 99\"", args: { target: { text: "Order 99" } } }
      ] }
    } as any);
    await store.updateGhostWorker(auth as any, worker.id, { activeVersionId: version.id } as any);
    expect((await api("builder", "POST", `/api/v1/workflows/${version.id}/publish`, { worker_id: worker.id })).status).toBe(200);
    const launched = await api("member", "POST", `/api/v1/tasks/${worker.id}/runs`, { workflow_version_id: version.id });
    expect(launched.status).toBe(202);
    const runId = launched.body.run.id;
    await waitForRunState(runId, s => s === "WAITING_FOR_HUMAN");

    const { ctx, page } = await openAs("operator");
    await page.goto(`${webUrl}/app/ops`);
    await page.getByRole("link", { name: runId.slice(0, 8) }).waitFor();
    await expectRole(page, "operator");
    await shot(page, "ops-1-live-runs");
    await page.getByRole("link", { name: runId.slice(0, 8) }).click();
    await page.locator("li.failing").waitFor();
    expect(await page.locator("li.failing").innerText()).toContain("Order 99");
    await shot(page, "ops-2-failing-step-diagnosis");

    await page.getByRole("button", { name: "Cancel run" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel run" }).click();
    await page.getByText("CANCELLED").first().waitFor();
    expect((store as any).runs.get(runId).state).toBe("CANCELLED");
    await page.getByRole("button", { name: "Retry as new run" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Start new run" }).click();
    await page.waitForURL(url => !url.toString().endsWith(runId));
    const retryId = page.url().split("/").pop()!;
    expect(retryId).not.toBe(runId);
    expect((store as any).runs.get(retryId).workflowVersionId).toBe(version.id);
    await shot(page, "ops-3-retried-as-new-run");
    await waitForRunState(retryId, s => s === "WAITING_FOR_HUMAN");
    expect((await api("operator", "POST", `/api/v1/runs/${retryId}/cancel`)).status).toBe(202);

    await page.goto(`${webUrl}/app/ops/health`);
    await page.getByTestId("health-Execution worker").getByText("ok").waitFor();
    await page.getByTestId("health-Database").getByText("ok").waitFor();
    await shot(page, "ops-4-service-health");
    await page.goto(`${webUrl}/app/ops/incidents`);
    await page.getByRole("heading", { name: "Incidents" }).waitFor();
    await shot(page, "ops-5-incidents");
    await ctx.close();
  }, 300_000);

  it("Organization Admin: change a member's role and a policy, both persisted; non-admins are refused", async () => {
    await api("temp", "GET", "/api/v1/me");
    const { ctx, page } = await openAs("owner");
    await page.goto(`${webUrl}/app/admin`);
    const select = page.getByLabel(`Role for ${users.temp.id}`);
    await select.waitFor();
    await expectRole(page, "owner");
    await select.selectOption("auditor");
    await page.getByRole("dialog").getByRole("button", { name: "Change role" }).click();
    await page.getByText("Role changed to auditor.").waitFor();
    await page.reload();
    await expect.poll(async () => page.getByLabel(`Role for ${users.temp.id}`).inputValue()).toBe("auditor");
    await shot(page, "admin-1-people-and-roles");

    await page.goto(`${webUrl}/app/admin/policies`);
    await page.getByLabel("Approval timeout (minutes)").fill("90");
    await page.getByRole("button", { name: "Save policies" }).click();
    await page.getByText("Policies saved.").waitFor();
    await page.reload();
    await expect.poll(async () => page.getByLabel("Approval timeout (minutes)").inputValue()).toBe("90");
    await shot(page, "admin-2-policies-persisted");
    await page.goto(`${webUrl}/app/admin/usage`);
    await page.getByText("Published tasks").waitFor();
    await shot(page, "admin-3-usage");
    await ctx.close();

    expect((await api("operator", "PATCH", "/api/v1/org/policies", { hitlTimeoutMinutes: 10 })).status).toBe(403);
    expect((await api("operator", "PATCH", `/api/v1/org/members/${users.temp.id}`, { role: "owner" })).status).toBe(403);
    const op = await openAs("operator");
    await op.page.goto(`${webUrl}/app/admin`);
    await op.page.getByText("Not available for your role").waitFor();
    await op.ctx.close();
  }, 180_000);

  it("Audit and Review: trace the run to its workflow version, decision and evidence; export history", async () => {
    const { ctx, page } = await openAs("auditor");
    await page.goto(`${webUrl}/app/audit`);
    await page.getByRole("link", { name: ids.shipRun!.slice(0, 8) }).waitFor();
    await expectRole(page, "auditor");
    await shot(page, "audit-1-execution-history");
    await page.getByRole("link", { name: ids.shipRun!.slice(0, 8) }).click();
    await page.getByTestId("audit-run-version").waitFor();
    expect(await page.getByTestId("audit-run-version").innerText()).toBe(ids.shipVersion);
    const decisions = page.locator("table", { hasText: "Decision" }).first();
    await decisions.getByText("APPROVE", { exact: true }).waitFor();
    await page.getByText(/Outcome verification/).waitFor();
    await shot(page, "audit-2-run-trace");

    await page.goto(`${webUrl}/app/audit/exports`);
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export CSV" }).click()]);
    const csv = fs.readFileSync(await download.path(), "utf8");
    expect(csv.split(/\r?\n/)[0]).toContain("workflow_version_id");
    expect(csv).toContain(ids.shipRun!);
    await page.getByText(/Exported \d+ run\(s\) as CSV/).waitFor();
    await shot(page, "audit-3-export");

    await page.goto(`${webUrl}/app/business`);
    await page.getByText("Not available for your role").waitFor();
    await ctx.close();
  }, 180_000);

  it("Shared state: the same run shows the same identity, version and result in three experiences", async () => {
    const views: Array<{ user: UserKey; url: string; idSel?: string; versionSel?: string; name: string }> = [
      { user: "member", url: `/app/business/runs/${ids.shipRun}`, name: "shared-1-business" },
      { user: "operator", url: `/app/ops/runs/${ids.shipRun}`, idSel: "run-id", versionSel: "run-version", name: "shared-2-operations" },
      { user: "auditor", url: `/app/audit/runs/${ids.shipRun}`, idSel: "audit-run-id", versionSel: "audit-run-version", name: "shared-3-audit" }
    ];
    for (const v of views) {
      const { ctx, page } = await openAs(v.user);
      await page.goto(`${webUrl}${v.url}`);
      await page.getByText(ids.shipRun!.slice(0, 8)).first().waitFor();
      await expectRole(page, v.user);
      if (v.idSel) expect(await page.getByTestId(v.idSel).innerText()).toBe(ids.shipRun);
      if (v.versionSel) expect((await page.getByTestId(v.versionSel).innerText()).startsWith(ids.shipVersion!)).toBe(true);
      await page.getByText(/VERIFIED_SUCCESS|Completed and verified/).first().waitFor();
      await shot(page, v.name);
      await ctx.close();
    }
  }, 120_000);
});
