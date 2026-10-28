import { Router, type Request, type RequestHandler, type Response } from "express";
import { assessExecutionReadiness } from "@ghost/workflow-schema";
import type { AuthContext } from "@ghost/shared-types";
import type { AppStore, RunRow } from "../store.js";
import type { ApiConfig } from "../config.js";
import { OpenRouterQuotaManager } from "../services/openrouter/quota-manager.js";
import {
  ASSIGNABLE_ROLES, canAccessRun, experiencesFor, hasPermission, permissionsFor, requirePermission, type Role
} from "../authorization.js";
import {
  computeRunControls, loadPolicies, requiredInputs, runSummary, validatePolicyPatch, versionSummary
} from "../services/platform-service.js";

const asyncHandler = (fn: (req: Request, res: Response) => Promise<any>) =>
  (req: Request, res: Response, next: any) => Promise.resolve(fn(req, res)).catch(next);

const p = (req: Request, name: string) => String((req.params as any)[name] ?? "");

function fail(res: Response, req: Request, status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  res.status(status).json({ error: { code, message, request_id: (req as any).id, ...extra } });
}

export interface PlatformRouterDeps {
  config: ApiConfig;
  store: AppStore;
  triggerRun: (runId: string) => void;
  workerBaseUrl: string;
  /** Authentication middleware, applied per route so unrelated /api/v1 requests are not re-authenticated. */
  auth: RequestHandler;
}

/**
 * Role-oriented platform API used by the Business, Studio, Operations, Admin and Audit experiences.
 * Every route checks permissions and tenant ownership server-side.
 */
