import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
// import { ZodError } from "zod";
import { logger } from "@ghost/observability";
import { validateRecordingUpload } from "@ghost/workflow-schema";
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
  app.use("/api/v1/ghost-workers/:id/evidence", auth, createEvidenceRouter(config, store));

  app.post("/api/v1/recordings", auth, asyncHandler(async (req, res) => {
    const upload = validateRecordingUpload(req.body);
    const row = await store.createRecording(req.auth!, upload, req.header("idempotency-key") ?? undefined);
    logger.info({ recording_id: row.id, tenant_id: row.tenantId }, "recording_ingested");
    res.status(201).json({ recording_id: row.id, status: "PROCESSING" });
  }));

  app.post("/api/v1/recordings/start", auth, asyncHandler(async (req, res) => {
    const row = await store.startRecording(req.auth!, { source: req.body?.source || "chrome_extension", metadata: req.body?.metadata }, req.header("idempotency-key") ?? undefined);
    logger.info({ recording_id: row.id, tenant_id: row.tenantId }, "recording_started");
    res.status(201).json({ recording_id: row.id });
  }));

  app.post("/api/v1/recordings/:id/chunks", auth, asyncHandler(async (req, res) => {
    const events = req.body?.events;
    if (!Array.isArray(events)) {
      res.status(400).json({ error: "Expected 'events' array in chunk" });
      return;
    }
    await store.appendRecordingEvents(req.auth!, param(req, "id"), events);
    res.status(202).json({ ok: true, appended: events.length });
  }));

  app.post("/api/v1/recordings/:id/finish", auth, asyncHandler(async (req, res) => {
    const endedAt = req.body?.ended_at ?? new Date().toISOString();
    const row = await store.finishRecording(req.auth!, param(req, "id"), endedAt);
    logger.info({ recording_id: row.id, tenant_id: row.tenantId }, "recording_finished");
    res.status(200).json({ recording_id: row.id, status: "PROCESSING" });
  }));

  app.get("/api/v1/recordings", auth, asyncHandler(async (req, res) => {
    res.json({ recordings: await store.listRecordings(req.auth!) });
  }));

  app.post("/api/v1/recordings/:id/compile", auth, asyncHandler(async (req, res) => {
    res.status(410).json({ error: { code: "GONE", message: "V1 compiler deprecated. Use BPI analyze endpoint." } });
  }));

  app.get("/api/v1/workflows", auth, asyncHandler(async (req, res) => {
    res.json({ workflows: await store.listWorkflows(req.auth!) });
  }));

  app.get("/api/v1/workflows/:versionId", auth, asyncHandler(async (req, res) => {
    const row = await store.getWorkflowVersion(req.auth!, param(req, "versionId"));
    if (!row) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Workflow not found", request_id: req.id } });
      return;
    }
    res.json(row);
  }));

  app.post("/api/v1/workflows/:versionId/activate", auth, asyncHandler(async (req, res) => {
    const row = await store.activateWorkflowVersion(req.auth!, param(req, "versionId"));
    if (!row) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Workflow not found", request_id: req.id } });
      return;
    }
    res.json(row);
  }));

  const triggerWorkerDaemon = (runId: string) => {
    fetch(`http://127.0.0.1:4005/trigger/${runId}`, { method: "POST" }).catch(async () => {
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
          fetch(`http://127.0.0.1:4005/trigger/${runId}`, { method: "POST" }).catch(() => {});
        }, 2000);
      } catch (e: any) {
        logger.warn({ error: e?.message }, "Failed to auto-spawn worker daemon");
      }
    });
  };

  app.post("/api/v1/workflows/:versionId/run", auth, asyncHandler(async (req, res) => {
    const workflow = await store.getWorkflowVersion(req.auth!, param(req, "versionId"));
    if (!workflow) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Workflow not found", request_id: req.id } });
      return;
    }
    const run = await store.createRun(req.auth!, workflow.id, req.header("idempotency-key") ?? undefined);
    triggerWorkerDaemon(run.id);
    res.status(202).json({ run });
  }));

  app.get("/api/v1/runs", auth, asyncHandler(async (req, res) => {
    res.json({ runs: await store.listRuns(req.auth!) });
  }));

  app.get("/api/v1/runs/:id", auth, asyncHandler(async (req, res) => {
    const run = await store.getRun(req.auth!, param(req, "id"));
    if (!run) { res.status(404).json({ error: "Run not found" }); return; }
    res.json({ run });
  }));

  app.get("/api/v1/audit-log", auth, asyncHandler(async (req, res) => {
    const audits = await store.listAudits(req.auth!);
    res.json({ audits });
  }));

  app.post("/api/v1/runs/:id/hitl/take-control", auth, asyncHandler(async (req, res) => {
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

  app.post("/api/v1/runs/:id/hitl/complete", auth, asyncHandler(async (req, res) => {
    try {
      await store.completeHitlIntervention(req.auth!.tenantId, param(req, "id"));
      res.json({ success: true, message: "Human intervention marked as complete. Verifying handoff." });
    } catch (e: any) {
      res.status(400).json({ error: { code: "HITL_COMPLETE_ERROR", message: e.message } });
    }
  }));

  app.post("/api/v1/runs/:id/claim", auth, asyncHandler(async (req, res) => {
    const claimed = await store.claimRun(req.auth!, param(req, "id"));
    if (!claimed) {
      res.status(409).json({ error: { code: "CLAIM_FAILED", message: "Run not available for claiming (not found or not QUEUED)", request_id: req.id } });
      return;
    }
    res.json({ run: claimed, steps: await store.listExecutionSteps(req.auth!, claimed.id) });
  }));

  app.post("/api/v1/runs/:id/pause", auth, asyncHandler(async (req, res) => {
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

  app.post("/api/v1/runs/:id/resume", auth, asyncHandler(async (req, res) => {
    const run = await store.updateRunState(req.auth!, param(req, "id"), "RESUMING");
    if (!run) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Run not found", request_id: req.id } });
      return;
    }
    await store.writeAudit(req.auth!, "EXECUTION_RESUMED", "execution_run", run.id);
    res.status(202).json({ run });
  }));

  app.post("/api/v1/runs/:id/cancel", auth, asyncHandler(async (req, res) => {
    const run = await store.updateRunState(req.auth!, param(req, "id"), "CANCELLED");
    if (!run) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Run not found", request_id: req.id } });
      return;
    }
    await store.writeAudit(req.auth!, "RUN_CANCELLED", "execution_run", run.id);
    res.status(202).json({ run });
  }));

  app.get("/api/v1/hitl", auth, asyncHandler(async (req, res) => {
    res.json({ hitl_requests: await store.listHitlRequests(req.auth!) });
  }));


  // Ghost Workers API
  app.get("/api/v1/ghost-workers", auth, asyncHandler(async (req, res) => {
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

  app.post("/api/v1/ghost-workers", auth, asyncHandler(async (req, res) => {
    const worker = await store.createGhostWorker(req.auth!, req.body);
    res.status(201).json(worker);
  }));

  app.post("/api/v1/ghost-workers/:id/documents", auth, asyncHandler(async (req, res) => {
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

  app.get("/api/v1/ghost-workers/:id/documents", auth, asyncHandler(async (req, res) => {
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

  app.delete("/api/v1/ghost-workers/:id/documents/:docId", auth, asyncHandler(async (req, res) => {
    const targetId = param(req, "id");
    const docId = param(req, "docId");
    let worker = await store.getGhostWorker(req.auth!, targetId);
    if (!worker) {
      const all = await store.listGhostWorkers(req.auth!);
      worker = all.find(w => w.id === targetId || (w as any).allIds?.includes(targetId)) ||
               all.find(w => w.name && w.name.trim().toLowerCase() === targetId.trim().toLowerCase());
    }
    const resolvedId = worker ? worker.id : targetId;
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

  app.get("/api/v1/ghost-workers/:id", auth, asyncHandler(async (req, res) => {
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

  app.post("/api/v1/ghost-workers/:id", auth, asyncHandler(async (req, res) => {
    const worker = await store.updateGhostWorker(req.auth!, param(req, "id"), req.body);
    if (!worker) {
      res.status(404).json({ error: "Worker not found" });
      return;
    }
    res.json(worker);
  }));

  app.post("/api/v1/ghost-workers/:id/chat", auth, asyncHandler(async (req, res) => {
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
              newVersion = await store.createWorkflowVersion(req.auth!, workflow as any);
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

  app.get("/api/v1/ghost-workers/:id/memory", auth, asyncHandler(async (req, res) => {
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

  app.delete("/api/v1/ghost-workers/:id/memory", auth, asyncHandler(async (req, res) => {
    const targetId = param(req, "id");
    const { purgeWorkerFullState } = await import("./services/doc-purge.js");
    await purgeWorkerFullState(store, req.auth!, targetId);
    logger.info({ worker_id: targetId }, "ALL_WORKER_MEMORY_AND_WORKFLOW_PURGED");
    res.json({ success: true, message: "All memory and derived workflows purged instantly" });
  }));

  app.delete("/api/v1/ghost-workers/:id/memory/:memoryId", auth, asyncHandler(async (req, res) => {
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

  app.get("/api/v1/ghost-workers/:id/evidence", auth, asyncHandler(async (req, res) => {
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

  app.post("/api/v1/ghost-workers/:id/recompile", auth, asyncHandler(async (req, res) => {
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
          version = await store.createWorkflowVersion(req.auth!, workflow as any);
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


  app.post("/api/v1/ghost-workers/:id/test", auth, asyncHandler(async (req, res) => {
    const worker = await store.getGhostWorker(req.auth!, param(req, "id"));
    if (!worker || !worker.activeVersionId) {
      res.status(404).json({ error: "Worker or active version not found" });
      return;
    }
    const run = await store.createRun(req.auth!, worker.activeVersionId, req.header("idempotency-key") ?? undefined, worker.id, "TEST");
    triggerWorkerDaemon(run.id);
    res.status(202).json({ run });
  }));

  app.post("/api/v1/ghost-workers/:id/activate", auth, asyncHandler(async (req, res) => {
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

  app.post("/api/v1/ghost-workers/:id/run", auth, asyncHandler(async (req, res) => {
    let worker = await store.getGhostWorker(req.auth!, param(req, "id"));
    if (!worker) {
      const all = await store.listGhostWorkers(req.auth!);
      worker = all.find(w => w.id === param(req, "id") || (w as any).allIds?.includes(param(req, "id")));
    }
    if (!worker) {
      res.status(404).json({ error: "Worker not found" });
      return;
    }


    if (!worker.activeVersionId) {
      try {
        const docs = await store.listDocuments(req.auth!, worker.id);
        if (docs && docs.length > 0) {
          const { analyzeFromDocuments } = await import("./bpi-service.js");
          const result = await analyzeFromDocuments(config, store, req.auth!, worker.id);
          const bps = await store.getBPS(req.auth!, result.bpsId);
          if (bps) {
            const { WorkflowCompiler } = await import("./compiler.js");
            const compiler = new WorkflowCompiler(aiProvider);
            const workflow = await compiler.compile(bps.specificationJson, { version: "phase3-compiler-1.0" });
            const version = await store.createWorkflowVersion(req.auth!, workflow as any);
            await store.updateGhostWorker(req.auth!, worker.id, { workflowId: version.workflowId, activeVersionId: version.id } as any);
            worker.activeVersionId = version.id;
          }
        }
      } catch (autoErr) {
        logger.warn({ workerId: worker.id, err: autoErr }, "Auto-compilation from documents skipped");
      }
    }

    if (!worker.activeVersionId) {
      res.status(400).json({ error: "Worker does not have an active trained workflow version yet." });
      return;
    }

    const run = await store.createRun(req.auth!, worker.activeVersionId, req.header("idempotency-key") ?? undefined, worker.id, "PRODUCTION");
    triggerWorkerDaemon(run.id);
    res.status(202).json({ run, workerId: worker.id });
  }));

  // Exceptions API (HITL)
  app.get("/api/v1/exceptions", auth, asyncHandler(async (req, res) => {
    // Alias to hitl_requests for the frontend product layer
    res.json({ exceptions: await store.listHitlRequests(req.auth!) });
  }));

  app.post("/api/v1/exceptions/:id/resolve", auth, asyncHandler(async (req, res) => {
    try {
      const hitls = await store.listHitlRequests(req.auth!);
      const hitl = hitls.find(h => h.id === param(req, "id"));
      if (!hitl) {
        res.status(404).json({ error: "Exception not found" });
        return;
      }

      const run = await store.getRun(req.auth!, hitl.runId);
      if (!run) throw new Error("Linked run not found");

      const credentials = req.body.credentials || (req.body.username || req.body.password || req.body.otp ? { username: req.body.username, password: req.body.password, otp: req.body.otp } : null);
      if (credentials) {
        // Forward transiently to worker daemon for active page typing (Never stored in database)
        await fetch(`http://127.0.0.1:4005/hitl-resolve/${hitl.runId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(credentials),
          signal: AbortSignal.timeout(3000)
        }).catch(() => null);

        // Mark all matching pending HITL requests for this run as RESOLVED
        await (store as any).supabase?.from("hitl_requests").update({
          state: "RESOLVED",
          resolved_at: new Date().toISOString()
        }).eq("id", hitl.id);

        await (store as any).supabase?.from("hitl_requests").update({
          state: "RESOLVED",
          resolved_at: new Date().toISOString()
        }).eq("run_id", hitl.runId).eq("state", "PENDING");

        await store.updateRunState(req.auth!, hitl.runId, "RUNNING", { hitl_resolved: true }).catch(() => {});

        // FAST RETURN: Authentication submission resumes immediately without saving credentials anywhere
        res.json({
          success: true,
          message: "Credentials transmitted securely to live execution session. Resumed.",
          workflow_updated: false,
          new_version_id: null,
          blocking_gaps: 0,
          recompile_error: null
        });
        return;
      }

      // ──────────────────────────────────────────────────────────
      // Non-credential guidance / clarification resolution
      // ──────────────────────────────────────────────────────────
      const resolution = req.body.resolution || req.body.text || req.body.answer || "Resolved manually by operator";
      await fetch(`http://127.0.0.1:4005/hitl-resolve/${hitl.runId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution }),
        signal: AbortSignal.timeout(3000)
      }).catch(() => null);

      // If we don't own it, take control first implicitly
      await store.takeHitlControl(req.auth!.tenantId, req.auth!.userId, hitl.runId).catch(() => {});

      // Mark HITL request as RESOLVED in database
      await (store as any).supabase?.from("hitl_requests").update({
        state: "RESOLVED",
        resolved_at: new Date().toISOString()
      }).eq("id", hitl.id);

      await (store as any).supabase?.from("hitl_requests").update({
        state: "RESOLVED",
        resolved_at: new Date().toISOString()
      }).eq("run_id", hitl.runId).eq("state", "PENDING");

      // Save correction to memory
      await store.addMemoryRule(req.auth!, run.workerId!, resolution, {
        source: "HITL",
        runId: hitl.runId,
        is_auth: false
      }).catch(() => {});

      await store.completeHitlIntervention(req.auth!.tenantId, hitl.runId).catch(() => {});
      await store.updateRunState(req.auth!, hitl.runId, "RUNNING", { hitl_resolved: true, resolution }).catch(() => {});

      // Recompile with a 10s timeout so the HTTP client never aborts/times out
      let workflowUpdated = false;
      let newVersionId: string | null = null;
      let blockingGaps = 0;
      let recompileError: string | null = null;
      try {
        const recompileTask = async () => {
          const { analyzeFromDocuments } = await import("./bpi-service.js");
          const result = await analyzeFromDocuments(config, store, req.auth!, run.workerId!);
          blockingGaps = result.gaps.filter(g => g.blocking).length;
          if (blockingGaps === 0) {
            const bps = await store.getBPS(req.auth!, result.bpsId);
            if (bps) {
              const { WorkflowCompiler } = await import("./compiler.js");
              const compiler = new WorkflowCompiler(aiProvider);
              const workflow = await compiler.compile(bps.specificationJson, { version: "phase3-compiler-1.0" });
              const version = await store.createWorkflowVersion(req.auth!, workflow as any);
              await store.updateGhostWorker(req.auth!, run.workerId!, { workflowId: version.workflowId, activeVersionId: version.id } as any);
              workflowUpdated = true;
              newVersionId = version.id;
            }
          }
        };

        const timeoutPromise = new Promise<{ timeout: true }>((resolve) => setTimeout(() => resolve({ timeout: true }), 10000));
        const resOrTimeout = await Promise.race([recompileTask(), timeoutPromise]);

        if (resOrTimeout && typeof resOrTimeout === "object" && "timeout" in resOrTimeout) {
          // Recompilation is still running in background; respond immediately so browser does not timeout
          res.json({
            success: true,
            message: "Correction saved. Workflow recompilation is proceeding in background.",
            workflow_updated: false,
            new_version_id: null,
            blocking_gaps: 0,
            recompile_error: null
          });
          return;
        }
      } catch (e: any) {
        logger.error({ err: e, run_id: hitl.runId }, "exception_resolve_recompile_failed");
        recompileError = e.message || "Recompilation failed";
      }

      res.json({
        success: true,
        message: workflowUpdated
          ? "Exception resolved. Memory updated and a new workflow version is now active."
          : recompileError
            ? `Correction saved, but recompilation failed: ${recompileError}`
            : "Correction saved. Additional clarification is still needed before the workflow can update.",
        workflow_updated: workflowUpdated,
        new_version_id: newVersionId,
        blocking_gaps: blockingGaps,
        recompile_error: recompileError
      });
    } catch (e: any) {
      res.status(400).json({ error: { code: "EXCEPTION_RESOLVE_ERROR", message: e.message } });
    }
  }));

  app.post("/api/v1/runs/:id/hitl/submit-credentials", auth, asyncHandler(async (req, res) => {
    const runId = param(req, "id");
    const { username, password, otp } = req.body || {};
    try {
      // Forward transiently to worker daemon
      const resp = await fetch(`http://127.0.0.1:4005/hitl-resolve/${runId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, otp }),
        signal: AbortSignal.timeout(3000)
      }).then(r => r.json()).catch(() => ({ ok: false }));

      // Find any pending HITL request for this run and mark resolved
      const hitls = await store.listHitlRequests(req.auth!);
      const pendingHitls = hitls.filter(h => h.runId === runId && h.state === "PENDING");
      for (const ph of pendingHitls) {
        await (store as any).supabase?.from("hitl_requests").update({
          state: "RESOLVED",
          resolved_at: new Date().toISOString()
        }).eq("id", ph.id);
      }

      await store.updateRunState(req.auth!, runId, "RUNNING", { hitl_resolved: true });

      res.json({
        success: true,
        message: "Credentials submitted securely. Execution resumed.",
        workerHandled: resp.ok
      });
    } catch (err: any) {
      res.status(400).json({ error: { code: "CREDENTIAL_SUBMIT_ERROR", message: err.message } });
    }
  }));

  // ──────────────────────────────────────────────────────────
  // BPI Analysis & Clarification
  // ──────────────────────────────────────────────────────────

  app.post("/api/v1/ghost-workers/:id/analyze", auth, asyncHandler(async (req, res) => {
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

  app.post("/api/v1/ghost-workers/:id/analyze-documents", auth, asyncHandler(async (req, res) => {
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

  app.get("/api/v1/ghost-workers/:id/gaps", auth, asyncHandler(async (req, res) => {
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

  app.post("/api/v1/ghost-workers/:id/gaps/:gapId/answer", auth, asyncHandler(async (req, res) => {
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
          const version = await store.createWorkflowVersion(req.auth!, workflow as any);
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

  app.get("/api/v1/ghost-workers/:id/plan", auth, asyncHandler(async (req, res) => {
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

  app.post("/api/v1/ghost-workers/:id/oir/draft", auth, asyncHandler(async (req, res) => {
    const worker = await store.getGhostWorker(req.auth!, param(req, "id"));
    if (!worker) { res.status(404).json({ error: "Worker not found" }); return; }
    const envelope = await createOirDraft(store, req.auth!, worker, req.body ?? {});
    res.status(201).json({ oir_review: envelope });
  }));

  app.get("/api/v1/ghost-workers/:id/oir", auth, asyncHandler(async (req, res) => {
    const worker = await store.getGhostWorker(req.auth!, param(req, "id"));
    if (!worker) { res.status(404).json({ error: "Worker not found" }); return; }
    const envelope = readOirReview(worker);
    if (!envelope) { res.status(404).json({ error: "OIR draft not found" }); return; }
    res.json({ oir_review: envelope });
  }));

  app.post("/api/v1/ghost-workers/:id/oir/approve", auth, asyncHandler(async (req, res) => {
    const worker = await store.getGhostWorker(req.auth!, param(req, "id"));
    if (!worker) { res.status(404).json({ error: "Worker not found" }); return; }
    try {
      const envelope = await approveOirDraft(store, req.auth!, worker);
      res.json({ oir_review: envelope });
    } catch (error: any) {
      res.status(409).json({ error: { code: "OIR_APPROVAL_BLOCKED", message: error.message, request_id: req.id } });
    }
  }));

  app.get("/api/v1/ghost-workers/:id/analysis-stage", auth, asyncHandler(async (req, res) => {
    const worker = await store.getGhostWorker(req.auth!, param(req, "id"));
    if (!worker) { res.status(404).json({ error: "Worker not found" }); return; }
    const { getStageLabel } = await import("./bpi-service.js");
    res.json({ stage: worker.analysisStage ?? "READING_DEMONSTRATION", label: getStageLabel((worker.analysisStage ?? "READING_DEMONSTRATION") as any), status: worker.status });
  }));

  app.post("/api/v1/ghost-workers/:id/compile", auth, asyncHandler(async (req, res) => {
    const worker = await store.getGhostWorker(req.auth!, param(req, "id"));
    if (!worker || !worker.bpsId) { res.status(404).json({ error: "Worker or BPS not found" }); return; }
    const bps = await store.getBPS(req.auth!, worker.bpsId);
    if (!bps) { res.status(404).json({ error: "BPS not found" }); return; }
    try {
      const { WorkflowCompiler } = await import("./compiler.js");
      const compiler = new WorkflowCompiler(aiProvider);
      const workflow = await compiler.compile(bps.specificationJson, { version: "phase3-compiler-1.0" });
      const version = await store.createWorkflowVersion(req.auth!, workflow as any);
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

  app.post("/api/v1/ghost-workers/:id/workflow/edit", auth, asyncHandler(async (req, res) => {
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

    const version = await store.createWorkflowVersion(req.auth!, editedWorkflow);
    await store.updateGhostWorker(req.auth!, worker.id, { workflowId: version.workflowId, activeVersionId: version.id } as any);

    res.status(201).json({ workflow_version_id: version.id, workflow_id: version.workflowId, message: "New workflow version created successfully" });
  }));


  // ──────────────────────────────────────────────────────────
  // Schedules
  // ──────────────────────────────────────────────────────────

  app.get("/api/v1/ghost-workers/:id/schedules", auth, asyncHandler(async (req, res) => {
    res.json({ schedules: await store.listSchedules(req.auth!, param(req, "id")) });
  }));

  app.post("/api/v1/ghost-workers/:id/schedules", auth, asyncHandler(async (req, res) => {
    const worker = await store.getGhostWorker(req.auth!, param(req, "id"));
    if (!worker) { res.status(404).json({ error: "Worker not found" }); return; }
    const schedule = await store.createSchedule(req.auth!, { workerId: worker.id, cronExpression: req.body?.cron_expression ?? "0 9 * * *" });
    res.status(201).json(schedule);
  }));

  app.delete("/api/v1/schedules/:id", auth, asyncHandler(async (req, res) => {
    const ok = await store.deleteSchedule(req.auth!, param(req, "id"));
    res.json({ deleted: ok });
  }));

  // ──────────────────────────────────────────────────────────
  // Connections
  // ──────────────────────────────────────────────────────────

  app.get("/api/v1/connections", auth, asyncHandler(async (req, res) => {
    res.json({ connections: await store.listConnections(req.auth!) });
  }));

  app.post("/api/v1/connections", auth, asyncHandler(async (req, res) => {
    const conn = await store.createConnection(req.auth!, {
      name: req.body?.name ?? "Untitled",
      system: req.body?.system ?? "unknown",
      connectionType: req.body?.connection_type ?? "browser_login",
      secretRef: req.body?.secret_ref ?? `ref_${crypto.randomUUID()}`
    });
    res.status(201).json(conn);
  }));

  app.delete("/api/v1/connections/:id", auth, asyncHandler(async (req, res) => {
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
  const tenantSettings = new Map<string, Record<string, any>>();

  app.get("/api/v1/settings", auth, asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const current = tenantSettings.get(tenantId) || {
      theme: "dark",
      telemetry: true,
      notifications: { email: true, hitl: true },
      browserTimeout: 30000,
      defaultModel: config.geminiModel || "gemini-2.5-flash",
    };
    res.json({ settings: current });
  }));

  app.patch("/api/v1/settings", auth, asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const existing = tenantSettings.get(tenantId) || {
      theme: "dark",
      telemetry: true,
      notifications: { email: true, hitl: true },
      browserTimeout: 30000,
      defaultModel: config.geminiModel || "gemini-2.5-flash",
    };
    const updated = { ...existing, ...req.body };
    tenantSettings.set(tenantId, updated);
    res.json({ settings: updated });
  }));



  // ──────────────────────────────────────────────────────────
  // Run Detail & Result
  // ──────────────────────────────────────────────────────────

  app.get("/api/v1/runs/:id/detail", auth, asyncHandler(async (req, res) => {
    const run = await store.getRun(req.auth!, param(req, "id"));
    if (!run) { res.status(404).json({ error: "Run not found" }); return; }
    const steps = await store.listExecutionSteps(req.auth!, run.id);
    const hitls = (await store.listHitlRequests(req.auth!)).filter(h => h.runId === run.id);

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

    res.json({ 
      run, 
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
