/**
 * Platform API: permissions per role, contracts shared with the web client, tasks/publish/version
 * pinning, run controls and retry safety, HITL policy, organization admin, audit and exports.
 *
 * Real Express app + InMemoryStore (no Supabase). No model or browser is involved.
 */
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  AuditEventsResponseSchema, EvidenceResponseSchema, HealthResponseSchema, MeResponseSchema, MembersResponseSchema,
  PoliciesResponseSchema, PublishResponseSchema, RunCreatedResponseSchema, RunDetailResponseSchema, RunListResponseSchema,
  TaskDetailResponseSchema, TaskListResponseSchema, UsageResponseSchema, VersionListResponseSchema, DecisionResponseSchema
} from "@ghost/shared-types/contracts";
import { createApp } from "../src/app.js";
import { InMemoryStore } from "../src/store.js";
import { loadConfig } from "../src/config.js";
import { DesktopEvidenceBridge } from "../src/services/desktop-evidence-bridge.js";
import type { AuthContext } from "@ghost/shared-types";

process.env.WORKER_TRIGGER_URL = "http://127.0.0.1:9"; // nothing listens: the worker is reported down
const config = loadConfig({ NODE_ENV: "test", STORAGE_PROVIDER: "memory", ALLOW_MEMORY_STORAGE: "true", ALLOW_DEV_AUTH: "true", OPENROUTER_API_KEY: "" });

const T = "00000000-0000-4000-8000-0000000000a1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";
const auth = (role: AuthContext["role"], user = `u-${role}`, tenant = T): AuthContext => ({ tenantId: tenant, userId: user, role });
const token = (a: AuthContext) => `Bearer dev:${a.userId}:${a.tenantId}:${a.role}`;

const owner = auth("owner"), admin = auth("admin"), builder = auth("builder"), operator = auth("operator");
const auditor = auth("auditor"), member = auth("member"), member2 = auth("member", "u-member-2"), viewer = auth("viewer");
const outsider = auth("owner", "u-outsider", OTHER);

function workflow(workerId: string, opts: { url?: string; variables?: any[]; irreversible?: boolean; criteria?: boolean; description?: string } = {}) {
  const children: any[] = [
    { id: "step_0_navigate", operation: "NAVIGATE", target: "BROWSER_DETERMINISTIC", description: "Open orders", args: { url: opts.url ?? "https://orders.example.test/orders" } },
    { id: "step_1_type", operation: "TYPE", target: "BROWSER_DETERMINISTIC", description: "Enter note", args: { target: { label: "Note" }, value: "Dispatched" } }
  ];
  if (opts.irreversible !== false) {
    children.push({ id: "approve_step_2_click", operation: "REQUIRE_APPROVAL", target: "HUMAN", description: "Approve save", args: { gates_step_id: "step_2_click" } });
    children.push({ id: "step_2_click", operation: "CLICK", target: "BROWSER_DETERMINISTIC", description: "Save order", args: { target: { text: "Save order" }, irreversible: true } });
  }
  return {
    workflow_version: "2.0", name: "Ship order", description: opts.description ?? "Mark an order as shipped", status: "DRAFT",
    variables: opts.variables ?? [], secrets: [], expected_domains: ["orders.example.test"],
    ...(opts.criteria !== false ? { success_criteria: [{ id: "c1", type: "TEXT_VISIBLE", value: "Order updated", source: "USER_OBJECTIVE", evidenceFrameIds: [] }] } : {}),
    root_step: { id: "root", operation: "SEQUENCE", target: "DATA", description: "root", children },
    compiler: { version: "test", source_specification_id: "s", compiled_at: new Date().toISOString(), worker_id: workerId }
  } as any;
}