export function createPlatformRouter({ config, store, triggerRun, workerBaseUrl, auth: authenticate }: PlatformRouterDeps): Router {
  const router = Router();
  const policiesFor = (auth: AuthContext) => loadPolicies(store, auth, config.hitlSessionTimeoutSeconds);

  // ── Identity ────────────────────────────────────────────────────────────────────────────────
  router.get("/me", authenticate, asyncHandler(async (req, res) => {
    const auth = req.auth!;
    if (config.nodeEnv !== "production") await store.ensureMember(auth);
    const member = (await store.listMembers(auth).catch(() => [])).find(m => m.userId === auth.userId);
    res.json({
      user: { id: auth.userId, ...(member?.email ? { email: member.email } : {}) },
      organization: { id: auth.tenantId },
      role: auth.role,
      permissions: permissionsFor(auth.role),
      experiences: experiencesFor(auth.role)
    });
  }));

  // ── Business tasks (published workflow versions) ───────────────────────────────────────────
  async function taskSummary(auth: AuthContext, worker: any, runs: RunRow[], pendingByRun: Set<string>) {
    const version = await store.getWorkflowVersion(auth, worker.publishedVersionId);
    const workflow: any = version?.workflow;
    const inputs = workflow ? requiredInputs(workflow) : [];
    const placeholder = Object.fromEntries(inputs.map(i => [i.name, "provided-at-launch"]));
    const readiness = workflow ? assessExecutionReadiness(workflow, { inputs: placeholder }) : undefined;
    const workerRuns = runs.filter(r => r.workerId === worker.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return {
      workerId: worker.id,
      name: worker.name,
      ...(worker.description ? { description: worker.description } : (workflow?.description ? { description: workflow.description } : {})),
      publishedVersionId: worker.publishedVersionId,
      ...(version ? { publishedAt: version.createdAt } : {}),
      inputs,
      runnable: Boolean(readiness?.executable),
      blockingIssues: readiness ? readiness.issues.filter(i => i.severity === "BLOCKING").map(i => i.message) : ["The published workflow version could not be loaded."],
      lastRun: workerRuns[0] ? runSummary(workerRuns[0], worker.name) : null,
      pendingApprovals: workerRuns.filter(r => pendingByRun.has(r.id)).length
    };
  }

  async function visibleRuns(auth: AuthContext): Promise<RunRow[]> {
    const runs = await store.listRuns(auth);
    return hasPermission(auth, "runs.view") ? runs : runs.filter(r => r.createdBy === auth.userId);
  }

  async function pendingRunIds(auth: AuthContext): Promise<Set<string>> {
    const hitls = await store.listHitlRequests(auth);
    return new Set(hitls.filter(h => h.state === "PENDING" || h.state === "CONTROL_ACTIVE").map(h => h.runId));
  }

  router.get("/tasks", authenticate, requirePermission("tasks.view"), asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const workers = (await store.listGhostWorkers(auth)).filter(w => w.publishedVersionId && w.status !== "ARCHIVED");
    const [runs, pending] = await Promise.all([visibleRuns(auth), pendingRunIds(auth)]);
    const tasks = await Promise.all(workers.map(w => taskSummary(auth, w, runs, pending)));
    res.json({ tasks });
  }));

  router.get("/tasks/:workerId", authenticate, requirePermission("tasks.view"), asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const worker = await store.getGhostWorker(auth, p(req, "workerId"));
    if (!worker || worker.tenantId !== auth.tenantId || !worker.publishedVersionId) return fail(res, req, 404, "NOT_FOUND", "Task not found or not published.");
    const [runs, pending] = await Promise.all([visibleRuns(auth), pendingRunIds(auth)]);
    const task = await taskSummary(auth, worker, runs, pending);
    const recentRuns = runs.filter(r => r.workerId === worker.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20).map(r => runSummary(r, worker.name));
    res.json({ task, recentRuns });
  }));

  router.post("/tasks/:workerId/runs", authenticate, requirePermission("tasks.run"), asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const worker = await store.getGhostWorker(auth, p(req, "workerId"));
    if (!worker || worker.tenantId !== auth.tenantId) return fail(res, req, 404, "NOT_FOUND", "Task not found.");
    if (!worker.publishedVersionId) return fail(res, req, 409, "TASK_NOT_PUBLISHED", "This task has no published version.");
    const requested = req.body?.workflow_version_id;
    if (!requested) return fail(res, req, 400, "WORKFLOW_VERSION_REQUIRED", "Select the exact task version to run.");
    if (requested !== worker.publishedVersionId) {
      return fail(res, req, 409, "TASK_VERSION_CHANGED", "A newer version of this task was published. Reload the task before running it.", { published_version_id: worker.publishedVersionId });
    }
    const version = await store.getWorkflowVersion(auth, worker.publishedVersionId);
    if (!version) return fail(res, req, 409, "VERSION_MISSING", "The published version could not be loaded.");

    const supplied = req.body?.inputs ?? {};
    if (typeof supplied !== "object" || Array.isArray(supplied)) return fail(res, req, 400, "INVALID_INPUTS", "Inputs must be an object.");
    const expected = requiredInputs(version.workflow);
    const fieldErrors: Record<string, string> = {};
    for (const input of expected) {
      const value = (supplied as any)[input.name];
      if (input.required && (value === undefined || value === null || String(value).trim() === "")) fieldErrors[input.name] = "Required.";
      else if (value !== undefined && typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") fieldErrors[input.name] = "Must be text, a number or true/false.";
    }
    for (const key of Object.keys(supplied)) if (!expected.some(i => i.name === key)) fieldErrors[key] = "This task does not take this input.";
    if (Object.keys(fieldErrors).length) return fail(res, req, 400, "INVALID_INPUTS", "Some inputs are missing or invalid.", { fields: fieldErrors });

    const inputs = Object.fromEntries(Object.entries(supplied).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]));
    const readiness = assessExecutionReadiness(version.workflow as any, { inputs });
    if (!readiness.executable) {
      return fail(res, req, 409, "WORKFLOW_NOT_EXECUTABLE", "This task cannot run safely right now.", { issues: readiness.issues.filter(i => i.severity === "BLOCKING") });
    }
    const run = await store.createRun(auth, version.id, req.header("idempotency-key") ?? undefined, worker.id, "PRODUCTION", inputs);
    if (!run.idempotentReplay) triggerRun(run.id);
    res.status(202).json({ run: runSummary(run, worker.name), idempotentReplay: Boolean(run.idempotentReplay) });
  }));

  // ── Studio: version history and publishing ──────────────────────────────────────────────────
  router.get("/ghost-workers/:id/versions", authenticate, requirePermission("workflows.build", "audit.read"), asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const worker = await store.getGhostWorker(auth, p(req, "id"));
    if (!worker || worker.tenantId !== auth.tenantId) return fail(res, req, 404, "NOT_FOUND", "Worker not found.");
    const known = [worker.activeVersionId, worker.publishedVersionId].filter((v): v is string => Boolean(v));
    const versions = await store.listWorkflowVersionsForWorker(auth, worker.id, known);
    res.json({ versions: versions.map(v => versionSummary(v, worker)) });
  }));

  router.post("/workflows/:versionId/publish", authenticate, requirePermission("workflows.publish"), asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const version = await store.getWorkflowVersion(auth, p(req, "versionId"));
    if (!version) return fail(res, req, 404, "NOT_FOUND", "Workflow version not found.");
    const worker = await store.getGhostWorker(auth, String(req.body?.worker_id || ""));
    if (!worker || worker.tenantId !== auth.tenantId) return fail(res, req, 404, "NOT_FOUND", "Worker not found.");
    const wf: any = version.workflow;
    const belongs = wf?.compiler?.worker_id === worker.id || worker.activeVersionId === version.id || worker.publishedVersionId === version.id;
    if (!belongs) return fail(res, req, 409, "VERSION_NOT_FOR_WORKER", "This version was not compiled for this worker.");
    const readiness = assessExecutionReadiness(wf);
    if (!readiness.executable) {
      return fail(res, req, 409, "WORKFLOW_NOT_EXECUTABLE", "Only an executable, fully grounded version can be published.", { issues: readiness.issues.filter(i => i.severity === "BLOCKING") });
    }
    const previous = worker.publishedVersionId;
    const activated = await store.activateWorkflowVersion(auth, version.id);
    const updated = await store.updateGhostWorker(auth, worker.id, { publishedVersionId: version.id, status: "ACTIVE" } as any);
    await store.writeAudit(auth, "WORKFLOW_PUBLISHED", "ghost_worker", worker.id, { workflow_version_id: version.id, previous_version_id: previous ?? null });
    res.json({ worker: { id: worker.id, publishedVersionId: version.id }, version: versionSummary(activated ?? version, updated ?? worker) });
  }));

  // ── Runs: retry, evidence, report ───────────────────────────────────────────────────────────
  async function loadRunContext(req: Request, res: Response, orgWide: "runs.view" | "audit.read" = "runs.view") {
    const auth = req.auth!;
    const run = await store.getRun(auth, p(req, "id"));
    if (!run || run.tenantId !== auth.tenantId || !(canAccessRun(auth, run, orgWide) || hasPermission(auth, "audit.read"))) {
      fail(res, req, 404, "NOT_FOUND", "Run not found.");
      return undefined;
    }
    const [steps, hitls, version] = await Promise.all([
      store.listExecutionSteps(auth, run.id),
      store.listHitlRequests(auth).then(all => all.filter(h => h.runId === run.id)),
      store.getWorkflowVersion(auth, run.workflowVersionId)
    ]);
    return { auth, run, steps, hitls, version };
  }

  router.post("/runs/:id/retry", authenticate, requirePermission("runs.control", "tasks.run"), asyncHandler(async (req, res) => {
    const ctx = await loadRunContext(req, res);
    if (!ctx) return;
    const { policies } = await policiesFor(ctx.auth);
    const controls = computeRunControls(ctx.run, ctx.steps, ctx.hitls, ctx.version?.workflow, ctx.auth, policies);
    if (!controls.canRetry) return fail(res, req, 409, "RETRY_NOT_ALLOWED", controls.reasons.retry || "This run cannot be retried.");
    const inputs = ((ctx.run.metadata as any)?.inputs || {}) as Record<string, unknown>;
    const retry = await store.createRun(ctx.auth, ctx.run.workflowVersionId, req.header("idempotency-key") ?? undefined, ctx.run.workerId, ctx.run.runMode, inputs);
    if (!retry.idempotentReplay) {
      await store.writeAudit(ctx.auth, "RUN_RETRIED", "execution_run", retry.id, { retry_of: ctx.run.id, workflow_version_id: ctx.run.workflowVersionId });
      triggerRun(retry.id);
    }
    res.status(202).json({ run: runSummary(retry), retryOf: ctx.run.id });
  }));

  router.get("/runs/:id/evidence", authenticate, requirePermission("runs.view", "tasks.run", "audit.read"), asyncHandler(async (req, res) => {
    const ctx = await loadRunContext(req, res);
    if (!ctx) return;
    const items: any[] = [];
    for (const step of ctx.steps) {
      const outputs = (step.metadata as any)?.outputs || {};
      const capturedAt = step.finishedAt ?? step.startedAt ?? undefined;
      if (typeof outputs.screenshotUrl === "string" && outputs.screenshotUrl.startsWith("data:image/")) {
        items.push({ stepId: step.stepId, kind: "screenshot", ...(capturedAt ? { capturedAt } : {}), contentType: outputs.screenshotUrl.slice(5, outputs.screenshotUrl.indexOf(";")), data: outputs.screenshotUrl });
      }
      if (outputs.outcome_verification) items.push({ stepId: step.stepId, kind: "verification", ...(capturedAt ? { capturedAt } : {}), contentType: "application/json", data: outputs.outcome_verification });
      if (typeof outputs.extractedText === "string") items.push({ stepId: step.stepId, kind: "extraction", ...(capturedAt ? { capturedAt } : {}), contentType: "text/plain", data: outputs.extractedText.slice(0, 20_000) });
    }
    res.json({ runId: ctx.run.id, workflowVersionId: ctx.run.workflowVersionId, items });
  }));

  router.get("/runs/:id/report", authenticate, requirePermission("runs.view", "tasks.run", "audit.read"), asyncHandler(async (req, res) => {
    const ctx = await loadRunContext(req, res);
    if (!ctx) return;
    const wf: any = ctx.version?.workflow;
    const report = {
      generatedAt: new Date().toISOString(),
      run: runSummary(ctx.run),
      workflowVersion: ctx.version ? versionSummary(ctx.version) : null,
      successCriteria: wf?.success_criteria || [],
      steps: ctx.steps.map(s => ({ stepId: s.stepId, state: s.state, startedAt: s.startedAt, finishedAt: s.finishedAt, message: (s.metadata as any)?.message || "" })),
      decisions: ctx.hitls.map(h => ({ id: h.id, stepId: h.workflowStepId, reason: h.reason, state: h.state, decision: h.decision, decidedBy: h.decidedBy, decidedAt: h.decidedAt })),
      result: ctx.run.resultSummary ?? null
    };
    if (req.query.download) res.setHeader("Content-Disposition", `attachment; filename="run-${ctx.run.id}.json"`);
    res.json(report);
  }));

  // ── Operations: service health and incidents ────────────────────────────────────────────────
  router.get("/ops/health", authenticate, requirePermission("ops.view"), asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const components: any[] = [{ name: "API", status: "ok", detail: `Up ${Math.round(process.uptime())}s` }];

    let runs: RunRow[] = [];
    const storeStart = Date.now();
    try {
      runs = await store.listRuns(auth);
      components.push({ name: "Database", status: "ok", detail: config.storageProvider === "memory" ? "In-memory store (development, not durable)" : "Supabase", latencyMs: Date.now() - storeStart });
    } catch (err: any) {
      components.push({ name: "Database", status: "down", detail: String(err?.message || err).slice(0, 200) });
    }

    const workerStart = Date.now();
    try {
      const resp = await fetch(`${workerBaseUrl}/health`, { signal: AbortSignal.timeout(1500) });
      const body: any = await resp.json().catch(() => ({}));
      components.push({ name: "Execution worker", status: resp.ok ? "ok" : "degraded", detail: resp.ok ? `${body.activeRuns ?? 0} active run(s)` : `HTTP ${resp.status}`, latencyMs: Date.now() - workerStart });
    } catch {
      components.push({ name: "Execution worker", status: "down", detail: `Not reachable at ${workerBaseUrl}` });
    }

    const configured = Boolean(config.openRouterApiKey && !config.openRouterApiKey.includes("placeholder"));
    if (!configured) {
      components.push({ name: "Model provider", status: "down", detail: "No model provider key is configured." });
    } else {
      const snapshot = OpenRouterQuotaManager.getInstance().getSnapshot();
      components.push({
        name: "Model provider",
        status: snapshot.state === "READY" ? "ok" : "degraded",
        detail: snapshot.state === "READY"
          ? `${config.openRouterVisionModel}; ${snapshot.requestsToday} request(s) today`
          : `${snapshot.state}${snapshot.circuitBreakerOpenUntil ? ` until ${snapshot.circuitBreakerOpenUntil}` : ""}`
      });
    }

    const now = Date.now();
    const byState: Record<string, number> = {};
    for (const r of runs) byState[r.state] = (byState[r.state] || 0) + 1;
    const queued = runs.filter(r => r.state === "QUEUED");
    const oldestQueuedSeconds = queued.length ? Math.round((now - Math.min(...queued.map(r => Date.parse(r.createdAt)))) / 1000) : null;
    const stuck = runs.filter(r => ["RUNNING", "STARTING", "RESUMING"].includes(r.state) && now - Date.parse(r.updatedAt) > 10 * 60_000);

    const hitls = await store.listHitlRequests(auth).catch(() => []);
    const incidents: any[] = [];
    for (const r of runs.filter(r => r.state === "FAILED" && now - Date.parse(r.updatedAt) < 24 * 3600_000)) {
      const outcome = runSummary(r).outcome;
      incidents.push({ kind: "RUN_FAILED", severity: "critical", message: outcome?.reason || "Run failed.", runId: r.id, at: r.updatedAt });
    }
    for (const r of stuck) incidents.push({ kind: "RUN_STUCK", severity: "warning", message: `No progress for ${Math.round((now - Date.parse(r.updatedAt)) / 60000)} minutes.`, runId: r.id, at: r.updatedAt });
    for (const h of hitls.filter(h => h.state === "PENDING" && now - Date.parse(h.createdAt) > 30 * 60_000)) {
      incidents.push({ kind: "APPROVAL_WAITING", severity: "warning", message: `Waiting for a decision since ${h.createdAt}.`, runId: h.runId, at: h.createdAt });
    }
    if (oldestQueuedSeconds !== null && oldestQueuedSeconds > 120) {
      incidents.push({ kind: "QUEUE_BACKLOG", severity: "warning", message: `Oldest queued run has waited ${oldestQueuedSeconds}s.`, at: new Date().toISOString() });
    }
    incidents.sort((a, b) => b.at.localeCompare(a.at));

    res.json({ checkedAt: new Date().toISOString(), components, queue: { byState, oldestQueuedSeconds, stuckRuns: stuck.map(r => r.id) }, incidents });
  }));

  // ── Organization admin ──────────────────────────────────────────────────────────────────────
  router.get("/org/members", authenticate, requirePermission("org.manage"), asyncHandler(async (req, res) => {
    const auth = req.auth!;
    if (config.nodeEnv !== "production") await store.ensureMember(auth);
    res.json({ members: await store.listMembers(auth), assignableRoles: ASSIGNABLE_ROLES });
  }));

  router.patch("/org/members/:userId", authenticate, requirePermission("org.manage"), asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const userId = p(req, "userId");
    const role = String(req.body?.role || "") as Role;
    if (!ASSIGNABLE_ROLES.includes(role)) return fail(res, req, 400, "INVALID_ROLE", `Role must be one of: ${ASSIGNABLE_ROLES.join(", ")}.`);
    if (userId === auth.userId) return fail(res, req, 409, "SELF_ROLE_CHANGE", "You cannot change your own role.");
    const members = await store.listMembers(auth);
    const target = members.find(m => m.userId === userId);
    if (!target) return fail(res, req, 404, "NOT_FOUND", "Member not found in this organization.");
    if ((role === "owner" || target.role === "owner") && auth.role !== "owner") return fail(res, req, 403, "FORBIDDEN", "Only an owner can grant or remove the owner role.");
    if (target.role === "owner" && role !== "owner" && members.filter(m => m.role === "owner").length <= 1) {
      return fail(res, req, 409, "LAST_OWNER", "The organization must keep at least one owner.");
    }
    const updated = await store.updateMemberRole(auth, userId, role);
    await store.writeAudit(auth, "MEMBER_ROLE_CHANGED", "organization_member", undefined, { user_id: userId, from: target.role, to: role });
    res.json({ member: { ...target, ...updated, role } });
  }));

  router.get("/org/policies", authenticate, requirePermission("org.view", "org.manage"), asyncHandler(async (req, res) => {
    res.json(await policiesFor(req.auth!));
  }));

  router.patch("/org/policies", authenticate, requirePermission("org.manage"), asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { value, errors } = validatePolicyPatch(req.body);
    if (Object.keys(errors).length) return fail(res, req, 400, "INVALID_POLICY", "Some policies are invalid.", { fields: errors });
    const { policies: current } = await policiesFor(auth);
    const next = { ...current, ...value };
    const updatedAt = new Date().toISOString();
    await store.updateOrgSettings(auth, { policies: next, policiesUpdatedAt: updatedAt });
    await store.writeAudit(auth, "POLICIES_UPDATED", "organization", undefined, { changes: value });
    res.json({ policies: next, updatedAt });
  }));

  router.get("/org/usage", authenticate, requirePermission("org.view"), asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const periodDays = 30;
    const since = Date.now() - periodDays * 86_400_000;
    const [runs, workers, versions, hitls] = await Promise.all([
      store.listRuns(auth), store.listGhostWorkers(auth), store.listWorkflows(auth), store.listHitlRequests(auth)
    ]);
    const recent = runs.filter(r => Date.parse(r.createdAt) >= since);
    const byState: Record<string, number> = {};
    const byOutcome: Record<string, number> = {};
    for (const r of recent) {
      byState[r.state] = (byState[r.state] || 0) + 1;
      const c = runSummary(r).outcome?.classification;
      if (c) byOutcome[c] = (byOutcome[c] || 0) + 1;
    }
    const snapshot = OpenRouterQuotaManager.getInstance().getSnapshot();
    res.json({
      periodDays,
      runs: { total: recent.length, byState, byOutcome },
      workflowVersions: versions.filter(v => Date.parse(v.createdAt) >= since).length,
      publishedTasks: workers.filter(w => w.publishedVersionId).length,
      pendingApprovals: hitls.filter(h => h.state === "PENDING").length,
      provider: { configured: Boolean(config.openRouterApiKey), state: snapshot.state, requestsToday: snapshot.requestsToday, model: config.openRouterVisionModel }
    });
  }));

  // ── Audit ───────────────────────────────────────────────────────────────────────────────────
  router.get("/audit/events", authenticate, requirePermission("audit.read"), asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const q = req.query as Record<string, string | undefined>;
    const from = q.from ? Date.parse(q.from) : undefined;
    const to = q.to ? Date.parse(q.to) : undefined;
    const limit = Math.min(Math.max(Number(q.limit) || 200, 1), 1000);
    const events = (await store.listAudits(auth))
      .filter(e => !q.action || e.action === q.action)
      .filter(e => !q.resource_id || e.resourceId === q.resource_id)
      .filter(e => !q.actor_id || e.actorId === q.actor_id)
      .filter(e => from === undefined || Date.parse(e.createdAt) >= from)
      .filter(e => to === undefined || Date.parse(e.createdAt) <= to)
      .slice(0, limit)
      .map(({ tenantId, ...e }) => e);
    res.json({ events });
  }));

  router.get("/audit/runs/export", authenticate, requirePermission("audit.export"), asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const q = req.query as Record<string, string | undefined>;
    const format = q.format === "json" ? "json" : "csv";
    const from = q.from ? Date.parse(q.from) : undefined;
    const to = q.to ? Date.parse(q.to) : undefined;
    const [runs, workers, hitls] = await Promise.all([store.listRuns(auth), store.listGhostWorkers(auth), store.listHitlRequests(auth)]);
    const names = new Map(workers.map(w => [w.id, w.name]));
    const rows = runs
      .filter(r => !q.state || r.state === q.state)
      .filter(r => from === undefined || Date.parse(r.createdAt) >= from)
      .filter(r => to === undefined || Date.parse(r.createdAt) <= to)
      .map(r => {
        const outcome = runSummary(r).outcome;
        const decisions = hitls.filter(h => h.runId === r.id && h.decision);
        return {
          run_id: r.id, worker_id: r.workerId ?? "", worker_name: (r.workerId && names.get(r.workerId)) || "",
          workflow_version_id: r.workflowVersionId, state: r.state, outcome: outcome?.classification ?? "",
          launched_by: r.createdBy ?? "", created_at: r.createdAt, updated_at: r.updatedAt,
          decisions: decisions.map(h => `${h.decision}:${h.decidedBy ?? ""}`).join(" ")
        };
      });
    await store.writeAudit(auth, "AUDIT_EXPORTED", "execution_run", undefined, { format, rows: rows.length });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    if (format === "json") {
      res.setHeader("Content-Disposition", `attachment; filename="runs-${stamp}.json"`);
      return res.json({ exportedAt: new Date().toISOString(), rows });
    }
    const headers = ["run_id", "worker_id", "worker_name", "workflow_version_id", "state", "outcome", "launched_by", "created_at", "updated_at", "decisions"];
    const escape = (v: unknown) => {
      const s = String(v ?? "");
      // Neutralise spreadsheet formula injection and quote every field.
      const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const csv = [headers.join(","), ...rows.map(r => headers.map(h => escape((r as any)[h])).join(","))].join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="runs-${stamp}.csv"`);
    res.send(csv);
  }));

  return router;
}
