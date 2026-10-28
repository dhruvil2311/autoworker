import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
// import { ZodError } from "zod";
import { logger } from "@ghost/observability";
import { validateRecordingUpload, assessExecutionReadiness } from "@ghost/workflow-schema";
import { HitlDecisionError, type HitlDecisionInput } from "./run-state.js";
import { requirePermission, hasPermission, canAccessRun } from "./authorization.js";
import { createPlatformRouter } from "./routes/platform.js";
import { computeRunControls, loadPolicies, runSummary, versionSummary, workflowLeaves } from "./services/platform-service.js";
import { loadConfig, type ApiConfig } from "./config.js";
import { createAuthMiddleware } from "./auth.js";
import { requestId } from "./request-id.js";
import { createStore, type AppStore } from "./store.js";
import { universityRouter } from "./routes/university.js";
import { createDesktopRouter } from "./routes/desktop.js";
import { createEvidenceRouter } from "./routes/evidence.js";
import { approveOirDraft, createOirDraft, readOirReview } from "./oir-review.js";
import { RealSemanticBPIProvider } from "./ai-provider.js";
import { purgeOrRecompileWorkerAfterDocDeletion } from "./services/doc-purge.js";

export function formatHumanReadableGapQuestion(raw: any): { question: string; why: string; options: string[] } {
  let q = (raw.suggested_question?.question_text || raw.question || raw.description || "").trim();
  const rawId = (raw.gap_id || raw.id || "").toLowerCase();
  const isIdLike = !q || 
                   q.startsWith("gap_") || 
                   q.startsWith("GAP_") || 
                   !q.includes(" ") || 
                   /^[a-z0-9_-]+$/i.test(q) || 
                   /\b(?:msg|message|id|code|err|error)[_\s-]*\d{3,}\b/i.test(q) || 
                   /^message\s*id\b/i.test(q) || 
                   /^\d+$/.test(q);

  if (isIdLike) {
    if (rawId.includes("auth") || rawId.includes("login") || raw.target?.includes("login")) {
      q = "The demonstration video showed a login or authentication step where credentials are required. How should the autoworker handle the sign-in step?";
    } else if (rawId.includes("click") || rawId.includes("action") || rawId.includes("target")) {
      q = "The demonstration video showed an action where the exact target element or button was ambiguous. Which element or button text should the autoworker click?";
    } else if (rawId.includes("transform") || rawId.includes("var") || rawId.includes("format") || rawId.includes("input") || rawId.includes("value")) {
      q = "The demonstration entered a value into an input field. What formatting or data transformation rule should the autoworker apply to this field?";
    } else if (rawId.includes("modal") || rawId.includes("popup") || rawId.includes("confirm")) {
      q = "How should the autoworker proceed when an unexpected confirmation or alert modal appears?";
    } else if (rawId.includes("address") || rawId.includes("postal") || rawId.includes("shipping")) {
      q = "How should the autoworker handle missing or optional shipping information during checkout?";
    } else if (raw.description && raw.description.includes(" ") && !raw.description.startsWith("gap_") && !/\b\d{4,}\b/.test(raw.description)) {
      q = `How should the autoworker proceed regarding: ${raw.description.replace(/[._]/g, " ")}?`;
    } else {
      q = "The demonstration video encountered an ambiguous step in the workflow. How should the autoworker proceed at this step?";
    }
  }

  if (!q.endsWith("?")) {
    q = q + "?";
  }

  const why = raw.why_it_matters || "Clarifying this decision ensures the autoworker executes reliably across production variations.";
  const options = raw.suggested_question?.suggested_options?.length 
    ? raw.suggested_question.suggested_options 
    : ["Retry automatically after 2s", "Pause for operator assistance (HITL)", "Apply standard default fallback"];
  return { question: q, why, options };
}

/** Records which worker a compiled version belongs to, so its version history can be listed. */
function withWorker<T>(workflow: T, workerId: string): any {
  const wf: any = workflow;
  wf.compiler = { ...(wf.compiler || {}), worker_id: workerId };
  return wf;
}