describe("Platform API", () => {
  let store: InMemoryStore;
  let app: any;
  const as = (a: AuthContext) => ({
    get: (url: string) => request(app).get(url).set("Authorization", token(a)),
    post: (url: string, body?: any) => request(app).post(url).set("Authorization", token(a)).send(body ?? {}),
    patch: (url: string, body?: any) => request(app).patch(url).set("Authorization", token(a)).send(body ?? {})
  });

  async function publishedTask(opts: Parameters<typeof workflow>[1] = {}) {
    const worker = await store.createGhostWorker(builder, { name: `Ship orders ${Math.random().toString(36).slice(2, 6)}` });
    const version = await store.createWorkflowVersion(builder, workflow(worker.id, opts));
    await store.updateGhostWorker(builder, worker.id, { activeVersionId: version.id, workflowId: version.workflowId } as any);
    const pub = await as(builder).post(`/api/v1/workflows/${version.id}/publish`, { worker_id: worker.id });
    expect(pub.status).toBe(200);
    return { worker, version };
  }

  async function runIn(state: string, a: AuthContext, versionId: string, workerId?: string) {
    const run = await store.createRun(a, versionId, undefined, workerId, "PRODUCTION");
    const path: Record<string, string[]> = {
      RUNNING: ["RUNNING"], FAILED: ["RUNNING", "FAILED"], WAITING_FOR_HUMAN: ["RUNNING", "WAITING_FOR_HUMAN"], SUCCEEDED: ["RUNNING", "SUCCEEDED"]
    };
    for (const s of path[state] || []) await store.updateRunState(a, run.id, s);
    return run;
  }

  beforeEach(() => {
    store = new InMemoryStore();
    app = createApp(config, store);
  });

  it("/me reports server-side permissions and experiences per role", async () => {
    const expected: Record<string, string[]> = {
      owner: ["business", "studio", "operations", "admin", "audit"],
      builder: ["business", "studio"],
      operator: ["business", "operations"],
      auditor: ["audit"],
      member: ["business"],
      viewer: ["business"]
    };
    for (const [role, experiences] of Object.entries(expected)) {
      const res = await as(auth(role as any)).get("/api/v1/me");
      expect(res.status).toBe(200);
      const me = MeResponseSchema.parse(res.body);
      expect(me.role).toBe(role);
      expect(me.experiences).toEqual(experiences);
    }
  });

  it("enforces permissions on the server for every role, independent of the frontend", async () => {
    const { worker, version } = await publishedTask();
    const cases: Array<[AuthContext, "get" | "post" | "patch", string, any, number]> = [
      [member, "post", "/api/v1/ghost-workers", { name: "x" }, 403],
      [member, "get", "/api/v1/ops/health", undefined, 403],
      [member, "get", "/api/v1/org/members", undefined, 403],
      [member, "get", "/api/v1/audit/events", undefined, 403],
      [member, "get", "/api/v1/audit-log", undefined, 403],
      [member, "patch", "/api/v1/settings", { theme: "light" }, 403],
      [member, "post", `/api/v1/workflows/${version.id}/publish`, { worker_id: worker.id }, 403],
      [member, "post", `/api/v1/ghost-workers/${worker.id}/evidence/analyze`, {}, 403],
      [member, "get", "/api/v1/tasks", undefined, 200],
      [viewer, "post", `/api/v1/tasks/${worker.id}/runs`, { workflow_version_id: version.id }, 403],
      [viewer, "get", "/api/v1/tasks", undefined, 200],
      [auditor, "get", "/api/v1/tasks", undefined, 403],
      [auditor, "post", `/api/v1/tasks/${worker.id}/runs`, { workflow_version_id: version.id }, 403],
      [auditor, "get", "/api/v1/audit/events", undefined, 200],
      [auditor, "get", "/api/v1/audit/runs/export", undefined, 200],
      [operator, "get", "/api/v1/ops/health", undefined, 200],
      [operator, "get", "/api/v1/org/members", undefined, 403],
      [operator, "post", "/api/v1/ghost-workers", { name: "x" }, 403],
      [builder, "post", "/api/v1/ghost-workers", { name: "x" }, 201],
      [builder, "patch", "/api/v1/org/policies", { retryRequiresOperator: false }, 403],
      [admin, "patch", "/api/v1/org/policies", { retryRequiresOperator: true }, 200]
    ];
    for (const [who, method, url, body, status] of cases) {
      const res = await (as(who) as any)[method](url, body);
      expect({ role: who.role, method, url, status: res.status }).toEqual({ role: who.role, method, url, status });
      if (status === 403) expect(res.body.error.code).toBe("FORBIDDEN");
    }
  });

  it("publishing gates on readiness and ownership, and business runs are pinned to the published version", async () => {
    const worker = await store.createGhostWorker(builder, { name: "Orders" });
    const notReady = await store.createWorkflowVersion(builder, workflow(worker.id, { url: "{{url}}" }));
    const r1 = await as(builder).post(`/api/v1/workflows/${notReady.id}/publish`, { worker_id: worker.id });
    expect(r1.status).toBe(409);
    expect(r1.body.error.code).toBe("WORKFLOW_NOT_EXECUTABLE");

    const otherWorker = await store.createGhostWorker(builder, { name: "Other" });
    const foreign = await store.createWorkflowVersion(builder, workflow(otherWorker.id));
    const r2 = await as(builder).post(`/api/v1/workflows/${foreign.id}/publish`, { worker_id: worker.id });
    expect(r2.body.error.code).toBe("VERSION_NOT_FOR_WORKER");

    const v1 = await store.createWorkflowVersion(builder, workflow(worker.id));
    const pub = await as(builder).post(`/api/v1/workflows/${v1.id}/publish`, { worker_id: worker.id });
    const published = PublishResponseSchema.parse(pub.body);
    expect(published.worker.publishedVersionId).toBe(v1.id);

    // A newer candidate does not change what business users run until it is published.
    const v2 = await store.createWorkflowVersion(builder, workflow(worker.id, { description: "Mark an order as shipped (v2)" }));
    await store.updateGhostWorker(builder, worker.id, { activeVersionId: v2.id } as any);
    const versions = VersionListResponseSchema.parse((await as(builder).get(`/api/v1/ghost-workers/${worker.id}/versions`)).body).versions;
    expect(versions.find(v => v.id === v1.id)).toMatchObject({ isPublished: true, isActive: false, executable: true });
    expect(versions.find(v => v.id === v2.id)).toMatchObject({ isPublished: false, isActive: true });
    expect(versions.find(v => v.id === notReady.id)?.blockingIssues.length).toBeGreaterThan(0);

    const tasks = TaskListResponseSchema.parse((await as(member).get("/api/v1/tasks")).body).tasks;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ workerId: worker.id, publishedVersionId: v1.id, runnable: true });

    const stale = await as(member).post(`/api/v1/tasks/${worker.id}/runs`, { workflow_version_id: v2.id });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("TASK_VERSION_CHANGED");
    const missing = await as(member).post(`/api/v1/tasks/${worker.id}/runs`, {});
    expect(missing.body.error.code).toBe("WORKFLOW_VERSION_REQUIRED");

    const launched = await request(app).post(`/api/v1/tasks/${worker.id}/runs`).set("Authorization", token(member)).set("idempotency-key", "k-1").send({ workflow_version_id: v1.id });
    expect(launched.status).toBe(202);
    const run = RunCreatedResponseSchema.parse(launched.body).run;
    expect(run).toMatchObject({ workflowVersionId: v1.id, workerId: worker.id, createdBy: member.userId, runMode: "PRODUCTION", state: "QUEUED" });
    const replay = await request(app).post(`/api/v1/tasks/${worker.id}/runs`).set("Authorization", token(member)).set("idempotency-key", "k-1").send({ workflow_version_id: v1.id });
    expect(replay.body.run.id).toBe(run.id);
    expect(replay.body.idempotentReplay).toBe(true);

    const detail = TaskDetailResponseSchema.parse((await as(member).get(`/api/v1/tasks/${worker.id}`)).body);
    expect(detail.recentRuns.map(r => r.id)).toContain(run.id);
  });

  it("validates task inputs against what the published workflow actually needs", async () => {
    const { worker, version } = await publishedTask({
      url: "https://orders.example.test/orders/{{order_id}}",
      variables: [{ name: "order_id", type: "string", required: true }]
    });
    const task = TaskListResponseSchema.parse((await as(member).get("/api/v1/tasks")).body).tasks[0]!;
    expect(task.inputs).toEqual([{ name: "order_id", type: "string", required: true }]);

    const none = await as(member).post(`/api/v1/tasks/${worker.id}/runs`, { workflow_version_id: version.id, inputs: {} });
    expect(none.status).toBe(400);
    expect(none.body.error.fields).toEqual({ order_id: "Required." });
    const extra = await as(member).post(`/api/v1/tasks/${worker.id}/runs`, { workflow_version_id: version.id, inputs: { order_id: "42", admin: "1" } });
    expect(extra.body.error.fields).toEqual({ admin: "This task does not take this input." });
    const ok = await as(member).post(`/api/v1/tasks/${worker.id}/runs`, { workflow_version_id: version.id, inputs: { order_id: " 42 " } });
    expect(ok.status).toBe(202);
    expect((await store.getRun(member, ok.body.run.id))?.metadata).toEqual({ inputs: { order_id: "42" } });
  });

  it("scopes runs, details and evidence: business users see only the runs they launched", async () => {
    const { worker, version } = await publishedTask();
    const mine = await runIn("FAILED", member, version.id, worker.id);
    const theirs = await runIn("FAILED", member2, version.id, worker.id);
    await store.createExecutionStep(member2, { id: "s1", tenantId: T, runId: theirs.id, stepId: "step_0_navigate", state: "SUCCEEDED", metadata: { outputs: { screenshotUrl: "data:image/png;base64,AAAA" } } } as any);

    const list = RunListResponseSchema.parse((await as(member).get("/api/v1/runs")).body).runs;
    expect(list.map(r => r.id)).toEqual([mine.id]);
    expect((await as(member).get(`/api/v1/runs/${theirs.id}/detail`)).status).toBe(404);
    expect((await as(member).get(`/api/v1/runs/${theirs.id}/evidence`)).status).toBe(404);
    expect((await as(member).get(`/api/v1/runs/${theirs.id}`)).status).toBe(404);

    const opsList = RunListResponseSchema.parse((await as(operator).get(`/api/v1/runs?state=FAILED&worker_id=${worker.id}`)).body).runs;
    expect(opsList.map(r => r.id).sort()).toEqual([mine.id, theirs.id].sort());
    expect(opsList[0]!.workerName).toBe(worker.name);
    const evidence = EvidenceResponseSchema.parse((await as(auditor).get(`/api/v1/runs/${theirs.id}/evidence`)).body);
    expect(evidence).toMatchObject({ runId: theirs.id, workflowVersionId: version.id });
    expect(evidence.items.map(i => i.kind)).toEqual(["screenshot"]);

    expect((await as(outsider).get(`/api/v1/runs/${mine.id}/detail`)).status).toBe(404);
    expect((await as(outsider).get(`/api/v1/tasks/${worker.id}`)).status).toBe(404);
  });

  it("computes run controls from persisted state and never retries a run that already changed the application", async () => {
    const { worker, version } = await publishedTask();
    const clean = await runIn("FAILED", member, version.id, worker.id);
    const dirty = await runIn("FAILED", member, version.id, worker.id);
    await store.createExecutionStep(member, { id: "x", tenantId: T, runId: dirty.id, stepId: "step_2_click", state: "SUCCEEDED", metadata: {} } as any);

    const cleanDetail = RunDetailResponseSchema.parse((await as(operator).get(`/api/v1/runs/${clean.id}/detail`)).body);
    expect(cleanDetail.controls).toMatchObject({ canRetry: true, canCancel: false, canPause: false });
    expect(cleanDetail.workflow_version).toMatchObject({ id: version.id, stepCount: 4 });
    const dirtyDetail = RunDetailResponseSchema.parse((await as(operator).get(`/api/v1/runs/${dirty.id}/detail`)).body);
    expect(dirtyDetail.controls.canRetry).toBe(false);
    expect(dirtyDetail.controls.reasons.retry).toMatch(/step_2_click already changed the application/);

    const refused = await as(operator).post(`/api/v1/runs/${dirty.id}/retry`);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("RETRY_NOT_ALLOWED");

    // Members cannot retry while the policy reserves retries for operators.
    expect((await as(member).post(`/api/v1/runs/${clean.id}/retry`)).body.error.code).toBe("RETRY_NOT_ALLOWED");
    expect((await as(owner).patch("/api/v1/org/policies", { retryRequiresOperator: false })).status).toBe(200);
    const retried = await as(member).post(`/api/v1/runs/${clean.id}/retry`);
    expect(retried.status).toBe(202);
    expect(retried.body.retryOf).toBe(clean.id);
    expect(retried.body.run).toMatchObject({ workflowVersionId: version.id, state: "QUEUED" });
    const audits = await store.listAudits(owner);
    expect(audits.find(a => a.action === "RUN_RETRIED")?.metadata).toMatchObject({ retry_of: clean.id });
    expect((await store.getRun(owner, clean.id))?.state).toBe("FAILED"); // the original stays historical
  });

  it("pause stops at a decision point; resume needs the decision; members decide their own runs only when policy allows", async () => {
    const { worker, version } = await publishedTask();
    const running = await runIn("RUNNING", member, version.id, worker.id);
    const d1 = RunDetailResponseSchema.parse((await as(operator).get(`/api/v1/runs/${running.id}/detail`)).body);
    expect(d1.controls.canPause).toBe(true);
    expect((await as(operator).post(`/api/v1/runs/${running.id}/pause`, { reason: "Checking data" })).status).toBe(202);
    expect((await as(operator).post(`/api/v1/runs/${running.id}/resume`)).body.error.code).toBe("DECISION_REQUIRED");

    const hitl = (await store.listHitlRequests(owner)).find(h => h.runId === running.id)!;
    const approved = await as(member).post(`/api/v1/hitl/${hitl.id}/decision`, { action: "APPROVE", run_id: running.id, workflow_version_id: version.id });
    expect(approved.status).toBe(200);
    expect(DecisionResponseSchema.parse(approved.body).run.state).toBe("RESUMING");

    const other = await runIn("WAITING_FOR_HUMAN", member2, version.id, worker.id);
    await store.createHitlRequest(member2, { runId: other.id, workflowStepId: "approve_step_2_click", challengeType: "MANUAL_APPROVAL", expiresAt: new Date(Date.now() + 60_000).toISOString() });
    const otherHitl = (await store.listHitlRequests(owner)).find(h => h.runId === other.id)!;
    expect((await as(member).post(`/api/v1/hitl/${otherHitl.id}/decision`, { action: "APPROVE" })).status).toBe(403);
    expect((await as(member).get("/api/v1/hitl")).body.hitl_requests.map((h: any) => h.runId)).not.toContain(other.id);

    await as(owner).patch("/api/v1/org/policies", { membersMayApproveOwnRuns: false });
    expect((await as(member2).post(`/api/v1/hitl/${otherHitl.id}/decision`, { action: "APPROVE" })).status).toBe(403);
    expect((await as(operator).post(`/api/v1/hitl/${otherHitl.id}/decision`, { action: "APPROVE" })).status).toBe(200);
  });

  it("reports real service health and incidents", async () => {
    const { worker, version } = await publishedTask();
    const failed = await runIn("FAILED", member, version.id, worker.id);
    const res = await as(operator).get("/api/v1/ops/health");
    const health = HealthResponseSchema.parse(res.body);
    const byName = Object.fromEntries(health.components.map(c => [c.name, c]));
    expect(byName["Database"]).toMatchObject({ status: "ok" });
    expect(byName["Execution worker"]).toMatchObject({ status: "down" });
    expect(byName["Model provider"]).toMatchObject({ status: "down" });
    expect(health.queue.byState.FAILED).toBe(1);
    expect(health.incidents.find(i => i.runId === failed.id)?.kind).toBe("RUN_FAILED");
  });

  it("manages members and roles with owner and self-change safeguards", async () => {
    await as(owner).get("/api/v1/me");
    await store.ensureMember(member);
    await store.ensureMember(admin);
    const members = MembersResponseSchema.parse((await as(owner).get("/api/v1/org/members")).body);
    expect(members.members.map(m => m.userId).sort()).toEqual([admin.userId, member.userId, owner.userId].sort());
    expect(members.assignableRoles).toContain("auditor");

    const changed = await as(owner).patch(`/api/v1/org/members/${member.userId}`, { role: "operator" });
    expect(changed.status).toBe(200);
    expect((await store.listMembers(owner)).find(m => m.userId === member.userId)?.role).toBe("operator");
    expect((await store.listAudits(owner)).find(a => a.action === "MEMBER_ROLE_CHANGED")?.metadata).toMatchObject({ from: "member", to: "operator" });

    expect((await as(owner).patch(`/api/v1/org/members/${owner.userId}`, { role: "viewer" })).body.error.code).toBe("SELF_ROLE_CHANGE");
    expect((await as(admin).patch(`/api/v1/org/members/${member.userId}`, { role: "owner" })).status).toBe(403);
    expect((await as(admin).patch(`/api/v1/org/members/${owner.userId}`, { role: "viewer" })).status).toBe(403);
    expect((await as(owner).patch(`/api/v1/org/members/${member.userId}`, { role: "superuser" })).body.error.code).toBe("INVALID_ROLE");
    expect((await as(owner).patch(`/api/v1/org/members/${outsider.userId}`, { role: "viewer" })).status).toBe(404);

    // The last owner cannot be demoted. (Development tokens carry their own role, so the first
    // owner's token still acts as owner here; in production the role comes from the membership.)
    await as(owner).patch(`/api/v1/org/members/${admin.userId}`, { role: "owner" });
    const promoted = auth("owner", admin.userId);
    expect((await as(promoted).patch(`/api/v1/org/members/${owner.userId}`, { role: "admin" })).status).toBe(200);
    const lastOwner = await as(owner).patch(`/api/v1/org/members/${admin.userId}`, { role: "admin" });
    expect(lastOwner.status).toBe(409);
    expect(lastOwner.body.error.code).toBe("LAST_OWNER");
    expect((await as(promoted).patch(`/api/v1/org/members/${admin.userId}`, { role: "admin" })).body.error.code).toBe("SELF_ROLE_CHANGE");
  });

  it("validates and persists policies and settings per organization", async () => {
    const defaults = PoliciesResponseSchema.parse((await as(admin).get("/api/v1/org/policies")).body);
    expect(defaults.policies).toMatchObject({ membersMayApproveOwnRuns: true, retryRequiresOperator: true });
    const bad = await as(admin).patch("/api/v1/org/policies", { hitlTimeoutMinutes: 1, approvalsOptional: true });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.error.fields).sort()).toEqual(["approvalsOptional", "hitlTimeoutMinutes"]);
    const saved = PoliciesResponseSchema.parse((await as(admin).patch("/api/v1/org/policies", { hitlTimeoutMinutes: 90 })).body);
    expect(saved.policies.hitlTimeoutMinutes).toBe(90);
    expect(PoliciesResponseSchema.parse((await as(admin).get("/api/v1/org/policies")).body).policies.hitlTimeoutMinutes).toBe(90);
    expect(PoliciesResponseSchema.parse((await as(outsider).get("/api/v1/org/policies")).body).policies.hitlTimeoutMinutes).not.toBe(90);

    expect((await as(owner).patch("/api/v1/settings", { theme: "light" })).body.settings.theme).toBe("light");
    expect((await as(member).get("/api/v1/settings")).body.settings.theme).toBe("light");
    expect((await as(owner).patch("/api/v1/settings", { theme: "neon" })).status).toBe(400);
    expect((await as(owner).patch("/api/v1/settings", { isAdmin: true })).status).toBe(400);
    expect((await as(outsider).get("/api/v1/settings")).body.settings.theme).toBe("dark");
  });

  it("returns usage and audit events, and exports runs safely as CSV and JSON", async () => {
    const worker = await store.createGhostWorker(builder, { name: "=HYPERLINK(\"http://evil\")" });
    const version = await store.createWorkflowVersion(builder, workflow(worker.id));
    await store.updateGhostWorker(builder, worker.id, { activeVersionId: version.id } as any);
    await as(builder).post(`/api/v1/workflows/${version.id}/publish`, { worker_id: worker.id });
    const run = await runIn("SUCCEEDED", member, version.id, worker.id);
    await store.createRun(outsider, "foreign-version");

    const usage = UsageResponseSchema.parse((await as(admin).get("/api/v1/org/usage")).body);
    expect(usage).toMatchObject({ publishedTasks: 1, runs: { total: 1 } });

    const events = AuditEventsResponseSchema.parse((await as(auditor).get(`/api/v1/audit/events?action=WORKFLOW_PUBLISHED`)).body).events;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ action: "WORKFLOW_PUBLISHED", actorId: builder.userId, resourceId: worker.id });

    const csv = await as(auditor).get("/api/v1/audit/runs/export?format=csv");
    expect(csv.status).toBe(200);
    expect(csv.headers["content-type"]).toMatch(/text\/csv/);
    expect(csv.headers["content-disposition"]).toMatch(/attachment; filename="runs-/);
    const lines = csv.text.split("\r\n");
    expect(lines[0]).toBe("run_id,worker_id,worker_name,workflow_version_id,state,outcome,launched_by,created_at,updated_at,decisions");
    expect(lines).toHaveLength(2); // only this tenant's run
    expect(lines[1]).toContain(run.id);
    expect(lines[1]).toContain(`"'=HYPERLINK(""http://evil"")"`);
    const json = await as(auditor).get("/api/v1/audit/runs/export?format=json");
    expect(json.body.rows.map((r: any) => r.run_id)).toEqual([run.id]);
    expect((await store.listAudits(owner)).filter(a => a.action === "AUDIT_EXPORTED")).toHaveLength(2);

    const report = await as(auditor).get(`/api/v1/runs/${run.id}/report?download=1`);
    expect(report.headers["content-disposition"]).toContain(`run-${run.id}.json`);
    expect(report.body).toMatchObject({ run: { id: run.id }, workflowVersion: { id: version.id } });
  });

  it("serves extracted frames only from the job's own output directory", async () => {
    const worker = await store.createGhostWorker(builder, { name: "Framed" });
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "aw-frames-"));
    const frameDir = path.join(outputDir, "job_frames", "frames");
    fs.mkdirSync(frameDir, { recursive: true });
    const inside = path.join(frameDir, "frame_000001.jpg");
    fs.writeFileSync(inside, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]));
    const outside = path.join(os.tmpdir(), `aw-outside-${Date.now()}.jpg`);
    fs.writeFileSync(outside, Buffer.from([0xff, 0xd8, 0xff]));
    (DesktopEvidenceBridge.getInstance() as any).jobs.set("job_frames", {
      jobId: "job_frames", tenantId: T, workerId: worker.id, status: "COMPLETED", outputDir, mediaPath: "", mediaType: "VIDEO", createdAt: "",
      result: { frames: [{ frame_id: "frame_000001", image_path: inside }, { frame_id: "frame_evil", image_path: outside }] }
    });
    try {
      const ok = await as(builder).get(`/api/v1/ghost-workers/${worker.id}/evidence/jobs/job_frames/frames/frame_000001`);
      expect(ok.status).toBe(200);
      expect(Buffer.from(ok.body).subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
      expect((await as(builder).get(`/api/v1/ghost-workers/${worker.id}/evidence/jobs/job_frames/frames/frame_evil`)).status).toBe(404);
      const otherWorker = await store.createGhostWorker(builder, { name: "Other" });
      expect((await as(builder).get(`/api/v1/ghost-workers/${otherWorker.id}/evidence/jobs/job_frames/frames/frame_000001`)).status).toBe(404);
      expect((await as(member).get(`/api/v1/ghost-workers/${worker.id}/evidence/jobs/job_frames/frames/frame_000001`)).status).toBe(403);
    } finally {
      fs.rmSync(outputDir, { recursive: true, force: true });
      fs.rmSync(outside, { force: true });
    }
  });

  it("isolates tenants on every id-addressed route, even for an owner of another organization", async () => {
    const { worker, version } = await publishedTask();
    const paused = await runIn("WAITING_FOR_HUMAN", member, version.id, worker.id);
    await store.createHitlRequest(member, { runId: paused.id, workflowStepId: "approve_step_2_click", challengeType: "APPROVAL", expiresAt: new Date(Date.now() + 3600_000).toISOString() });
    const hitl = (await store.listHitlRequests(owner)).find(h => h.runId === paused.id)!;
    const done = await runIn("SUCCEEDED", member, version.id, worker.id);
    const doc = await store.createDocument(builder, { workerId: worker.id, type: "TXT", name: "sop.txt", parsedJson: {} });
    const schedule = await store.createSchedule(builder, { workerId: worker.id, cronExpression: "0 9 * * 1" });
    const ours = [worker.id, version.id, paused.id, done.id, hitl.id, doc.id, schedule.id];
    const runCount = (await store.listRuns(owner)).length;

    const probes: Array<[string, string, any?]> = [
      ["GET", `/api/v1/tasks/${worker.id}`], ["POST", `/api/v1/tasks/${worker.id}/runs`, { inputs: {} }],
      ["GET", `/api/v1/ghost-workers/${worker.id}`], ["GET", `/api/v1/ghost-workers/${worker.id}/versions`],
      ["POST", `/api/v1/ghost-workers/${worker.id}`, { name: "hijacked" }], ["POST", `/api/v1/ghost-workers/${worker.id}/run`, {}],
      ["POST", `/api/v1/ghost-workers/${worker.id}/activate`, {}], ["GET", `/api/v1/ghost-workers/${worker.id}/documents`],
      ["DELETE", `/api/v1/ghost-workers/${worker.id}/documents/${doc.id}`], ["GET", `/api/v1/ghost-workers/${worker.id}/schedules`],
      ["DELETE", `/api/v1/schedules/${schedule.id}`], ["GET", `/api/v1/ghost-workers/${worker.id}/evidence`],
      ["GET", `/api/v1/workflows/${version.id}`], ["POST", `/api/v1/workflows/${version.id}/publish`, { worker_id: worker.id }],
      ["POST", `/api/v1/workflows/${version.id}/activate`, {}], ["POST", `/api/v1/workflows/${version.id}/run`, {}],
      ["GET", `/api/v1/runs/${paused.id}`], ["GET", `/api/v1/runs/${paused.id}/detail`], ["GET", `/api/v1/runs/${done.id}/evidence`],
      ["GET", `/api/v1/runs/${done.id}/report`], ["POST", `/api/v1/runs/${paused.id}/cancel`], ["POST", `/api/v1/runs/${paused.id}/pause`],
      ["POST", `/api/v1/runs/${paused.id}/resume`], ["POST", `/api/v1/runs/${paused.id}/claim`], ["POST", `/api/v1/runs/${done.id}/retry`],
      ["POST", `/api/v1/hitl/${hitl.id}/decision`, { decision: "APPROVE" }]
    ];
    const leaks: string[] = [];
    for (const [method, url, body] of probes) {
      let req = (request(app) as any)[method.toLowerCase()](url).set("Authorization", token(outsider));
      if (body !== undefined) req = req.send(body);
      const res = await req;
      const text = JSON.stringify(res.body ?? "") + (res.text ?? "");
      if (method !== "GET" && res.status < 400) leaks.push(`${method} ${url} -> ${res.status}`);
      if (res.status >= 500) leaks.push(`${method} ${url} -> ${res.status}`);
      for (const id of ours) if (text.includes(id)) leaks.push(`${method} ${url} exposes ${id}`);
    }
    for (const url of ["/api/v1/runs", "/api/v1/tasks", "/api/v1/hitl", "/api/v1/ghost-workers", "/api/v1/workflows", "/api/v1/audit/events", "/api/v1/audit-log", "/api/v1/exceptions", "/api/v1/org/members", "/api/v1/org/usage", "/api/v1/audit/runs/export?format=json"]) {
      const res = await as(outsider).get(url);
      const text = JSON.stringify(res.body ?? "") + (res.text ?? "");
      for (const id of ours) if (text.includes(id)) leaks.push(`GET ${url} lists ${id}`);
    }
    expect(leaks).toEqual([]);

    // Nothing in this organization changed.
    expect((await store.getRun(owner, paused.id))?.state).toBe("WAITING_FOR_HUMAN");
    expect((await store.getRun(owner, done.id))?.state).toBe("SUCCEEDED");
    expect((await store.listRuns(owner)).length).toBe(runCount);
    expect((await store.listHitlRequests(owner)).find(h => h.id === hitl.id)?.state).toBe("PENDING");
    const after = await store.getGhostWorker(owner, worker.id);
    expect(after?.name).toBe(worker.name);
    expect(after?.publishedVersionId).toBe(version.id);
    expect((await store.listDocuments(owner, worker.id)).map(d => d.id)).toContain(doc.id);
    expect((await store.listSchedules(owner, worker.id)).map(s => s.id)).toContain(schedule.id);

    // Inside the tenant, a missing document is 404 and never purges the worker's workflow.
    const del = (url: string) => request(app).delete(url).set("Authorization", token(builder));
    expect((await del(`/api/v1/ghost-workers/${worker.id}/documents/no-such-doc`)).status).toBe(404);
    expect((await del(`/api/v1/ghost-workers/${worker.id}/evidence/no-such-doc`)).status).toBe(404);
    expect((await del(`/api/v1/schedules/no-such-schedule`)).status).toBe(404);
    expect((await store.getGhostWorker(owner, worker.id))?.activeVersionId).toBe(version.id);
    expect((await del(`/api/v1/schedules/${schedule.id}`)).body).toEqual({ deleted: true });
    expect((await del(`/api/v1/ghost-workers/${worker.id}/documents/${doc.id}`)).status).toBe(200);
    expect((await store.listDocuments(owner, worker.id)).map(d => d.id)).not.toContain(doc.id);
  });
});