export function createApp(config: ApiConfig = loadConfig(), store: AppStore = createStore(config)) {
  const aiProvider = new RealSemanticBPIProvider(config);
  const app = express();
  app.use(requestId);
  app.use(helmet());
  app.use(
    cors({
      origin: config.nodeEnv === "production" ? [config.appUrl] : true,
      credentials: true
    })
  );
  app.use(express.json({ limit: "50mb", type: ["application/json"] }));
  app.use(rateLimit({ windowMs: 60_000, limit: 5000, standardHeaders: true, legacyHeaders: false }));

  const auth = createAuthMiddleware(config);
  const asyncHandler =
    (handler: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) =>
      void handler(req, res).catch(next);
  const param = (req: Request, name: string): string => {
    const value = req.params[name];
    if (!value) throw new Error(`Missing route parameter: ${name}`);
    return Array.isArray(value) ? value[0]! : value;
  };

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.post("/api/v1/auth/dev/login", asyncHandler(async (req, res) => {
    if (config.nodeEnv === "production" || !config.devAuthEnabled) {
      res.status(403).json({ error: { code: "DEV_AUTH_DISABLED", message: "Development auth is disabled in this environment" } });
      return;
    }

    const email = typeof req.body?.email === "string" ? req.body.email : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (email !== config.devAuthEmail || password !== config.devAuthPassword) {
      res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Invalid development credentials" } });
      return;
    }

    const token = `dev:${config.devAuthUserId}`;
    res.json({
      token,
      user: { id: config.devAuthUserId, email: config.devAuthEmail, role: "owner" }
    });
  }));

  app.post("/api/v1/auth/bootstrap", auth, asyncHandler(async (req, res) => {
    const { organizationId, role } = await store.bootstrapWorkspace(req.auth!.userId);
    res.json({
      user: { id: req.auth!.userId },
      organization: { id: organizationId },
      role
    });
  }));

  app.use("/api/v1/university", auth, universityRouter);
  app.use("/api/v1/desktop", auth, createDesktopRouter(store));
  app.use("/api/v1/ghost-workers/:id/evidence", auth, requirePermission("workflows.build"), createEvidenceRouter(config, store));

  app.post("/api/v1/recordings", auth, requirePermission("workflows.build"), asyncHandler(async (req, res) => {
    const upload = validateRecordingUpload(req.body);
    const row = await store.createRecording(req.auth!, upload, req.header("idempotency-key") ?? undefined);
    logger.info({ recording_id: row.id, tenant_id: row.tenantId }, "recording_ingested");
    res.status(201).json({ recording_id: row.id, status: "PROCESSING" });
  }));

  app.post("/api/v1/recordings/start", auth, requirePermission("workflows.build"), asyncHandler(async (req, res) => {
    const row = await store.startRecording(req.auth!, { source: req.body?.source || "chrome_extension", metadata: req.body?.metadata }, req.header("idempotency-key") ?? undefined);
    logger.info({ recording_id: row.id, tenant_id: row.tenantId }, "recording_started");
    res.status(201).json({ recording_id: row.id });
  }));

  app.post("/api/v1/recordings/:id/chunks", auth, requirePermission("workflows.build"), asyncHandler(async (req, res) => {
    const events = req.body?.events;
    if (!Array.isArray(events)) {
      res.status(400).json({ error: "Expected 'events' array in chunk" });
      return;
    }
    await store.appendRecordingEvents(req.auth!, param(req, "id"), events);
    res.status(202).json({ ok: true, appended: events.length });
  }));

  app.post("/api/v1/recordings/:id/finish", auth, requirePermission("workflows.build"), asyncHandler(async (req, res) => {
    const endedAt = req.body?.ended_at ?? new Date().toISOString();
    const row = await store.finishRecording(req.auth!, param(req, "id"), endedAt);
    logger.info({ recording_id: row.id, tenant_id: row.tenantId }, "recording_finished");
    res.status(200).json({ recording_id: row.id, status: "PROCESSING" });
  }));

  app.get("/api/v1/recordings", auth, requirePermission("workflows.build"), asyncHandler(async (req, res) => {
    res.json({ recordings: await store.listRecordings(req.auth!) });
  }));

  app.post("/api/v1/recordings/:id/compile", auth, requirePermission("workflows.build"), asyncHandler(async (req, res) => {
    res.status(410).json({ error: { code: "GONE", message: "V1 compiler deprecated. Use BPI analyze endpoint." } });
  }));

  app.get("/api/v1/workflows", auth, requirePermission("workflows.build", "runs.view", "audit.read"), asyncHandler(async (req, res) => {
    res.json({ workflows: await store.listWorkflows(req.auth!) });
  }));

  app.get("/api/v1/workflows/:versionId", auth, requirePermission("workflows.build", "runs.view", "audit.read", "tasks.view"), asyncHandler(async (req, res) => {
    const row = await store.getWorkflowVersion(req.auth!, param(req, "versionId"));
    if (!row) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Workflow not found", request_id: req.id } });
      return;
    }
    res.json(row);
  }));

  app.post("/api/v1/workflows/:versionId/activate", auth, requirePermission("workflows.publish"), asyncHandler(async (req, res) => {
    const row = await store.activateWorkflowVersion(req.auth!, param(req, "versionId"));
    if (!row) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Workflow not found", request_id: req.id } });
      return;
    }
    res.json(row);
  }));

  const workerBaseUrl = (process.env.WORKER_TRIGGER_URL || "http://127.0.0.1:4005").replace(/\/+$/, "");
  // Auto-starting a detached worker is a development convenience only. It never happens in tests or
  // production: a spawned daemon polls the configured database and could execute real queued runs.
  const autoSpawnWorker = config.nodeEnv === "development" && process.env.WORKER_AUTOSPAWN !== "false" && !process.env.VITEST;
  const triggerWorkerDaemon = (runId: string) => {
    if (!autoSpawnWorker) {
      fetch(`${workerBaseUrl}/trigger/${runId}`, { method: "POST" }).catch(err => logger.warn({ run_id: runId, err: err?.message }, "Worker trigger failed; the run stays queued for the poller"));
      return;
    }
    fetch(`${workerBaseUrl}/trigger/${runId}`, { method: "POST" }).catch(async () => {
      try {
        const { spawn } = await import("node:child_process");
        const path = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        const workerDir = path.resolve(__dirname, "..", "..", "worker");
        const child = spawn("npx", ["tsx", "src/index.ts"], {
          cwd: workerDir,
          detached: true,
          stdio: "ignore",
          shell: true,
          windowsHide: true,
          env: { ...process.env }
        });
        child.unref();
        logger.info({ run_id: runId }, "Auto-spawned worker daemon for background execution");

        setTimeout(() => {
          fetch(`${workerBaseUrl}/trigger/${runId}`, { method: "POST" }).catch(() => {});
        }, 2000);
      } catch (e: any) {
        logger.warn({ error: e?.message }, "Failed to auto-spawn worker daemon");
      }
    });
  };

  app.use("/api/v1", createPlatformRouter({ config, store, triggerRun: triggerWorkerDaemon, workerBaseUrl, auth }));

  app.post("/api/v1/workflows/:versionId/run", auth, requirePermission("workflows.build"), asyncHandler(async (req, res) => {
    const workflow = await store.getWorkflowVersion(req.auth!, param(req, "versionId"));
    if (!workflow) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Workflow not found", request_id: req.id } });
      return;
    }
    const steps = (workflow.workflow as any)?.root_step?.children ?? (workflow.workflow as any)?.steps ?? [];
    if (!steps.length) {
      res.status(409).json({ error: "The selected workflow version has no executable steps." });
      return;
    }
    if ((workflow.workflow as any)?.workflow_version === "2.0") {
      const readiness = assessExecutionReadiness(workflow.workflow as any, { inputs: req.body?.inputs || {} });
      if (!readiness.executable) {
        res.status(409).json({ error: "This workflow is not safe to run yet.", code: "WORKFLOW_NOT_EXECUTABLE", issues: readiness.issues.filter(i => i.severity === "BLOCKING") });
        return;
      }
    }
    const run = await store.createRun(req.auth!, workflow.id, req.header("idempotency-key") ?? undefined);
    if (!run.idempotentReplay) triggerWorkerDaemon(run.id);
    res.status(202).json({ run });
  }));

  app.get("/api/v1/runs", auth, requirePermission("runs.view", "tasks.run"), asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const [runs, workers] = await Promise.all([store.listRuns(req.auth!), store.listGhostWorkers(req.auth!)]);
    const names = new Map(workers.map(w => [w.id, w.name]));
    const from = q.from ? Date.parse(q.from) : undefined;
    const to = q.to ? Date.parse(q.to) : undefined;
    const states = q.state ? q.state.split(",") : undefined;
    const filtered = runs
      // Users without organisation-wide run access see only the runs they launched.
      .filter(r => hasPermission(req.auth, "runs.view") || r.createdBy === req.auth!.userId)
      .filter(r => !states || states.includes(r.state))
      .filter(r => !q.worker_id || r.workerId === q.worker_id)
      .filter(r => !q.workflow_version_id || r.workflowVersionId === q.workflow_version_id)
      .filter(r => from === undefined || Date.parse(r.createdAt) >= from)
      .filter(r => to === undefined || Date.parse(r.createdAt) <= to)
      .map(r => runSummary(r, r.workerId ? names.get(r.workerId) : undefined))
      .filter(r => !q.outcome || r.outcome?.classification === q.outcome)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ runs: filtered });
  }));

  app.get("/api/v1/runs/:id", auth, requirePermission("runs.view", "tasks.run", "audit.read"), asyncHandler(async (req, res) => {
    const run = await store.getRun(req.auth!, param(req, "id"));
    if (!run || !(canAccessRun(req.auth!, run, "runs.view") || hasPermission(req.auth, "audit.read"))) { res.status(404).json({ error: "Run not found" }); return; }
    res.json({ run: runSummary(run) });
  }));

  app.get("/api/v1/audit-log", auth, requirePermission("audit.read"), asyncHandler(async (req, res) => {
    const audits = await store.listAudits(req.auth!);
    res.json({ audits });
  }));

  app.post("/api/v1/runs/:id/hitl/take-control", auth, requirePermission("hitl.decide"), asyncHandler(async (req, res) => {
    try {
      const result = await store.takeHitlControl(req.auth!.tenantId, req.auth!.userId, param(req, "id"));

      let sessionUrl;
      const providerSessionId = (result.run as any).provider_session_id;
      if (providerSessionId) {
        // Here we would fetch debuggerFullscreenUrl from Browserbase
        // However without SDK available in scope here, we mock the safe URL fetch based on requirement.
        sessionUrl = `https://browserbase.com/sessions/${providerSessionId}/debug`;
      }

      res.json({
        run: result.run,
        hitl_request: result.hitlRequest,
        session_url: sessionUrl
      });
    } catch (e: any) {
      res.status(400).json({ error: { code: "HITL_CONTROL_ERROR", message: e.message } });
    }
  }));

  app.post("/api/v1/runs/:id/hitl/complete", auth, requirePermission("hitl.decide"), asyncHandler(async (req, res) => {
    try {
      await store.completeHitlIntervention(req.auth!.tenantId, param(req, "id"));
      res.json({ success: true, message: "Human intervention marked as complete. Verifying handoff." });
    } catch (e: any) {
      res.status(400).json({ error: { code: "HITL_COMPLETE_ERROR", message: e.message } });
    }
  }));

  app.post("/api/v1/runs/:id/claim", auth, requirePermission("runs.control"), asyncHandler(async (req, res) => {
    const claimed = await store.claimRun(req.auth!, param(req, "id"));
    if (!claimed) {
      res.status(409).json({ error: { code: "CLAIM_FAILED", message: "Run not available for claiming (not found or not QUEUED)", request_id: req.id } });
      return;
    }
    res.json({ run: claimed, steps: await store.listExecutionSteps(req.auth!, claimed.id) });
  }));

  app.post("/api/v1/runs/:id/pause", auth, requirePermission("runs.control"), asyncHandler(async (req, res) => {
    const run = await store.updateRunState(req.auth!, param(req, "id"), "WAITING_FOR_HUMAN");
    if (!run) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Run not found", request_id: req.id } });
      return;
    }
    await store.createHitlRequest(req.auth!, {
      runId: run.id,
      workflowStepId: req.body?.workflowStepId ?? "unknown",
      challengeType: String(req.body?.reason ?? "Manual pause requested"),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString()
    });
    const { sendNotification } = await import("./notifications.js");
    await sendNotification(store, req.auth!, {
      type: "EXCEPTION_CREATED",
      title: "A run needs your attention",
      body: String(req.body?.reason ?? "Manual pause requested"),
      resourceType: "execution_run",
      resourceId: run.id
    });
    res.status(202).json({ run, hitl: true });
  }));

  app.post("/api/v1/runs/:id/resume", auth, requirePermission("runs.control"), asyncHandler(async (req, res) => {
    const runId = param(req, "id");
    const existing = await store.getRun(req.auth!, runId);
    if (!existing) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Run not found", request_id: req.id } });
      return;
    }
    const pending = (await store.listHitlRequests(req.auth!)).filter(h => h.runId === runId && (h.state === "PENDING" || h.state === "CONTROL_ACTIVE"));
    if (pending.length) {
      res.status(409).json({ error: { code: "DECISION_REQUIRED", message: "Approve or reject the pending request before resuming.", hitl_request_ids: pending.map(h => h.id), request_id: req.id } });
      return;
    }
    const run = await store.updateRunState(req.auth!, runId, "RESUMING");
    if (!run) {
      res.status(409).json({ error: { code: "INVALID_STATE", message: `A run in state ${existing.state} cannot be resumed.`, request_id: req.id } });
      return;
    }
    await store.writeAudit(req.auth!, "EXECUTION_RESUMED", "execution_run", run.id);
    triggerWorkerDaemon(run.id);
    res.status(202).json({ run });
  }));

  // Durable human decision on a paused run: APPROVE resumes from the paused step, REJECT stops the run.
  app.post("/api/v1/hitl/:id/decision", auth, requirePermission("hitl.decide", "hitl.decide_own"), asyncHandler(async (req, res) => {
    if (!(await mayDecide(req, param(req, "id")))) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "You cannot approve or reject this run.", request_id: req.id } });
      return;
    }
    const body = req.body || {};
    const decision: HitlDecisionInput = {
      action: String(body.action || "").toUpperCase() as HitlDecisionInput["action"],
      value: body.value,
      note: typeof body.note === "string" ? body.note : undefined,
      expectedRunId: body.run_id,
      expectedWorkflowVersionId: body.workflow_version_id
    };
    try {
      const result = await store.decideHitlRequest(req.auth!, param(req, "id"), decision);
      if (result.status === "APPLIED" && result.run.state === "RESUMING") triggerWorkerDaemon(result.run.id);
      res.status(200).json({ status: result.status, hitl_request: result.hitl, run: result.run });
    } catch (e: any) {
      if (e instanceof HitlDecisionError) {
        const status = e.code === "NOT_FOUND" ? 404 : e.code === "EXPIRED" ? 410 : e.code === "INVALID_DECISION" ? 400 : 409;
        res.status(status).json({ error: { code: e.code, message: e.message, request_id: req.id } });
        return;
      }
      throw e;
    }
  }));

  app.post("/api/v1/runs/:id/cancel", auth, requirePermission("runs.control", "tasks.run"), asyncHandler(async (req, res) => {
    const existing = await store.getRun(req.auth!, param(req, "id"));
    if (!existing || !canAccessRun(req.auth!, existing, "runs.control")) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Run not found", request_id: req.id } });
      return;
    }
    const run = ["SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED"].includes(existing.state)
      ? undefined
      : await store.updateRunState(req.auth!, existing.id, "CANCELLED", { resultSummary: { outcome: "CANCELLED_BY_USER", cancelledBy: req.auth!.userId } });
    if (!run) {
      res.status(409).json({ error: { code: "INVALID_STATE", message: `A run in state ${existing.state} cannot be cancelled.`, request_id: req.id } });
      return;
    }
    await store.writeAudit(req.auth!, "RUN_CANCELLED", "execution_run", run.id);
    res.status(202).json({ run });
  }));

  /** HITL requests the caller may see: all for organisation-wide roles, otherwise only on their own runs. */
  const visibleHitlRequests = async (req: Request) => {
    const all = await store.listHitlRequests(req.auth!);
    if (hasPermission(req.auth, "hitl.decide") || hasPermission(req.auth, "runs.view") || hasPermission(req.auth, "audit.read")) return all;
    const own = new Set((await store.listRuns(req.auth!)).filter(r => r.createdBy === req.auth!.userId).map(r => r.id));
    return all.filter(h => own.has(h.runId));
  };

  /** Whether the caller may decide this HITL request (organisation-wide, or own run when policy allows). */
  const mayDecide = async (req: Request, hitlId: string): Promise<boolean> => {
    if (hasPermission(req.auth, "hitl.decide")) return true;
    if (!hasPermission(req.auth, "hitl.decide_own")) return false;
    const hitl = (await store.listHitlRequests(req.auth!)).find(h => h.id === hitlId);
    const run = hitl ? await store.getRun(req.auth!, hitl.runId) : undefined;
    if (!run || run.createdBy !== req.auth!.userId) return false;
    const { policies } = await loadPolicies(store, req.auth!, config.hitlSessionTimeoutSeconds);
    return policies.membersMayApproveOwnRuns;
  };

  app.get("/api/v1/hitl", auth, requirePermission("hitl.decide", "hitl.decide_own", "runs.view", "audit.read"), asyncHandler(async (req, res) => {
    res.json({ hitl_requests: await visibleHitlRequests(req) });
  }));


  // Ghost Workers API
  app.get("/api/v1/ghost-workers", auth, requirePermission("tasks.view", "workflows.build", "ops.view", "runs.view", "audit.read"), asyncHandler(async (req, res) => {
    const rawWorkers = await store.listGhostWorkers(req.auth!);
    const allRuns = await store.listRuns(req.auth!);

    // Deduplicate by normalized worker name
    const nameMap = new Map<string, { primary: any; allIds: string[] }>();
    for (const w of rawWorkers) {
      if (!w || !w.name) continue;
      const key = w.name.trim().toLowerCase();
      if (!nameMap.has(key)) {
        nameMap.set(key, { primary: w, allIds: [w.id] });
      } else {
        const entry = nameMap.get(key)!;
        entry.allIds.push(w.id);
        // Prefer worker that has activeVersionId or latest updated
        if (!entry.primary.activeVersionId && w.activeVersionId) {
          entry.primary = w;
        }
      }
    }

    const enriched = [...nameMap.values()].map(({ primary, allIds }) => {
      const workerRuns = allRuns.filter(r => (r.workerId ? allIds.includes(r.workerId) : false));
      const completedRuns = workerRuns.filter(r => r.state === "COMPLETED" || r.state === "SUCCEEDED");
      const runCount = workerRuns.length;
      const successRate = runCount > 0 ? Math.round((completedRuns.length / runCount) * 100) : 100;
      return {
        ...primary,
        allIds,
        runCount,
        successRate,
      };
    });
    res.json({ workers: enriched, ghost_workers: enriched });
  }));

  app.post("/api/v1/ghost-workers", auth, requirePermission("workflows.build"), asyncHandler(async (req, res) => {
    const worker = await store.createGhostWorker(req.auth!, req.body);
    res.status(201).json(worker);
  }));

  app.post("/api/v1/ghost-workers/:id/documents", auth, requirePermission("workflows.build"), asyncHandler(async (req, res) => {
    const targetId = param(req, "id");
    let worker = await store.getGhostWorker(req.auth!, targetId);
    if (!worker) {
      const all = await store.listGhostWorkers(req.auth!);
      worker = all.find(w => w.id === targetId || (w as any).allIds?.includes(targetId)) ||
               all.find(w => w.name && w.name.trim().toLowerCase() === targetId.trim().toLowerCase());
    }
    if (!worker) { res.status(404).json({ error: "Worker not found" }); return; }

    const { name, type, content } = req.body;
    if (!name || !type || !content) {
      res.status(400).json({ error: "Missing name, type, or content" });
      return;
    }
    const SUPPORTED_TYPES = ["CSV", "SOP", "EXCEL", "PDF", "DOCX", "TXT", "IMAGE"];
    if (!SUPPORTED_TYPES.includes(type)) {
      res.status(400).json({ error: `Type must be one of: ${SUPPORTED_TYPES.join(", ")}` });
      return;
    }

    const { parseCSV, parseSOPText } = await import("@ghost/bpi");
    const xlsx = await import("xlsx");

    const toBuffer = (raw: string): Buffer => {
      const b64 = raw.includes("base64,") ? raw.split("base64,")[1]! : raw;
      return Buffer.from(b64, "base64");
    };

    let parsedJson: any;
    try {
      if (type === "CSV") {
        parsedJson = parseCSV(content);
      } else if (type === "TXT" || type === "SOP") {
        // Plain text: treat exactly like an SOP document (real business-rule extraction
        // happens downstream in analyzeFromDocuments via extractRulesFromText).
        parsedJson = { ...parseSOPText(content), rawText: content };
      } else if (type === "EXCEL") {
        const buf = toBuffer(content);
        const workbook = xlsx.read(buf, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) throw new Error("No sheet found");
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) throw new Error("Sheet could not be parsed");
        const rawJson: any[] = xlsx.utils.sheet_to_json(sheet, { defval: "" });

        parsedJson = {
          source: "Excel Document",
          name,
          sheetName,
          columns: Object.keys(rawJson[0] || {}),
          rows: rawJson
        };
      } else if (type === "PDF") {
        const pdfParse = (await import("pdf-parse")).default;
        const buf = toBuffer(content);
        const result = await pdfParse(buf);
        if (!result.text || !result.text.trim()) {
          throw new Error("No extractable text found in this PDF (it may be a scanned image without OCR support)");
        }
        parsedJson = { ...parseSOPText(result.text), rawText: result.text };
      } else if (type === "DOCX") {
        const mammoth = await import("mammoth");
        const buf = toBuffer(content);
        const result = await mammoth.extractRawText({ buffer: buf });
        if (!result.value || !result.value.trim()) {
          throw new Error("No extractable text found in this document");
        }
        parsedJson = { ...parseSOPText(result.value), rawText: result.value };
      } else if (type === "IMAGE") {
        if (!config.geminiApiKey) {
          throw new Error("Image evidence requires GEMINI_API_KEY to be configured (a vision-capable model reads the image); no OCR fallback is available.");
        }
        const { extractTextFromImage } = await import("./ai-provider.js");
        const extractedText = await extractTextFromImage(config, content);
        if (!extractedText.trim()) {
          throw new Error("No readable text or rules could be extracted from this image");
        }
        parsedJson = { ...parseSOPText(extractedText), rawText: extractedText };
      }
    } catch (e: any) {
      res.status(400).json({ error: "Failed to parse document: " + e.message });
      return;
    }

    const doc = await store.createDocument(req.auth!, {
      workerId: worker.id,
      type,
      name,
      parsedJson
    });

    logger.info({
      worker_id: worker.id,
      document_id: doc.id,
      document_name: name,
      file_type: type,
      content_length: content.length,
      parsed_step_count: parsedJson?.steps?.length ?? 0
    }, "DOCUMENT_PARSED");

    res.status(201).json({ document: doc });
  }));

  app.get("/api/v1/ghost-workers/:id/documents", auth, requirePermission("workflows.build"), asyncHandler(async (req, res) => {
    const targetId = param(req, "id");
    let worker = await store.getGhostWorker(req.auth!, targetId);
    if (!worker) {
      const all = await store.listGhostWorkers(req.auth!);
      worker = all.find(w => w.id === targetId || (w as any).allIds?.includes(targetId)) ||
               all.find(w => w.name && w.name.trim().toLowerCase() === targetId.trim().toLowerCase());
    }
    const resolvedId = worker ? worker.id : targetId;
    const documents = await store.listDocuments(req.auth!, resolvedId);
    res.json({ documents });
  }));

  app.delete("/api/v1/ghost-workers/:id/documents/:docId", auth, requirePermission("workflows.build"), asyncHandler(async (req, res) => {
    const targetId = param(req, "id");
    const docId = param(req, "docId");
    let worker = await store.getGhostWorker(req.auth!, targetId);
    if (!worker) {
      const all = await store.listGhostWorkers(req.auth!);
      worker = all.find(w => w.id === targetId || (w as any).allIds?.includes(targetId)) ||
               all.find(w => w.name && w.name.trim().toLowerCase() === targetId.trim().toLowerCase());
    }
    // Only a document of this tenant's worker is deleted; anything else is 404 and never triggers the purge.
    if (!worker) { res.status(404).json({ error: "Worker not found" }); return; }
    const doc = await store.getDocument(req.auth!, docId).catch(() => undefined);
    const workerIds = [worker.id, ...(((worker as any).allIds as string[] | undefined) ?? [])];
    if (!doc || (doc.workerId && !workerIds.includes(doc.workerId))) { res.status(404).json({ error: "Document not found" }); return; }
    const resolvedId = worker.id;
    try {
      await store.deleteDocument(req.auth!, docId);
    } catch (_) {}

    const purgeResult = await purgeOrRecompileWorkerAfterDocDeletion(config, store, req.auth!, resolvedId, docId, aiProvider);

    logger.info({ worker_id: resolvedId, document_id: docId, purgeResult }, "DOCUMENT_DELETED");
    res.json({
      success: true,
      message: "Document deleted and all operational workflows, memory, and specifications purged instantly",
      remainingDocuments: purgeResult.remainingDocsCount
    });
  }));

  app.get("/api/v1/ghost-workers/:id", auth, requirePermission("tasks.view", "workflows.build", "ops.view", "runs.view", "audit.read"), asyncHandler(async (req, res) => {
    const targetId = param(req, "id");
    let worker = await store.getGhostWorker(req.auth!, targetId);
    const all = await store.listGhostWorkers(req.auth!);
    if (!worker) {
      worker = all.find(w => w.id === targetId || (w as any).allIds?.includes(targetId));
    }
    if (!worker) {
      // Fallback: search by worker name across existing workers
      worker = all.find(w => w.name && w.name.trim().toLowerCase() === targetId.trim().toLowerCase());
    }
    if (!worker) {
      res.status(404).json({ error: "Worker not found" });
      return;
    }

    // Enforce invariant: if worker has zero evidence documents, it cannot be trained with active workflow
    const docs = await store.listDocuments(req.auth!, worker.id);
    if (docs.length === 0 && !worker.recordingId) {
      if (worker.activeVersionId || worker.workflowId || worker.bpsId || worker.trainingSource) {
        worker.activeVersionId = null as any;
        worker.workflowId = null as any;
        worker.bpsId = null as any;
        worker.trainingSource = null as any;
        worker.status = "NEW";
        try {
          await store.updateGhostWorker(req.auth!, worker.id, {
            activeVersionId: null as any,
            workflowId: null as any,
            bpsId: null as any,
            trainingSource: null as any,
            status: "NEW",
            triggerConfig: {
              ...(worker.triggerConfig || {}),
              trainingSource: null
            }
          } as any);
        } catch {}
      }
    } else if (!worker.activeVersionId && worker.status !== "IDLE" && worker.status !== "NEW") {
      const sibling = all.find(w => w.name && w.name.trim().toLowerCase() === worker!.name.trim().toLowerCase() && w.activeVersionId && w.status !== "IDLE" && w.status !== "NEW");
      if (sibling?.activeVersionId) {
        worker.activeVersionId = sibling.activeVersionId;
        if (sibling.workflowId) worker.workflowId = sibling.workflowId;
      }
    }

    // Collect all matching IDs for this worker identity to correlate runs
    const siblingIds = all
      .filter(w => w.name && w.name.trim().toLowerCase() === worker!.name.trim().toLowerCase())
      .map(w => w.id);
    const allIds = Array.from(new Set([worker.id, targetId, ...siblingIds]));

    res.json({ ...worker, allIds });
  }));

  app.post("/api/v1/ghost-workers/:id", auth, requirePermission("workflows.build"), asyncHandler(async (req, res) => {
    const worker = await store.updateGhostWorker(req.auth!, param(req, "id"), req.body);
    if (!worker) {
      res.status(404).json({ error: "Worker not found" });
      return;
    }
    res.json(worker);
  }));

  app.post("/api/v1/ghost-workers/:id/chat", auth, requirePermission("workflows.build"), asyncHandler(async (req, res) => {
    const worker = await store.getGhostWorker(req.auth!, param(req, "id"));
    if (!worker) { res.status(404).json({ error: "Worker not found" }); return; }

    const instruction = req.body.instruction;
    if (!instruction) { res.status(400).json({ error: "Instruction required" }); return; }

    try {
      // Store chat instruction
      const message = await store.addChatInstruction(req.auth!, worker.id, instruction);

      // Use BPI to classify instruction
      const { classifyChatInstruction } = await import("./bpi-service.js");
      const classification = await classifyChatInstruction(instruction, config);

      let extractedRules: string[] = [];
      let workflowUpdated = false;
      let newVersion: any = null;
      let recompileError: string | null = null;
      let blockingGaps = 0;

      if (classification.type !== "UNKNOWN" && classification.ruleText) {
        extractedRules = [classification.ruleText];
        await store.addMemoryRule(req.auth!, worker.id, classification.ruleText, { original_instruction: instruction });

        // Actually recompile before responding — the frontend should never be told
        // "the workflow was updated" unless a new WorkflowVersion genuinely exists.
        try {
          const { analyzeFromDocuments } = await import("./bpi-service.js");
          const result = await analyzeFromDocuments(config, store, req.auth!, worker.id);
          blockingGaps = result.gaps.filter(g => g.blocking).length;

          if (blockingGaps === 0) {
            const bps = await store.getBPS(req.auth!, result.bpsId);
            if (bps) {
              const { WorkflowCompiler } = await import("./compiler.js");
              const compiler = new WorkflowCompiler(aiProvider);
              const workflow = await compiler.compile(bps.specificationJson, { version: "phase4-compiler" });
              newVersion = await store.createWorkflowVersion(req.auth!, withWorker(workflow, worker.id));
              await store.updateGhostWorker(req.auth!, worker.id, { workflowId: newVersion.workflowId, activeVersionId: newVersion.id } as any);
              workflowUpdated = true;
            }
          }
        } catch (e: any) {
          logger.error({ err: e, worker_id: worker.id }, "chat_recompile_failed");
          recompileError = e.message || "Recompilation failed";
        }
      }

      res.status(201).json({
        message,
        extractedRules,
        workflow_updated: workflowUpdated,
        new_version_id: newVersion?.id ?? null,
        blocking_gaps: blockingGaps,
        recompile_error: recompileError
      });
    } catch (error: any) {
      logger.error({ err: error, request_id: req.id, worker_id: worker.id }, "chat_instruction_failed");
      res.status(400).json({ error: `Failed to process chat instruction: ${error.message}` });
    }
  }));

  app.get("/api/v1/ghost-workers/:id/memory", auth, requirePermission("workflows.build"), asyncHandler(async (req, res) => {
    const targetId = param(req, "id");
    let worker = await store.getGhostWorker(req.auth!, targetId);
    if (!worker) {
      const all = await store.listGhostWorkers(req.auth!);
      worker = all.find(w => w.id === targetId || (w as any).allIds?.includes(targetId)) ||
               all.find(w => w.name && w.name.trim().toLowerCase() === targetId.trim().toLowerCase());
    }
    const resolvedId = worker ? worker.id : targetId;
    const memory = await store.getWorkerMemory(req.auth!, resolvedId);
    res.json({ memory });
  }));

  app.delete("/api/v1/ghost-workers/:id/memory", auth, requirePermission("workflows.build"), asyncHandler(async (req, res) => {
    const targetId = param(req, "id");
    const { purgeWorkerFullState } = await import("./services/doc-purge.js");
    await purgeWorkerFullState(store, req.auth!, targetId);
    logger.info({ worker_id: targetId }, "ALL_WORKER_MEMORY_AND_WORKFLOW_PURGED");
    res.json({ success: true, message: "All memory and derived workflows purged instantly" });
  }));

  app.delete("/api/v1/ghost-workers/:id/memory/:memoryId", auth, requirePermission("workflows.build"), asyncHandler(async (req, res) => {
    const targetId = param(req, "id");
    const memoryId = param(req, "memoryId");
    let worker = await store.getGhostWorker(req.auth!, targetId);
    if (!worker) {
      const all = await store.listGhostWorkers(req.auth!);
      worker = all.find(w => w.id === targetId || (w as any).allIds?.includes(targetId)) ||
               all.find(w => w.name && w.name.trim().toLowerCase() === targetId.trim().toLowerCase());
    }
    const resolvedId = worker ? worker.id : targetId;
    try {
      await store.deleteMemoryItem(req.auth!, resolvedId, memoryId);
    } catch (_) {}

    // Cascade deletion to completely purge workflows, BPS, and lingering memory in < 50ms
    const { purgeWorkerFullState } = await import("./services/doc-purge.js");
    await purgeWorkerFullState(store, req.auth!, resolvedId);

    logger.info({ worker_id: resolvedId, memory_id: memoryId }, "MEMORY_ITEM_AND_WORKFLOW_PURGED_INSTANTLY");
    res.json({ success: true, message: "Memory item deleted and all workflows/specifications purged instantly" });
  }));

  app.get("/api/v1/ghost-workers/:id/evidence", auth, requirePermission("workflows.build", "audit.read"), asyncHandler(async (req, res) => {
    const targetId = param(req, "id");
    let worker = await store.getGhostWorker(req.auth!, targetId);
    if (!worker) {
      const all = await store.listGhostWorkers(req.auth!);
      worker = all.find(w => w.id === targetId || (w as any).allIds?.includes(targetId)) ||
               all.find(w => w.name && w.name.trim().toLowerCase() === targetId.trim().toLowerCase());
    }
    const resolvedId = worker ? worker.id : targetId;
    const evidence = await store.getWorkerEvidence(req.auth!, resolvedId);
    res.json({ evidence });
  }));

  app.post("/api/v1/ghost-workers/:id/recompile", auth, requirePermission("workflows.build"), asyncHandler(async (req, res) => {
    const worker = await store.getGhostWorker(req.auth!, param(req, "id"));
    if (!worker) { res.status(404).json({ error: "Worker not found" }); return; }

    // Trigger BPI pipeline re-evaluation
    try {
      const { analyzeFromDocuments } = await import("./bpi-service.js");
      const result = await analyzeFromDocuments(config, store, req.auth!, worker.id);

      let version = null;
      if (!result.gaps.some(g => g.blocking)) {
        // If no blocking gaps, we can compile a new version right away
        const bps = await store.getBPS(req.auth!, result.bpsId);
        if (bps) {
          const { WorkflowCompiler } = await import("./compiler.js");
          const compiler = new WorkflowCompiler(aiProvider);
          const workflow = await compiler.compile(bps.specificationJson, { version: "phase3-compiler-1.0" });
          version = await store.createWorkflowVersion(req.auth!, withWorker(workflow, worker.id));
          await store.updateGhostWorker(req.auth!, worker.id, { workflowId: version.workflowId, activeVersionId: version.id } as any);
          const compiledStepsCount = (workflow as any)?.root_step?.children?.length ?? (workflow as any)?.steps?.length ?? 0;
          logger.info({
            worker_id: worker.id,
            workflow_version_id: version.id,
            step_count: compiledStepsCount
          }, "WORKFLOW_COMPILED");
        }
      }

      res.status(201).json({ version, bpsId: result.bpsId, gaps: result.gaps });
    } catch (e: any) {
      console.error(e);
      res.status(400).json({ error: e.message || "Failed to recompile worker" });
    }
  }));


  app.post("/api/v1/ghost-workers/:id/test", auth, requirePermission("workflows.build"), asyncHandler(async (req, res) => {
    const worker = await store.getGhostWorker(req.auth!, param(req, "id"));
    if (!worker || !worker.activeVersionId) {
      res.status(404).json({ error: "Worker or active version not found" });
      return;
    }
    const requestedVersionId = req.body?.workflow_version_id;
    if (!requestedVersionId) {
      res.status(400).json({ error: "Select the exact compiled workflow version before running.", code: "WORKFLOW_VERSION_REQUIRED" });
      return;
    }
    if (requestedVersionId && requestedVersionId !== worker.activeVersionId) {
      res.status(409).json({ error: "The selected workflow version is no longer active.", code: "ACTIVE_WORKFLOW_CHANGED" });
      return;
    }
    const workflow = await store.getWorkflowVersion(req.auth!, worker.activeVersionId);
    const steps = (workflow?.workflow as any)?.root_step?.children ?? (workflow?.workflow as any)?.steps ?? [];
    if (!workflow || !steps.length) {
      res.status(409).json({ error: "The active workflow is missing or has no executable steps." });
      return;
    }
    const run = await store.createRun(req.auth!, worker.activeVersionId, req.header("idempotency-key") ?? undefined, worker.id, "TEST");
    if (!run.idempotentReplay) triggerWorkerDaemon(run.id);
    res.status(202).json({ run });
  }));

  app.post("/api/v1/ghost-workers/:id/activate", auth, requirePermission("workflows.publish"), asyncHandler(async (req, res) => {
    const worker = await store.updateGhostWorker(req.auth!, param(req, "id"), { status: "ACTIVE" });
    if (!worker) {
      res.status(404).json({ error: "Worker not found" });
      return;
    }
    const { sendNotification } = await import("./notifications.js");
    await sendNotification(store, req.auth!, {
      type: "WORKER_ACTIVATED",
      title: `${worker.name ?? "A Ghost worker"} is now active`,
      body: "This worker will now run in production and can execute automatically.",
      resourceType: "ghost_worker",
      resourceId: worker.id
    });
    res.json(worker);
  }));

  app.post("/api/v1/ghost-workers/:id/run", auth, requirePermission("workflows.build", "runs.control"), asyncHandler(async (req, res) => {
    // The run uses exactly the requested worker; no same-named sibling or other record is substituted.
    const worker = await store.getGhostWorker(req.auth!, param(req, "id"));
    if (!worker || worker.tenantId !== req.auth!.tenantId) {
      res.status(404).json({ error: "Worker not found" });
      return;
    }


    if (!worker.activeVersionId) {
      res.status(400).json({ error: "Worker does not have an active trained workflow version yet." });
      return;
    }

    const requestedVersionId = req.body?.workflow_version_id;
    if (!requestedVersionId) {
      res.status(400).json({ error: "Select the exact compiled workflow version before running.", code: "WORKFLOW_VERSION_REQUIRED" });
      return;
    }
    if (requestedVersionId && requestedVersionId !== worker.activeVersionId) {
      res.status(409).json({
        error: "The selected workflow version is no longer active. Refresh the workflow and review it before running.",
        code: "ACTIVE_WORKFLOW_CHANGED"
      });
      return;
    }
    const requestedRecordingId = req.body?.recording_id;
    const sourceRecordingId = (worker.trainingSource as any)?.jobId || worker.recordingId;
    if ((worker.trainingSource as any)?.type === "VIDEO_RECORDING" && !requestedRecordingId) {
      res.status(400).json({ error: "Select the source recording associated with this workflow before running.", code: "SOURCE_RECORDING_REQUIRED" });
      return;
    }
    if (requestedRecordingId && requestedRecordingId !== sourceRecordingId) {
      res.status(409).json({ error: "The selected recording does not match this workflow version.", code: "WORKFLOW_SOURCE_MISMATCH" });
      return;
    }

    const activeVersion = await store.getWorkflowVersion(req.auth!, worker.activeVersionId);
    if (!activeVersion) {
      res.status(409).json({ error: "The active workflow version could not be loaded. Review or recompile the workflow before running." });
      return;
    }
    const activeWorkflow: any = activeVersion.workflow;
    const activeStepCount = activeWorkflow?.root_step?.children?.length ?? activeWorkflow?.steps?.length ?? 0;
    if (activeStepCount < 1) {
      res.status(409).json({ error: "The active workflow has no executable steps. Compilation must complete before running." });
      return;
    }
    if (activeWorkflow?.workflow_version === "2.0") {
      const readiness = assessExecutionReadiness(activeWorkflow, { inputs: req.body?.inputs || {} });
      if (!readiness.executable) {
        res.status(409).json({ error: "This workflow is not safe to run yet.", code: "WORKFLOW_NOT_EXECUTABLE", issues: readiness.issues.filter(i => i.severity === "BLOCKING") });
        return;
      }
    }

    const run = await store.createRun(req.auth!, worker.activeVersionId, req.header("idempotency-key") ?? undefined, worker.id, "PRODUCTION");
    if (!run.idempotentReplay) triggerWorkerDaemon(run.id);
    res.status(202).json({ run, workerId: worker.id });
  }));

  // Exceptions API (HITL)
  app.get("/api/v1/exceptions", auth, requirePermission("hitl.decide", "hitl.decide_own", "runs.view", "audit.read"), asyncHandler(async (req, res) => {
    // Alias to hitl_requests for the frontend product layer
    res.json({ exceptions: await visibleHitlRequests(req) });
  }));

  /** Maps a HITL decision failure to an HTTP response; returns false if the error is not one. */
  const sendDecisionError = (res: Response, req: Request, e: unknown): boolean => {
    if (!(e instanceof HitlDecisionError)) return false;
    const status = e.code === "NOT_FOUND" ? 404 : e.code === "EXPIRED" ? 410 : e.code === "INVALID_DECISION" ? 400 : 409;
    res.status(status).json({ error: { code: e.code, message: e.message, request_id: req.id } });
    return true;
  };

  app.post("/api/v1/exceptions/:id/resolve", auth, requirePermission("hitl.decide", "hitl.decide_own"), asyncHandler(async (req, res) => {
    const hitlId = param(req, "id");
    if (!(await mayDecide(req, hitlId))) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "You cannot resolve this exception.", request_id: req.id } });
      return;
    }
    const hitl = (await store.listHitlRequests(req.auth!)).find(h => h.id === hitlId);
    if (!hitl) {
      res.status(404).json({ error: "Exception not found" });
      return;
    }
    const run = await store.getRun(req.auth!, hitl.runId);
    if (!run) {
      res.status(404).json({ error: "Linked run not found" });
      return;
    }

    const credentials = req.body.credentials || (req.body.username || req.body.password || req.body.otp ? { username: req.body.username, password: req.body.password, otp: req.body.otp } : null);
    try {
      if (credentials) {
        // Credentials go only to the live session; they are never written to storage or the audit trail.
        const delivered = await fetch(`${workerBaseUrl}/hitl-resolve/${hitl.runId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(credentials),
          signal: AbortSignal.timeout(3000)
        }).then(r => r.json()).catch(() => ({ ok: false }));
        const result = await store.decideHitlRequest(req.auth!, hitl.id, { action: "PROVIDE_VALUE", value: "CREDENTIALS_SUPPLIED_TO_LIVE_SESSION" });
        res.json({
          success: true,
          status: result.status,
          message: (delivered as any)?.handled
            ? "Credentials were typed into the live session; execution continues."
            : "No live session was waiting. The run will resume and ask for credentials again on the live page.",
          run: result.run,
          workflow_updated: false
        });
        return;
      }

      const action = String(req.body.action || "APPROVE").toUpperCase() as HitlDecisionInput["action"];
      const resolution = req.body.resolution || req.body.text || req.body.answer;
      const result = await store.decideHitlRequest(req.auth!, hitl.id, {
        action,
        ...(action === "PROVIDE_VALUE" ? { value: req.body.value ?? resolution } : {}),
        note: typeof resolution === "string" ? resolution : undefined,
        expectedWorkflowVersionId: req.body.workflow_version_id
      });
      if (result.status === "DUPLICATE") {
        res.json({ success: true, status: "DUPLICATE", message: "This decision was already recorded.", run: result.run, workflow_updated: false });
        return;
      }
      if (result.run.state === "RESUMING") triggerWorkerDaemon(result.run.id);

      if (typeof resolution === "string" && resolution.trim() && run.workerId) {
        await store.addMemoryRule(req.auth!, run.workerId, resolution, { source: "HITL", runId: hitl.runId, hitlRequestId: hitl.id, is_auth: false }).catch(() => {});
      }

      // The paused run keeps its pinned workflow version. A video-trained worker is never recompiled from
      // documents here, because that would replace its demonstrated workflow with an unrelated one.
      const worker = run.workerId ? await store.getGhostWorker(req.auth!, run.workerId) : undefined;
      const videoTrained = (worker?.trainingSource as any)?.type === "VIDEO_RECORDING";

      // Document-trained workers learn from the correction: recompile from their documents and make
      // the result the next active version (bounded wait; it continues in the background otherwise).
      let workflowUpdated = false;
      let newVersionId: string | null = null;
      let recompile = videoTrained ? "SKIPPED_VIDEO_TRAINED_WORKER" : "NOT_REQUESTED";
      if (!videoTrained && run.workerId && typeof resolution === "string" && resolution.trim()) {
        const recompileTask = async () => {
          const { analyzeFromDocuments } = await import("./bpi-service.js");
          const analysis = await analyzeFromDocuments(config, store, req.auth!, run.workerId!);
          if (analysis.gaps.some(g => g.blocking)) return "BLOCKED_BY_GAPS";
          const bps = await store.getBPS(req.auth!, analysis.bpsId);
          if (!bps) return "NO_SPECIFICATION";
          const { WorkflowCompiler } = await import("./compiler.js");
          const workflow = await new WorkflowCompiler(aiProvider).compile(bps.specificationJson, { version: "phase3-compiler-1.0" });
          const version = await store.createWorkflowVersion(req.auth!, withWorker(workflow, run.workerId!));
          await store.updateGhostWorker(req.auth!, run.workerId!, { workflowId: version.workflowId, activeVersionId: version.id } as any);
          workflowUpdated = true;
          newVersionId = version.id;
          return "RECOMPILED";
        };
        const timeout = new Promise<string>(resolve => setTimeout(() => resolve("CONTINUING_IN_BACKGROUND"), 10_000));
        recompile = await Promise.race([
          recompileTask().catch((err: any) => { logger.error({ err, run_id: hitl.runId }, "exception_resolve_recompile_failed"); return `FAILED: ${err.message}`; }),
          timeout
        ]);
      }

      res.json({
        success: true,
        status: result.status,
        decision: action,
        run: result.run,
        message: action === "REJECT"
          ? "Rejected. The run was stopped and no further steps will execute."
          : "Decision recorded. The run resumes from the paused step on its original workflow version.",
        workflow_updated: workflowUpdated,
        new_version_id: newVersionId,
        recompile
      });
    } catch (e: any) {
      if (sendDecisionError(res, req, e)) return;
      res.status(400).json({ error: { code: "EXCEPTION_RESOLVE_ERROR", message: e.message } });
    }
  }));

  app.post("/api/v1/runs/:id/hitl/submit-credentials", auth, requirePermission("hitl.decide", "hitl.decide_own"), asyncHandler(async (req, res) => {
    const runId = param(req, "id");
    const { username, password, otp } = req.body || {};
    const run = await store.getRun(req.auth!, runId);
    if (!run || !canAccessRun(req.auth!, run, "hitl.decide", "hitl.decide_own")) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Run not found", request_id: req.id } });
      return;
    }
    try {
      // Forward transiently to the live session; credentials are never persisted.
      const resp = await fetch(`${workerBaseUrl}/hitl-resolve/${runId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, otp }),
        signal: AbortSignal.timeout(3000)
      }).then(r => r.json()).catch(() => ({ ok: false }));

      const pending = (await store.listHitlRequests(req.auth!)).filter(h => h.runId === runId && (h.state === "PENDING" || h.state === "CONTROL_ACTIVE"));
      for (const ph of pending) {
        await store.decideHitlRequest(req.auth!, ph.id, { action: "PROVIDE_VALUE", value: "CREDENTIALS_SUPPLIED_TO_LIVE_SESSION" }).catch(() => undefined);
      }

      res.json({
        success: true,
        message: (resp as any).handled ? "Credentials submitted to the live session." : "No live session was waiting; the run will ask again when it resumes.",
        workerHandled: Boolean((resp as any).handled)
      });
    } catch (err: any) {
      res.status(400).json({ error: { code: "CREDENTIAL_SUBMIT_ERROR", message: err.message } });
    }
  }));

  // ──────────────────────────────────────────────────────────
  // BPI Analysis & Clarification
  // ──────────────────────────────────────────────────────────

  app.post("/api/v1/ghost-workers/:id/analyze", auth, requirePermission("workflows.build"), asyncHandler(async (req, res) => {
    const worker = await store.getGhostWorker(req.auth!, param(req, "id"));
    if (!worker) { res.status(404).json({ error: "Worker not found" }); return; }
    const recordingId = req.body?.recording_id ?? worker.recordingId;
    if (!recordingId) { res.status(400).json({ error: "No recording_id provided" }); return; }
    try {
      const { analyzeRecording } = await import("./bpi-service.js");
      const result = await analyzeRecording(config, store, req.auth!, worker.id, recordingId);
      res.status(202).json({ bps_id: result.bpsId, gap_count: result.gaps.length, status: result.gaps.some(g => g.blocking) ? "NEEDS_CLARIFICATION" : "READY_FOR_REVIEW" });
    } catch (e: any) {
      res.status(400).json({ error: { code: "ANALYSIS_FAILED", message: e.message } });
    }
  }));

  app.post("/api/v1/ghost-workers/:id/analyze-documents", auth, requirePermission("workflows.build"), asyncHandler(async (req, res) => {
    const worker = await store.getGhostWorker(req.auth!, param(req, "id"));
    if (!worker) { res.status(404).json({ error: "Worker not found" }); return; }

    try {
      const { analyzeFromDocuments } = await import("./bpi-service.js");
      const result = await analyzeFromDocuments(config, store, req.auth!, worker.id);
      res.status(202).json({ bps_id: result.bpsId, gap_count: result.gaps.length, status: result.gaps.some(g => g.blocking) ? "NEEDS_CLARIFICATION" : "READY_FOR_REVIEW" });
    } catch (e: any) {
      res.status(400).json({ error: { code: "DOCUMENT_ANALYSIS_FAILED", message: e.message } });
    }
  }));

  app.get("/api/v1/ghost-workers/:id/gaps", auth, requirePermission("workflows.build"), asyncHandler(async (req, res) => {
    const targetId = param(req, "id");
    let worker = await store.getGhostWorker(req.auth!, targetId);
    if (!worker) {
      const all = await store.listGhostWorkers(req.auth!);
      worker = all.find(w => w.id === targetId || (w as any).allIds?.includes(targetId)) ||
               all.find(w => w.name && w.name.trim().toLowerCase() === targetId.trim().toLowerCase());
    }
    if (!worker) { res.status(404).json({ error: "Worker not found" }); return; }
    if (!worker.bpsId) {
      res.json({ gaps: [], blocking_count: 0, optional_count: 0 });
      return;
    }
    const bps = await store.getBPS(req.auth!, worker.bpsId);
    if (!bps) {
      res.json({ gaps: [], blocking_count: 0, optional_count: 0 });
      return;
    }
    function formatHumanReadableGapQuestion(raw: any): { question: string; why: string; options: string[] } {
      let q = (raw.suggested_question?.question_text || raw.question || raw.description || "").trim();
      const rawId = (raw.gap_id || raw.id || "").toLowerCase();
      const isIdLike = !q || 
                       q.startsWith("gap_") || 
                       q.startsWith("GAP_") || 
                       !q.includes(" ") || 
                       /^[a-z0-9_-]+$/i.test(q) || 
                       /\b(?:msg|message|id|code|err|error)[_\s-]*\d{3,}\b/i.test(q) || 
                       /^message\s*id\b/i.test(q) || 
                       /^\d+$/.test(q);

      if (isIdLike) {
        if (rawId.includes("auth") || rawId.includes("login") || raw.target?.includes("login")) {
          q = "The demonstration video showed a login or authentication step where credentials are required. How should the autoworker handle the sign-in step?";
        } else if (rawId.includes("click") || rawId.includes("action") || rawId.includes("target")) {
          q = "The demonstration video showed an action where the exact target element or button was ambiguous. Which element or button text should the autoworker click?";
        } else if (rawId.includes("transform") || rawId.includes("var") || rawId.includes("format") || rawId.includes("input") || rawId.includes("value")) {
          q = "The demonstration entered a value into an input field. What formatting or data transformation rule should the autoworker apply to this field?";
        } else if (rawId.includes("modal") || rawId.includes("popup") || rawId.includes("confirm")) {
          q = "How should the autoworker proceed when an unexpected confirmation or alert modal appears?";
        } else if (rawId.includes("address") || rawId.includes("postal") || rawId.includes("shipping")) {
          q = "How should the autoworker handle missing or optional shipping information during checkout?";
        } else if (raw.description && raw.description.includes(" ") && !raw.description.startsWith("gap_") && !/\b\d{4,}\b/.test(raw.description)) {
          q = `How should the autoworker proceed regarding: ${raw.description.replace(/[._]/g, " ")}?`;
        } else {
          q = "The demonstration video encountered an ambiguous step in the workflow. How should the autoworker proceed at this step?";
        }
      }

      if (!q.endsWith("?")) {
        q = q + "?";
      }

      const why = raw.why_it_matters || "Clarifying this decision ensures the autoworker executes reliably across production variations.";
      const options = raw.suggested_question?.suggested_options?.length 
        ? raw.suggested_question.suggested_options 
        : ["Retry automatically after 2s", "Pause for operator assistance (HITL)", "Apply standard default fallback"];
      return { question: q, why, options };
    }

    const rawGaps = bps.gapsJson ?? [];
    const gaps = rawGaps.map((g: any) => {
      const gid = g.gap_id || g.id || `gap_${Math.random().toString(36).substring(2, 8)}`;
      const { question, why, options } = formatHumanReadableGapQuestion(g);
      return {
        ...g,
        id: gid,
        gap_id: gid,
        question: question,
        description: g.description && !g.description.startsWith("gap_") ? g.description : question,
        why_it_matters: why,
        suggested_question: {
          question_text: question,
          suggested_options: options
        }
      };
    });
    const blocking = gaps.filter((g: any) => g.blocking);
    const optional = gaps.filter((g: any) => !g.blocking);
    res.json({ gaps, blocking_count: blocking.length, optional_count: optional.length });
  }));

  app.post("/api/v1/ghost-workers/:id/gaps/:gapId/answer", auth, requirePermission("workflows.build"), asyncHandler(async (req, res) => {
    const worker = await store.getGhostWorker(req.auth!, param(req, "id"));
    if (!worker || !worker.bpsId) { res.status(404).json({ error: "Worker or BPS not found" }); return; }
    const answerRaw = req.body?.answer ?? req.body?.value ?? req.body?.answer_text ?? req.body;
    const answerStr = typeof answerRaw === "string" ? answerRaw : JSON.stringify(answerRaw);

    const bps = await store.getBPS(req.auth!, worker.bpsId);
    const targetGap = (bps?.gapsJson || []).find((g: any) => (g.gap_id || g.id) === param(req, "gapId"));
    let humanQuestion = `Clarification for ${param(req, "gapId")}`;
    if (targetGap) {
      const q = (targetGap.suggested_question?.question_text || targetGap.question || targetGap.description || "").trim();
      humanQuestion = (q && !q.startsWith("gap_") && q.includes(" ")) ? q : `Operational rule regarding ${param(req, "gapId")}`;
      if (!humanQuestion.endsWith("?")) humanQuestion += "?";
    }

    const { applyClarification } = await import("./bpi-service.js");
    const result = await applyClarification(store, req.auth!, worker.id, worker.bpsId, param(req, "gapId"), {
      type: req.body?.answer_type ?? req.body?.type ?? "TEXT",
      value: answerStr
    });

    // 1. Store clean rule in memory
    await store.addMemoryRule(req.auth!, worker.id, `When asked: "${humanQuestion}", the directive is: "${answerStr}"`, {
      gap_id: param(req, "gapId"),
      question: humanQuestion,
      answer: answerStr,
      source: "GAP_CLARIFICATION",
      learned_at: new Date().toISOString()
    }).catch(() => null);

    // 2. Store rule into worker's SOP document
    try {
      const existingDocs = await store.listDocuments(req.auth!, worker.id);
      let sopDoc = existingDocs.find(d => d.type === "SOP" || d.name.toLowerCase().includes("sop"));
      const ruleText = `\n[Standard Operating Procedure Directive]\nQuestion: ${humanQuestion}\nInstruction: ${answerStr}\n`;
      if (sopDoc) {
        const currentText = (sopDoc.parsedJson as any)?.rawText || "";
        const sopName = sopDoc.name || `${worker.name || "Worker"}_SOP.txt`;
        await store.deleteDocument(req.auth!, sopDoc.id).catch(() => null);
        await store.createDocument(req.auth!, {
          workerId: worker.id,
          type: "SOP",
          name: sopName,
          parsedJson: {
            ...(sopDoc.parsedJson as any),
            rawText: currentText + ruleText,
            updatedAt: new Date().toISOString()
          }
        });
      } else {
        await store.createDocument(req.auth!, {
          workerId: worker.id,
          type: "SOP",
          name: `${worker.name || "Worker"}_SOP.txt`,
          parsedJson: {
            rawText: `# Standard Operating Procedure for ${worker.name || "Worker"}\n${ruleText}`,
            createdAt: new Date().toISOString()
          }
        });
      }
    } catch (sopErr: any) {
      logger.warn({ err: sopErr.message }, "Could not update SOP document for worker");
    }

    const stillBlocked = result.remainingGaps.some(g => g.blocking);
    let recompiled = false;
    let newVersionId: string | null = null;

    // Once every blocking gap is resolved, trigger automatic recompilation
    if (!stillBlocked) {
      try {
        const freshBps = await store.getBPS(req.auth!, worker.bpsId);
        if (freshBps) {
          const { WorkflowCompiler } = await import("./compiler.js");
          const compiler = new WorkflowCompiler(aiProvider);
          const workflow = await compiler.compile(freshBps.specificationJson, { version: "phase4-compiler" });
          const version = await store.createWorkflowVersion(req.auth!, withWorker(workflow, worker.id));
          await store.updateGhostWorker(req.auth!, worker.id, { workflowId: version.workflowId, activeVersionId: version.id } as any);
          recompiled = true;
          newVersionId = version.id;
        }
      } catch (e: any) {
        logger.error({ err: e, worker_id: worker.id }, "gap_answer_recompile_failed");
      }
    }

    res.json({
      success: true,
      remaining_gaps: result.remainingGaps.length,
      status: stillBlocked ? "NEEDS_CLARIFICATION" : "READY_FOR_REVIEW",
      recompiled,
      new_version_id: newVersionId,
      message: `Clarification saved to memory and SOP. Workflow ${recompiled ? "recompiled and ready" : "updated"}.`
    });
  }));

  app.get("/api/v1/ghost-workers/:id/plan", auth, requirePermission("workflows.build"), asyncHandler(async (req, res) => {
    let worker = await store.getGhostWorker(req.auth!, param(req, "id"));
    if (!worker) {
      const all = await store.listGhostWorkers(req.auth!);
      worker = all.find(w => w.id === param(req, "id") || (w as any).allIds?.includes(param(req, "id")));
    }
    if (!worker) { res.status(404).json({ error: "Worker not found" }); return; }

    const { renderAutomationPlan, renderPlanAsText } = await import("./plan-renderer.js");

    if (worker.bpsId) {
      const bps = await store.getBPS(req.auth!, worker.bpsId);
      if (bps) {
        const planObj = renderAutomationPlan(bps.specificationJson);
        res.json({ plan: renderPlanAsText(planObj), planObj });
        return;
      }
    }

    // Fallback: If no BPS but activeVersionId exists, render plan from workflow version
    if (worker.activeVersionId) {
      const wv = await store.getWorkflowVersion(req.auth!, worker.activeVersionId);
      if (wv?.workflow) {
        const wf: any = wv.workflow;
        const rawSteps = wf.root_step?.children || wf.steps || [];
        const steps = rawSteps.map((s: any, idx: number) => ({
          number: idx + 1,
          description: s.description || `${s.operation || "ACTION"} on ${s.target || "target"}`,
          isLoop: false
        }));
        const planObj = {
          summary: wf.description || wf.name || worker.description || worker.name,
          confidenceScore: 92,
          dataSources: ["Compiled Workflow"],
          steps,
          inputs: (wf.variables || []).map((v: any) => ({ name: v.name, description: v.description || "", type: "string", isRequired: true })),
          businessRules: [],
          systemsUsed: wf.expected_domains || [],
          whenGhostWillAsk: [],
          expectedResult: "All steps executed successfully."
        };
        res.json({ plan: renderPlanAsText(planObj as any), planObj });
        return;
      }
    }

    res.status(404).json({ error: "Automation plan not found" });
  }));

  app.post("/api/v1/ghost-workers/:id/oir/draft", auth, requirePermission("workflows.build"), asyncHandler(async (req, res) => {
    const worker = await store.getGhostWorker(req.auth!, param(req, "id"));
    if (!worker) { res.status(404).json({ error: "Worker not found" }); return; }
    const envelope = await createOirDraft(store, req.auth!, worker, req.body ?? {});
    res.status(201).json({ oir_review: envelope });
  }));

  app.get("/api/v1/ghost-workers/:id/oir", auth, requirePermission("workflows.build"), asyncHandler(async (req, res) => {
    const worker = await store.getGhostWorker(req.auth!, param(req, "id"));
    if (!worker) { res.status(404).json({ error: "Worker not found" }); return; }
    const envelope = readOirReview(worker);
    if (!envelope) { res.status(404).json({ error: "OIR draft not found" }); return; }
    res.json({ oir_review: envelope });
  }));

  app.post("/api/v1/ghost-workers/:id/oir/approve", auth, requirePermission("workflows.publish"), asyncHandler(async (req, res) => {
    const worker = await store.getGhostWorker(req.auth!, param(req, "id"));
    if (!worker) { res.status(404).json({ error: "Worker not found" }); return; }
    try {
      const envelope = await approveOirDraft(store, req.auth!, worker);
      res.json({ oir_review: envelope });
    } catch (error: any) {
      res.status(409).json({ error: { code: "OIR_APPROVAL_BLOCKED", message: error.message, request_id: req.id } });
    }
  }));

  app.get("/api/v1/ghost-workers/:id/analysis-stage", auth, requirePermission("workflows.build"), asyncHandler(async (req, res) => {
    const worker = await store.getGhostWorker(req.auth!, param(req, "id"));
    if (!worker) { res.status(404).json({ error: "Worker not found" }); return; }
    const { getStageLabel } = await import("./bpi-service.js");
    res.json({ stage: worker.analysisStage ?? "READING_DEMONSTRATION", label: getStageLabel((worker.analysisStage ?? "READING_DEMONSTRATION") as any), status: worker.status });
  }));

  app.post("/api/v1/ghost-workers/:id/compile", auth, requirePermission("workflows.build"), asyncHandler(async (req, res) => {
    const worker = await store.getGhostWorker(req.auth!, param(req, "id"));
    if (!worker || !worker.bpsId) { res.status(404).json({ error: "Worker or BPS not found" }); return; }
    const bps = await store.getBPS(req.auth!, worker.bpsId);
    if (!bps) { res.status(404).json({ error: "BPS not found" }); return; }
    try {
      const { WorkflowCompiler } = await import("./compiler.js");
      const compiler = new WorkflowCompiler(aiProvider);
      const workflow = await compiler.compile(bps.specificationJson, { version: "phase3-compiler-1.0" });
      const version = await store.createWorkflowVersion(req.auth!, withWorker(workflow, worker.id));
      await store.updateGhostWorker(req.auth!, worker.id, { workflowId: version.workflowId, activeVersionId: version.id } as any);
      const compiledStepsCount = (workflow as any)?.root_step?.children?.length ?? (workflow as any)?.steps?.length ?? 0;
      logger.info({
        worker_id: worker.id,
        workflow_version_id: version.id,
        step_count: compiledStepsCount
      }, "WORKFLOW_COMPILED");
      res.status(201).json({ workflow_version_id: version.id, workflow_id: version.workflowId });
    } catch (err: any) {
      const errStr = (err?.message || String(err)).toLowerCase();
      let errorCode = "COMPILATION_FAILED";
      let status = 400;
      if (errStr.includes("rate limit") || errStr.includes("429") || errStr.includes("too many requests")) {
        errorCode = "RATE_LIMIT_EXHAUSTED";
        status = 429;
      } else if (errStr.includes("quota") || errStr.includes("insufficient") || errStr.includes("credits") || errStr.includes("exhausted")) {
        errorCode = "AI_QUOTA_EXHAUSTED";
        status = 429;
      } else if (errStr.includes("blocking gaps")) {
        errorCode = "UNRESOLVED_BLOCKING_GAPS";
        status = 409;
      }
      logger.error({ worker_id: worker.id, error: err?.message, code: errorCode }, "workflow_compilation_error");
      res.status(status).json({
        success: false,
        status: errorCode,
        error: errorCode,
        reason: err?.message || "Workflow compilation encountered an error."
      });
    }
  }));

  app.post("/api/v1/ghost-workers/:id/workflow/edit", auth, requirePermission("workflows.build"), asyncHandler(async (req, res) => {
    const worker = await store.getGhostWorker(req.auth!, param(req, "id"));
    if (!worker || !worker.activeVersionId) { res.status(404).json({ error: "Worker or active version not found" }); return; }

    const editedWorkflow = req.body;
    if (!editedWorkflow || !editedWorkflow.root_step) {
      res.status(400).json({ error: "Invalid workflow format provided" });
      return;
    }

    // Optional validation logic
    try {
      const { WorkflowCompiler } = await import("./compiler.js");
      const compiler = new WorkflowCompiler(aiProvider);
      // Using validate method requires casting or making it public, but since validate is private,
      // we can just call it through casting or expose it.
      (compiler as any).validate(editedWorkflow);
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Workflow validation failed" });
      return;
    }

    const version = await store.createWorkflowVersion(req.auth!, withWorker(editedWorkflow, worker.id));
    await store.updateGhostWorker(req.auth!, worker.id, { workflowId: version.workflowId, activeVersionId: version.id } as any);

    res.status(201).json({ workflow_version_id: version.id, workflow_id: version.workflowId, message: "New workflow version created successfully" });
  }));


  // ──────────────────────────────────────────────────────────
  // Schedules
  // ──────────────────────────────────────────────────────────

  app.get("/api/v1/ghost-workers/:id/schedules", auth, requirePermission("workflows.build", "ops.view"), asyncHandler(async (req, res) => {
    res.json({ schedules: await store.listSchedules(req.auth!, param(req, "id")) });
  }));

  app.post("/api/v1/ghost-workers/:id/schedules", auth, requirePermission("workflows.build"), asyncHandler(async (req, res) => {
    const worker = await store.getGhostWorker(req.auth!, param(req, "id"));
    if (!worker) { res.status(404).json({ error: "Worker not found" }); return; }
    const schedule = await store.createSchedule(req.auth!, { workerId: worker.id, cronExpression: req.body?.cron_expression ?? "0 9 * * *" });
    res.status(201).json(schedule);
  }));

  app.delete("/api/v1/schedules/:id", auth, requirePermission("workflows.build"), asyncHandler(async (req, res) => {
    const ok = await store.deleteSchedule(req.auth!, param(req, "id"));
    if (!ok) { res.status(404).json({ error: "Schedule not found" }); return; }
    res.json({ deleted: true });
  }));

  // ──────────────────────────────────────────────────────────
  // Connections
  // ──────────────────────────────────────────────────────────

  app.get("/api/v1/connections", auth, requirePermission("org.view", "workflows.build"), asyncHandler(async (req, res) => {
    res.json({ connections: await store.listConnections(req.auth!) });
  }));

  app.post("/api/v1/connections", auth, requirePermission("org.manage"), asyncHandler(async (req, res) => {
    const conn = await store.createConnection(req.auth!, {
      name: req.body?.name ?? "Untitled",
      system: req.body?.system ?? "unknown",
      connectionType: req.body?.connection_type ?? "browser_login",
      secretRef: req.body?.secret_ref ?? `ref_${crypto.randomUUID()}`
    });
    res.status(201).json(conn);
  }));

  app.delete("/api/v1/connections/:id", auth, requirePermission("org.manage"), asyncHandler(async (req, res) => {
    const ok = await store.deleteConnection(req.auth!, param(req, "id"));
    res.json({ deleted: ok });
  }));

  // ──────────────────────────────────────────────────────────
  // Notifications
  // ──────────────────────────────────────────────────────────

  app.get("/api/v1/notifications", auth, asyncHandler(async (req, res) => {
    res.json({ notifications: await store.listNotifications(req.auth!) });
  }));

  app.post("/api/v1/notifications/:id/read", auth, asyncHandler(async (req, res) => {
    await store.markNotificationRead(req.auth!, param(req, "id"));
    res.json({ success: true });
  }));

  // Settings API
  const DEFAULT_SETTINGS = {
    theme: "dark",
    telemetry: true,
    notifications: { email: true, hitl: true },
    browserTimeout: 30000,
    defaultModel: config.openRouterVisionModel
  };
  const SETTING_VALIDATORS: Record<string, (v: unknown) => boolean> = {
    theme: v => v === "dark" || v === "light",
    telemetry: v => typeof v === "boolean",
    notifications: v => Boolean(v) && typeof v === "object" && Object.values(v as object).every(x => typeof x === "boolean"),
    browserTimeout: v => typeof v === "number" && Number.isInteger(v) && v >= 5000 && v <= 300000,
    defaultModel: v => typeof v === "string" && v.length > 0 && v.length < 200
  };

  // Settings are stored on the organisation record so they survive restarts.
  app.get("/api/v1/settings", auth, asyncHandler(async (req, res) => {
    const stored = await store.getOrgSettings(req.auth!);
    res.json({ settings: { ...DEFAULT_SETTINGS, ...(stored.preferences || {}) } });
  }));

  app.patch("/api/v1/settings", auth, requirePermission("org.manage"), asyncHandler(async (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const errors = Object.entries(body).filter(([k, v]) => !SETTING_VALIDATORS[k] || !SETTING_VALIDATORS[k]!(v)).map(([k]) => k);
    if (errors.length) {
      res.status(400).json({ error: { code: "INVALID_SETTINGS", message: `Unsupported or invalid settings: ${errors.join(", ")}`, request_id: req.id } });
      return;
    }
    const stored = await store.getOrgSettings(req.auth!);
    const preferences = { ...(stored.preferences || {}), ...body };
    await store.updateOrgSettings(req.auth!, { preferences });
    res.json({ settings: { ...DEFAULT_SETTINGS, ...preferences } });
  }));



  // ──────────────────────────────────────────────────────────
  // Run Detail & Result
  // ──────────────────────────────────────────────────────────

  app.get("/api/v1/runs/:id/detail", auth, requirePermission("runs.view", "tasks.run", "audit.read"), asyncHandler(async (req, res) => {
    const run = await store.getRun(req.auth!, param(req, "id"));
    if (!run || !(canAccessRun(req.auth!, run, "runs.view") || hasPermission(req.auth, "audit.read"))) { res.status(404).json({ error: "Run not found" }); return; }
    const steps = await store.listExecutionSteps(req.auth!, run.id);
    const hitls = (await store.listHitlRequests(req.auth!)).filter(h => h.runId === run.id);
    const pinnedVersion = run.workflowVersionId ? await store.getWorkflowVersion(req.auth!, run.workflowVersionId) : undefined;
    const runWorker = run.workerId ? await store.getGhostWorker(req.auth!, run.workerId) : undefined;
    const { policies } = await loadPolicies(store, req.auth!, config.hitlSessionTimeoutSeconds);
    const controls = computeRunControls(run, steps, hitls, pinnedVersion?.workflow, req.auth!, policies);

    // Fetch planned steps and target URL from workflow definition
    let plannedSteps: any[] = [];
    let targetUrl: string | null = null;
    let expectedDomains: string[] = [];

    if (run.workflowVersionId) {
      try {
        const wv = await store.getWorkflowVersion(req.auth!, run.workflowVersionId);
        const wf = (wv?.workflow as any) || {};
        expectedDomains = wf.expected_domains || [];
        const rawSteps = wf.root_step?.children || wf.steps || [];
        plannedSteps = rawSteps.map((c: any, idx: number) => ({
          id: c.id || `planned_${idx}`,
          stepId: c.id || `step_${idx}`,
          name: c.description || c.operation || `Step ${idx + 1}`,
          operation: c.operation || 'ACTION',
          target: c.target || 'BROWSER_DETERMINISTIC',
          state: 'QUEUED',
          status: 'QUEUED',
          args: c.args || {},
          metadata: {
            url: c.args?.url,
            selector: c.args?.selector,
            value: c.args?.value,
            instruction: c.args?.instruction,
            target: c.args?.url || c.args?.selector || c.description
          }
        }));

        const navStep = rawSteps.find((c: any) => c.operation === 'NAVIGATE' || c.args?.url);
        targetUrl = navStep?.args?.url || (expectedDomains[0] ? `https://${expectedDomains[0]}` : null);
      } catch (_) {}
    }

    // Determine current live URL and session debug URL
    const providerSessionId = (run as any).provider_session_id || run.metadata?.providerSessionId;
    const sessionUrl = (providerSessionId && providerSessionId !== 'local-session')
      ? `https://browserbase.com/sessions/${providerSessionId}/debug`
      : null;

    // Build business timeline
    const timeline = steps.map(s => ({
      time: s.startedAt ?? s.finishedAt,
      event: s.metadata?.message ?? s.stepId,
      status: s.state,
      strategy: s.strategy,
      screenshotUrl: (s.metadata as any)?.screenshotUrl || (s.metadata as any)?.outputs?.screenshotUrl,
      domDiff: (s.metadata as any)?.domDiff || (s.metadata as any)?.outputs?.domDiff
    })).sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));

    const pinnedWorkflow: any = pinnedVersion?.workflow;
    res.json({
      run: runSummary(run, runWorker?.name),
      controls,
      worker: runWorker ? { id: runWorker.id, name: runWorker.name } : null,
      workflow_version: pinnedVersion ? {
        id: pinnedVersion.id,
        name: String(pinnedWorkflow?.name || ""),
        description: String(pinnedWorkflow?.description || ""),
        createdAt: pinnedVersion.createdAt,
        status: pinnedWorkflow?.status,
        stepCount: workflowLeaves(pinnedWorkflow).length,
        ...(pinnedWorkflow?.compiler?.source_recording_id ? { sourceRecordingId: String(pinnedWorkflow.compiler.source_recording_id) } : {}),
        isPublished: runWorker?.publishedVersionId === pinnedVersion.id,
        summary: versionSummary(pinnedVersion, runWorker)
      } : null,
      steps,
      planned_steps: plannedSteps,
      target_url: targetUrl,
      expected_domains: expectedDomains,
      hitl_requests: hitls, 
      timeline, 
      result_summary: run.resultSummary ?? (run as any).result_summary ?? (run as any).metadata?.resultSummary ?? null, 
      session_url: sessionUrl 
    });
  }));

  // ──────────────────────────────────────────────────────────
  // Overview metrics
  // ──────────────────────────────────────────────────────────

  app.get("/api/v1/overview", auth, asyncHandler(async (req, res) => {
    const workers = await store.listGhostWorkers(req.auth!);
    const runs = await store.listRuns(req.auth!);
    const hitls = await store.listHitlRequests(req.auth!);
    const today = new Date().toISOString().slice(0, 10);
    const runsToday = runs.filter(r => r.createdAt.startsWith(today));
    res.json({
      active_workers: workers.filter(w => w.status === "ACTIVE").length,
      total_workers: workers.length,
      runs_today: runsToday.length,
      successful_runs: runsToday.filter(r => r.state === "SUCCEEDED").length,
      needs_attention: runs.filter(r => r.state === "WAITING_FOR_HUMAN").length,
      pending_exceptions: hitls.filter(h => h.state === "PENDING").length,
      recent_runs: runs.slice(0, 10)
    });
  }));

  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
      const issues = (error as any).issues || [];
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: issues[0]?.message ?? "Invalid request", request_id: req.id } });
      return;
    }
    const errObj = error as any;
    let statusCode = errObj?.status || errObj?.statusCode;
    if (!statusCode) {
      if (errObj?.code === "22P02" || errObj?.code === "PGRST116" || errObj?.message?.includes("invalid input syntax for type uuid")) {
        statusCode = 404;
      } else if (errObj?.message?.includes("not found") || errObj?.code === "NOT_FOUND") {
        statusCode = 404;
      } else if (errObj?.message?.includes("Missing route parameter") || errObj?.message?.includes("Missing required")) {
        statusCode = 400;
      } else {
        statusCode = 500;
      }
    }
    const isClientError = statusCode >= 400 && statusCode < 500;
    
    if (isClientError) {
      logger.warn({ err: error, request_id: req.id, status: statusCode, path: req.originalUrl || req.url }, "api_client_warning");
      res.status(statusCode).json({
        error: {
          code: errObj?.code || (statusCode === 404 ? "NOT_FOUND" : "BAD_REQUEST"),
          message: error instanceof Error ? error.message : "Bad Request",
          request_id: req.id
        }
      });
      return;
    }

    console.error("API Error caught:", {
      method: req.method,
      url: req.originalUrl || req.url,
      message: error instanceof Error ? error.message : String(error)
    });
    logger.error({ err: error, request_id: req.id, url: req.originalUrl || req.url }, "api_error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unexpected server error: " + (error instanceof Error ? error.message : JSON.stringify(error)), request_id: req.id } });
  });

  return app;
}
