import { Router, type Request, type Response } from "express";
import * as path from "path";
import * as fs from "fs";
import { createHash } from "crypto";
import type { AuthContext } from "@ghost/shared-types";
import { assessExecutionReadiness, type ReadinessReport } from "@ghost/workflow-schema";
import { AppStore, type DocumentRow } from "../store.js";
import { logger } from "@ghost/observability";
import { DesktopEvidenceBridge } from "../services/desktop-evidence-bridge.js";
import { BusinessProcessIntelligence } from "@ghost/bpi";
import { RealSemanticBPIProvider } from "../ai-provider.js";
import { WorkflowCompiler } from "../compiler.js";
import type { ApiConfig } from "../config.js";
import { purgeOrRecompileWorkerAfterDocDeletion } from "../services/doc-purge.js";
import { EvidenceToWorkflowPipeline, PrecomputedSemanticBPIProvider, type PipelineExecutionResult } from "../services/evidence/evidence-pipeline.js";
import { OpenRouterQuotaManager } from "../services/openrouter/quota-manager.js";
import type { RawVisualObservation } from "../services/evidence/task-relevance-engine.js";
import type { OcrFact } from "../services/openrouter/types.js";

const asyncHandler = (fn: (req: Request, res: Response) => Promise<any>) =>
  (req: Request, res: Response, next: any) =>
    Promise.resolve(fn(req, res)).catch(next);

const param = (req: Request, name: string): string => {
  const value = req.params[name] || (req.params as any)?.workerId;
  if (!value) {
    const match = (req.originalUrl || req.baseUrl || "").match(/\/ghost-workers\/([^/]+)/);
    if (match && match[1]) return match[1];
    throw new Error(`Missing route parameter: ${name}`);
  }
  return Array.isArray(value) ? value[0]! : value;
};

export function formatHumanReadableUncertainty(u: any, idx: number = 0): any {
  let q = (u.clarification_question || u.suggested_clarification_question || u.question || u.description || "").trim();
  const rawId = (u.id || u.uncertainty_type || "").toLowerCase();
  const isIdLike = !q ||
                   q.startsWith("unc_") ||
                   q.startsWith("gap_") ||
                   !q.includes(" ") ||
                   /^[a-z0-9_-]+$/i.test(q) ||
                   /\b(?:msg|message|id|code|err|error)[_\s-]*\d{3,}\b/i.test(q) ||
                   /^message\s*id\b/i.test(q) ||
                   /^\d+$/.test(q);

  if (isIdLike) {
    if (rawId.includes("auth") || rawId.includes("login") || rawId.includes("cred")) {
      q = "How should the autoworker handle the sign-in step if authentication or credentials are required?";
    } else if (rawId.includes("click") || rawId.includes("action") || rawId.includes("target")) {
      const app = u.application || "the active application";
      q = `Which element or button should the autoworker click in ${app} to proceed?`;
    } else if (rawId.includes("value") || rawId.includes("input") || rawId.includes("text") || rawId.includes("var")) {
      q = "What specific value or format should the autoworker enter into this field?";
    } else if (rawId.includes("modal") || rawId.includes("popup") || rawId.includes("alert")) {
      q = "How should the autoworker proceed when an unexpected popup or confirmation dialog appears?";
    } else if (rawId.includes("resolution") || rawId.includes("evidence") || rawId.includes("insufficient")) {
      q = `How should the autoworker execute step ${idx + 1} when standard elements vary across runs?`;
    } else if (u.description && u.description.includes(" ") && !u.description.startsWith("unc_") && !u.description.startsWith("gap_") && !/\b\d{4,}\b/.test(u.description)) {
      q = `How should the autoworker proceed regarding: ${u.description}?`;
    } else {
      q = `How should the autoworker handle step ${idx + 1} if the primary element is not interactable?`;
    }
  }

  if (!q.endsWith("?")) {
    q = q + "?";
  }

  return {
    ...u,
    clarification_question: q,
    question: q,
    suggested_clarification_question: q
  };
}

/** Magic-byte checks: the stored file must really be the media type its name claims. */
const MEDIA_SIGNATURES: Array<{ type: "VIDEO" | "IMAGE"; extensions: string[]; matches: (b: Buffer) => boolean }> = [
  { type: "VIDEO", extensions: [".webm", ".mkv"], matches: b => b.length > 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
  { type: "VIDEO", extensions: [".mp4", ".mov", ".m4v"], matches: b => b.length > 12 && b.subarray(4, 8).toString("ascii") === "ftyp" },
  { type: "VIDEO", extensions: [".avi"], matches: b => b.length > 12 && b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "AVI " },
  { type: "IMAGE", extensions: [".png"], matches: b => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { type: "IMAGE", extensions: [".jpg", ".jpeg"], matches: b => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "IMAGE", extensions: [".webp"], matches: b => b.length > 12 && b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP" }
];

export function detectMediaType(name: string, bytes: Buffer): "VIDEO" | "IMAGE" | "DESKTOP_RECORDING" | undefined {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".json") {
    try { JSON.parse(bytes.toString("utf8")); return "DESKTOP_RECORDING"; } catch { return undefined; }
  }
  const signature = MEDIA_SIGNATURES.find(s => s.extensions.includes(ext));
  return signature && signature.matches(bytes) ? signature.type : undefined;
}

export function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function storageDir(tenantId: string, workerId: string): string {
  return path.resolve("./evidence_storage", tenantId, workerId);
}

/** True when the path resolves inside this tenant's and worker's evidence storage. */
function isInsideStorage(candidate: string, tenantId: string, workerId: string): boolean {
  const root = storageDir(tenantId, workerId) + path.sep;
  return path.resolve(candidate).startsWith(root);
}

type ResolvedMedia = { doc?: DocumentRow; filePath: string; contentSha256: string };

/**
 * Resolves the media an analysis or compilation refers to. Only this worker's uploaded documents
 * (or files inside its own storage directory) can be analysed; arbitrary server paths are refused.
 */
async function resolveWorkerMedia(store: AppStore, auth: AuthContext, workerId: string, body: any): Promise<ResolvedMedia | { error: string; status: number }> {
  const docId = body.documentId || body.assetId;
  if (docId) {
    const doc = await store.getDocument(auth, docId);
    if (!doc || (doc.workerId && doc.workerId !== workerId)) return { error: "Evidence document not found for this worker", status: 404 };
    const filePath = (doc.parsedJson as any)?.filePath;
    if (!filePath || !fs.existsSync(filePath)) return { error: "The uploaded evidence file is missing from storage", status: 410 };
    const contentSha256 = (doc.parsedJson as any)?.sha256 || sha256(fs.readFileSync(filePath));
    return { doc, filePath, contentSha256 };
  }
  const legacyPath = body.filePath || body.videoPath;
  if (legacyPath) {
    if (!isInsideStorage(legacyPath, auth.tenantId, workerId) || !fs.existsSync(legacyPath)) {
      return { error: "Evidence must be referenced by its uploaded document id", status: 400 };
    }
    return { filePath: path.resolve(legacyPath), contentSha256: sha256(fs.readFileSync(legacyPath)) };
  }
  return { error: "Evidence file not found: no document specified", status: 400 };
}

export function createEvidenceRouter(config: ApiConfig, store: AppStore): Router {
  const router = Router({ mergeParams: true });
  const bridge = DesktopEvidenceBridge.getInstance();
  const aiProvider = new RealSemanticBPIProvider(config);

  /**
   * Persists a compiled workflow version and, only if it is executable, makes it the worker's active
   * version. In-flight runs of the replaced version are cancelled (their history is kept).
   */
  async function persistAndBind(auth: AuthContext, workerId: string, workflow: any, trainingSource: Record<string, unknown>, bpsId?: string) {
    const readiness: ReadinessReport = assessExecutionReadiness(workflow);
    (workflow.compiler as any).readiness = readiness;
    (workflow.compiler as any).worker_id = workerId;
    const version = await store.createWorkflowVersion(auth, workflow);
    if (!readiness.executable) {
      return { version, readiness, bound: false };
    }
    await store.supersedeWorkerRuns(auth, workerId, `Workflow replaced by version ${version.id}`);
    const currentWorker = await store.getGhostWorker(auth, workerId);
    const source = { ...trainingSource, workflowVersionId: version.id, compiledAt: new Date().toISOString() };
    await store.updateGhostWorker(auth, workerId, {
      workflowId: version.workflowId,
      activeVersionId: version.id,
      ...(bpsId ? { bpsId } : {}),
      status: "READY_FOR_REVIEW",
      trainingSource: source,
      triggerConfig: { ...(currentWorker?.triggerConfig || {}), trainingSource: source }
    } as any);
    return { version, readiness, bound: true };
  }

  function notExecutableResponse(res: Response, jobId: string, versionId: string, readiness: ReadinessReport, extra: Record<string, unknown> = {}) {
    return res.status(422).json({
      success: false,
      status: "NEEDS_CLARIFICATION",
      error: "A workflow was reconstructed but it is not safe to run yet. It was saved as a draft and not activated.",
      jobId,
      draftWorkflowVersionId: versionId,
      readiness: readiness.issues,
      ...extra
    });
  }

  // 1. Upload Video or Screenshot Evidence
  router.post("/upload", asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const workerId = param(req, "id");
    const { name, content } = req.body;

    if (!name || !content || typeof content !== "string") {
      return res.status(400).json({ error: "Missing name or content" });
    }

    const bytes = content.startsWith("data:")
      ? Buffer.from(content.split(";base64,").pop() || "", "base64")
      : Buffer.from(content, "utf-8");
    if (!bytes.length) {
      return res.status(400).json({ error: "The uploaded file is empty", code: "EMPTY_UPLOAD" });
    }
    const mediaType = detectMediaType(name, bytes);
    if (!mediaType) {
      return res.status(415).json({ error: `"${path.basename(name)}" is not a supported, decodable video or image (webm, mkv, mp4, mov, avi, png, jpg, webp).`, code: "UNSUPPORTED_MEDIA" });
    }
    const contentSha256 = sha256(bytes);

    // Identity is the content, not the file name: the same bytes are reused, a different
    // recording with the same name is stored and analysed as a new upload.
    const existingDocs = await store.listDocuments(auth, workerId);
    const duplicate = existingDocs.find(d => (d.parsedJson as any)?.sha256 === contentSha256 && fs.existsSync((d.parsedJson as any)?.filePath || ""));
    if (duplicate) {
      logger.info({ workerId, docId: duplicate.id }, "Upload has identical content to an existing evidence document");
      return res.status(200).json({
        document: duplicate,
        asset: { id: duplicate.id, name: duplicate.name },
        filePath: (duplicate.parsedJson as any).filePath,
        mediaId: duplicate.id,
        duplicateOf: duplicate.id
      });
    }

    const uploadsDir = storageDir(auth.tenantId, workerId);
    fs.mkdirSync(uploadsDir, { recursive: true });
    const safeName = `${Date.now()}_${contentSha256.slice(0, 12)}_${path.basename(name).replace(/[^\w.\-]+/g, "_")}`;
    const targetFilePath = path.join(uploadsDir, safeName);
    fs.writeFileSync(targetFilePath, bytes);

    const doc = await store.createDocument(auth, {
      workerId,
      type: mediaType,
      name,
      parsedJson: {
        filePath: targetFilePath,
        fileName: safeName,
        sha256: contentSha256,
        sizeBytes: bytes.length,
        uploadedAt: new Date().toISOString(),
      },
    });

    res.status(201).json({
      document: doc,
      asset: { id: doc.id, name: doc.name },
      filePath: targetFilePath,
      mediaId: doc.id,
    });
  }));

  // List past media evidence and jobs for worker
  router.get("/", asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const workerId = param(req, "id");
    const worker = await store.getGhostWorker(auth, workerId).catch(() => undefined);
    const resolvedId = worker?.id || workerId;

    try {
      const [evidence, docs] = await Promise.all([
        store.getWorkerEvidence(auth, resolvedId).catch(() => ({ documents: [], runs: [] })),
        store.listDocuments(auth, resolvedId).catch(() => [])
      ]);

      const mediaDocs = docs.filter(d =>
        (d.type as string) === 'VIDEO' ||
        (d.type as string) === 'IMAGE' ||
        (d.type as string) === 'DESKTOP_RECORDING' ||
        Boolean(d.name?.match(/\.(mp4|webm|mov|mkv|avi|png|jpg)$/i))
      );

      return res.json({
        evidence: evidence || { documents: [], runs: [] },
        documents: mediaDocs,
        allDocuments: docs
      });
    } catch (err: any) {
      logger.warn({ err: err?.message, workerId: resolvedId }, "Failed to fetch full worker evidence");
      return res.status(503).json({ error: "Evidence could not be loaded", evidence: { documents: [], runs: [] }, documents: [], allDocuments: [] });
    }
  }));

  // 2. Trigger Asynchronous Desktop Evidence Analysis
  router.post("/analyze", asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const workerId = param(req, "id");
    const media = await resolveWorkerMedia(store, auth, workerId, req.body || {});
    if ("error" in media) {
      return res.status(media.status).json({ error: media.error });
    }

    const reusable = !req.body?.forceReanalyze && bridge.findCompletedJobForContent(media.contentSha256, auth.tenantId, workerId);
    const inFlight = bridge.listJobs().find(j => j.contentSha256 === media.contentSha256 && j.tenantId === auth.tenantId && j.workerId === workerId && ["QUEUED", "RUNNING", "EXTRACTING"].includes(j.status));
    const existingJob = reusable || inFlight;
    if (existingJob) {
      logger.info({ jobId: existingJob.jobId }, "Reusing analysis of identical content for this worker");
      return res.status(200).json({
        jobId: existingJob.jobId,
        job: { id: existingJob.jobId, status: existingJob.status, currentStage: existingJob.currentStage, progressPercent: existingJob.progressPercent, result: existingJob.result },
        status: existingJob.status,
        currentStage: existingJob.currentStage,
        progressPercent: existingJob.progressPercent,
        reused: true
      });
    }

    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const outputDir = path.resolve("./evidence_output", auth.tenantId, workerId);
    const job = await bridge.analyzeMedia({
      jobId,
      mediaPath: media.filePath,
      outputDir,
      tenantId: auth.tenantId,
      workerId,
      ...(media.doc ? { documentId: media.doc.id } : {}),
      contentSha256: media.contentSha256
    });

    res.status(202).json({
      jobId: job.jobId,
      job: { id: job.jobId, status: job.status, currentStage: job.currentStage, progressPercent: job.progressPercent },
      status: job.status,
      currentStage: job.currentStage,
      progressPercent: job.progressPercent,
    });
  }));

  const workerJob = (req: Request) => {
    const job = bridge.getJob(param(req, "jobId"), req.auth!.tenantId);
    const workerId = param(req, "id");
    return job && (!job.workerId || job.workerId === workerId) ? job : undefined;
  };

  // 3. Poll Analysis Job Status
  router.get("/jobs/:jobId", asyncHandler(async (req, res) => {
    const job = workerJob(req);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    res.json({ job, ...job });
  }));

  // 4. Retrieve Reconstructed Timeline
  router.get("/jobs/:jobId/timeline", asyncHandler(async (req, res) => {
    const job = workerJob(req);
    if (!job || !job.result) {
      return res.status(404).json({ error: "Job timeline not ready or job not found" });
    }
    res.json({
      timeline: job.result.timeline,
      processUnderstanding: job.result.process_understanding,
      semanticActions: job.result.semantic_actions,
      droppedActions: job.result.dropped_actions || [],
      frames: job.result.frames,
      uncertainties: (job.result.uncertainties || []).map((u: any, i: number) => formatHumanReadableUncertainty(u, i)),
      compiledWorkflow: job.result.compiledWorkflow || null,
      compiledWorkflowVersionId: job.result.compiledWorkflowVersionId || null,
      grounding: job.result.grounding || null,
      specification: job.result.specification || null,
      bpsId: job.result.bpsId || null,
    });
  }));

  // 4.5 Serve one extracted frame of this worker's analysis job (tenant- and worker-scoped).
  router.get("/jobs/:jobId/frames/:frameId", asyncHandler(async (req, res) => {
    const job = workerJob(req);
    const frameId = param(req, "frameId");
    const frame = (job?.result?.frames || []).find((f: any) => f.frame_id === frameId);
    const filePath = frame?.image_path || frame?.thumbnail_path;
    const allowedRoot = job?.outputDir ? path.resolve(job.outputDir) + path.sep : undefined;
    if (!job || !filePath || !allowedRoot || !path.resolve(filePath).startsWith(allowedRoot) || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Frame not found" });
    }
    res.setHeader("Cache-Control", "private, max-age=300");
    res.type(path.extname(filePath) || ".jpg");
    fs.createReadStream(filePath).pipe(res);
  }));

  // 5. Compile Analyzed Demonstration directly into BPS and Workflow V2
  router.post("/compile-from-job/:jobId", asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const workerId = param(req, "id");
    const jobId = param(req, "jobId");
    const userObjective = typeof req.body?.taskObjective === "string" ? req.body.taskObjective.trim() : "";

    const job = bridge.getJob(jobId, auth.tenantId);
    if (!job || !job.result) {
      return res.status(404).json({ error: "Analysis job not found" });
    }
    if (job.workerId && job.workerId !== workerId) {
      return res.status(404).json({ error: "Analysis job not found" });
    }

    try {
    const states: any[] = job.result.timeline?.states || [];
    const stateByFrame = new Map(states.map((s: any) => [s.frame_id, s]));

    // Frames with their real timestamps, in recording order.
    const rawFrames: Array<{ frameId: string; timestamp: number; filePath: string }> = [];
    let framesWithoutTimestamp = 0;
    for (const f of job.result.frames || []) {
      const filePath = f.image_path || f.thumbnail_path;
      const timestamp = typeof f.timestamp_seconds === "number" ? f.timestamp_seconds : stateByFrame.get(f.frame_id)?.timestamp;
      if (!filePath || !fs.existsSync(filePath)) continue;
      if (typeof timestamp !== "number") { framesWithoutTimestamp++; continue; }
      rawFrames.push({ frameId: f.frame_id, timestamp, filePath });
    }
    if (!rawFrames.length) {
      const framesDir = [job.outputDir && path.join(job.outputDir, jobId, "frames"), path.resolve("./evidence_output", auth.tenantId, workerId, jobId, "frames")]
        .filter((d): d is string => Boolean(d)).find(d => fs.existsSync(d));
      if (framesDir) {
        for (const file of fs.readdirSync(framesDir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f)).sort()) {
          const frameId = path.parse(file).name;
          const timestamp = stateByFrame.get(frameId)?.timestamp;
          if (typeof timestamp !== "number") { framesWithoutTimestamp++; continue; }
          rawFrames.push({ frameId, timestamp, filePath: path.join(framesDir, file) });
        }
      }
    }
    rawFrames.sort((a, b) => a.timestamp - b.timestamp);

    const ocrFacts: OcrFact[] = [];
    for (const s of states) {
      for (const t of s.visible_texts || []) {
        if (typeof t === "string" && t.trim().length > 1) ocrFacts.push({ text: t.trim(), timestamp: s.timestamp, frameId: s.frame_id });
      }
    }

    const mediaPath = job.mediaPath || job.result.asset?.file_path || "";
    const mediaName = path.basename(mediaPath || jobId);
    const trainingBase = {
      type: "VIDEO_RECORDING" as const,
      name: mediaName,
      documentId: job.documentId,
      mediaId: job.documentId || job.result.media_id || jobId,
      contentSha256: job.contentSha256,
      jobId
    };

    // 0.5 Multimodal evidence-grounded path when a provider is configured and available.
    const quotaManager = OpenRouterQuotaManager.getInstance();
    const providerConfigured = Boolean(config.openRouterApiKey && !config.openRouterApiKey.includes("placeholder"));
    let providerFailure: { status: string; message: string; resumable?: boolean } | undefined;

    if (providerConfigured && rawFrames.length > 0 && quotaManager.isAvailable()) {
      const rawObservations: RawVisualObservation[] = (job.result.semantic_actions || []).map((act: any, idx: number) => ({
        id: act.id || `obs_${idx}`,
        timestamp: typeof act.start_timestamp === "number" ? act.start_timestamp : (undefined as any),
        type: act.action_type || "UNKNOWN",
        application: act.application || states[0]?.active_application || "Browser",
        windowTitle: act.window_title || states[0]?.active_window_title,
        targetText: act.parameters?.url || act.target_description || act.parameters?.field_label || act.summary,
        targetDescription: act.target_description || act.summary || act.parameters?.url,
        value: act.parameters?.value || act.parameters?.url,
        isClickTarget: act.action_type === "CLICK",
        isTextMutation: act.action_type === "ENTER_VALUE" || act.action_type === "TYPE",
        confidence: typeof act.confidence === "number" ? act.confidence : 0.5
      }));

      logger.info({ jobId, frameCount: rawFrames.length }, "[CompileFromJob] Running evidence-grounded multimodal compilation");
      const pipeline = new EvidenceToWorkflowPipeline(config);
      const pipelineResult: PipelineExecutionResult = await pipeline.executePipeline({
        jobId,
        mediaPath,
        tenantId: auth.tenantId,
        workerId,
        rawFrames,
        rawObservations,
        ocrFacts,
        activeApplication: states[0]?.active_application || "Browser",
        taskObjective: userObjective,
        taskContextHint: job.result.process_understanding?.task_intent,
        checkpointDir: path.join(job.outputDir || path.resolve("./evidence_output", auth.tenantId, workerId), jobId, "llm_segments")
      });

      if (pipelineResult.success && pipelineResult.workflow) {
        const workflow = pipelineResult.workflow;
        const { version, readiness, bound } = await persistAndBind(auth, workerId, workflow, {
          ...trainingBase,
          analysisPath: "MULTIMODAL_EVIDENCE",
          actionCount: pipelineResult.semanticActions?.length || 0,
          frameCount: rawFrames.length,
          fidelity: pipelineResult.grounding?.coverage.fidelity
        });
        job.result.compiledWorkflow = workflow;
        job.result.compiledWorkflowVersionId = version.id;
        job.result.grounding = pipelineResult.grounding;
        if (!bound) {
          return notExecutableResponse(res, jobId, version.id, readiness, { grounding: pipelineResult.grounding });
        }
        return res.status(201).json({
          workflowVersionId: version.id,
          workflow,
          analysisPath: "MULTIMODAL_EVIDENCE",
          processUnderstanding: pipelineResult.processUnderstanding,
          semanticActions: pipelineResult.semanticActions,
          grounding: pipelineResult.grounding,
          readiness: readiness.issues,
          provenance: pipelineResult.provenance
        });
      }

      if (pipelineResult.status === "NEEDS_CLARIFICATION") {
        // The evidence was interpreted and found insufficient; a weaker path must not override that.
        job.result.grounding = pipelineResult.grounding;
        return res.status(422).json({
          success: false,
          status: "NEEDS_CLARIFICATION",
          error: pipelineResult.message,
          jobId,
          clarifications: (pipelineResult.grounding?.issues || []).filter(i => i.severity === "BLOCKING"),
          warnings: (pipelineResult.grounding?.issues || []).filter(i => i.severity === "WARNING"),
          grounding: pipelineResult.grounding,
          provenance: pipelineResult.provenance
        });
      }

      providerFailure = { status: pipelineResult.status, message: pipelineResult.message, ...(pipelineResult.resumable ? { resumable: true } : {}) };
      logger.warn({ jobId, ...providerFailure }, "[CompileFromJob] Multimodal analysis unavailable; trying local computer-vision evidence");
    } else if (providerConfigured && !quotaManager.isAvailable()) {
      providerFailure = { status: "AI_QUOTA_EXHAUSTED", message: "The AI provider is cooling down after rate limiting or quota exhaustion." };
    }

    // 1. Local computer-vision evidence path. It compiles only from actions the local analyser grounded.
    const demo = bridge.toNormalizedDemonstration(job.result, auth.tenantId);
    const failLocal = (message: string) => {
      const status = providerFailure?.status === "AI_QUOTA_EXHAUSTED" ? 429 : providerFailure ? 503 : 422;
      return res.status(status).json({
        success: false,
        status: providerFailure ? providerFailure.status : "NEEDS_CLARIFICATION",
        error: providerFailure ? `${providerFailure.message} The local analysis could not substitute for it: ${message}` : message,
        jobId,
        providerFailure: providerFailure || null,
        droppedActions: job.result.dropped_actions || [],
        framesWithoutTimestamp
      });
    };
    if (!demo.observations.length) {
      return failLocal("No actionable interactions could be grounded in this recording. The workflow was not compiled.");
    }

    const localProc = job.result.process_understanding || {};
    const localIntent = String(localProc.task_intent || "").trim();
    const genericIntent = !localIntent || /^desktop task$|^video demonstration workflow$|^autonomous multi-step procedure across\b|^process for\b/i.test(localIntent);
    const taskIntent = userObjective || (genericIntent ? "" : localIntent);
    const applications = Array.isArray(localProc.applications_involved) && localProc.applications_involved.length > 0
      ? localProc.applications_involved
      : states.map((s: any) => s.active_application).filter(Boolean);
    const applicationEnvironment = String(applications[0] || "").trim();
    if (!taskIntent || !applicationEnvironment) {
      return failLocal("The recording does not establish a clear task and application. Provide the task objective and retry; no workflow was compiled.");
    }

    const localVariables = Object.entries(localProc.variables || {}).map(([name, value]: [string, any]) => ({
      name,
      type: value.type || "string",
      classification: value.classification || "RUNTIME_VARIABLE",
      semanticRole: value.semantic_role || name,
      ...(value.default_value !== undefined ? { defaultValue: value.default_value } : {})
    }));
    const processType = localProc.loops?.length ? "LOOP" : (localProc.conditionals?.length ? "CONDITIONAL" : "LINEAR");
    const bpiProvider = new PrecomputedSemanticBPIProvider({
      taskIntent,
      applicationEnvironment,
      processStructure: { type: processType, stepIndices: demo.observations.map((o: any) => o.sequence) },
      variables: localVariables as any,
      businessRules: [],
      expectedOutcomes: [],
      exceptions: (localProc.uncertainties || []).map((u: any) => ({
        triggerCondition: u.description,
        fallbackAction: u.clarification_question || "Request human clarification"
      })),
      confidence: typeof localProc.overall_confidence === "number" ? localProc.overall_confidence : 0.5
    });

    const bpi = new BusinessProcessIntelligence(bpiProvider as any);
    const bpiResult = await bpi.processDemonstration(demo);
    if (bpiResult.specification.status === "NEEDS_CLARIFICATION" || bpiResult.specification.unresolvedGaps.some(g => g.blocking)) {
      return failLocal(`Blocking gaps remain: ${bpiResult.specification.unresolvedGaps.filter(g => g.blocking).map(g => (g as any).description || (g as any).gap_id || (g as any).type).join("; ")}`);
    }

    // 3. Persist BPS
    const bps = await store.createBPS(auth, {
      workerId,
      status: bpiResult.specification.status,
      specificationJson: bpiResult.specification,
      generalizationJson: bpiResult.generalization,
      gapsJson: bpiResult.gaps,
    });

    // 4. Compile into WorkflowV2 from these observations only
    const compiler = new WorkflowCompiler(aiProvider);
    const frameCount = (job.result.frames || []).length;
    const actionCount = demo.observations.length;
    const workflow = await compiler.compile(bpiResult.specification, { version: "desktop-evidence-compiler-2.0", evidenceSourced: true });

    Object.assign(workflow.compiler as any, {
      source_type: "VIDEO_RECORDING",
      source_recording_id: jobId,
      source_media_name: mediaName,
      source_media_id: trainingBase.mediaId,
      source_content_sha256: job.contentSha256,
      action_count: actionCount,
      frame_count: frameCount,
      compiled_from: `Video Recording: ${mediaName}`,
      analysis_path: "LOCAL_CV",
      provider_failure: providerFailure || null,
      dropped_actions: job.result.dropped_actions || []
    });

    const { version, readiness, bound } = await persistAndBind(auth, workerId, workflow, {
      ...trainingBase,
      analysisPath: "LOCAL_CV",
      actionCount,
      frameCount
    }, bps.id);

    job.result.compiledWorkflow = workflow;
    job.result.compiledWorkflowVersionId = version.id;
    job.result.bpsId = bps.id;
    job.result.specification = bpiResult.specification;
    try {
      const resultJsonPath = path.join(job.outputDir || path.resolve("./evidence_output", auth.tenantId, workerId), jobId, "analysis_result.json");
      if (fs.existsSync(resultJsonPath)) fs.writeFileSync(resultJsonPath, JSON.stringify(job.result, null, 2), "utf8");
    } catch (persistErr) {
      logger.warn({ err: persistErr, jobId }, "Failed to update analysis_result.json with compiled workflow");
    }

    if (!bound) {
      return notExecutableResponse(res, jobId, version.id, readiness, { analysisPath: "LOCAL_CV", providerFailure: providerFailure || null });
    }

    logger.info({ workerId, jobId, workflowVersionId: version.id, actionCount, frameCount }, "Compiled workflow from local computer-vision evidence");
    res.status(201).json({
      bpsId: bps.id,
      workflowVersionId: version.id,
      workflow,
      analysisPath: "LOCAL_CV",
      providerFailure: providerFailure || null,
      readiness: readiness.issues,
      processUnderstanding: job.result.process_understanding,
      uncertainties: job.result.uncertainties,
      droppedActions: job.result.dropped_actions || [],
      specification: bpiResult.specification,
    });
  } catch (err: any) {
    logger.error({ err, workerId, jobId }, "Failed to compile workflow from job");
    return res.status(500).json({ error: err.message || "Compilation failed" });
  }
  }));

  // 5.5 Run the evidence-to-workflow pipeline directly on an uploaded document
  router.post("/pipeline/compile", asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const workerId = param(req, "id");
    const media = await resolveWorkerMedia(store, auth, workerId, req.body || {});
    if ("error" in media) {
      return res.status(media.status).json({ error: media.error });
    }
    const { taskObjective, activeApplication } = req.body;

    const jobId = `pipe_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const outputDir = path.resolve("./evidence_output", auth.tenantId, workerId, jobId);
    const pipeline = new EvidenceToWorkflowPipeline(config);
    const pipelineResult = await pipeline.executePipeline({
      jobId,
      mediaPath: media.filePath,
      tenantId: auth.tenantId,
      workerId,
      taskObjective,
      activeApplication,
      checkpointDir: path.join(outputDir, "llm_segments")
    });

    if (!pipelineResult.success || !pipelineResult.workflow) {
      const status = pipelineResult.status === "AI_QUOTA_EXHAUSTED" ? 429 : pipelineResult.status === "NEEDS_RETRY" ? 503 : 422;
      return res.status(status).json({
        status: pipelineResult.status,
        error: pipelineResult.status,
        message: pipelineResult.message,
        resumable: Boolean(pipelineResult.resumable),
        clarifications: (pipelineResult.grounding?.issues || []).filter(i => i.severity === "BLOCKING"),
        provenance: pipelineResult.provenance
      });
    }

    // A compilation is reported as successful only after it has been persisted.
    const mediaName = media.doc?.name || path.basename(media.filePath);
    const { version, readiness, bound } = await persistAndBind(auth, workerId, pipelineResult.workflow, {
      type: "VIDEO_RECORDING",
      name: mediaName,
      documentId: media.doc?.id,
      mediaId: media.doc?.id || jobId,
      contentSha256: media.contentSha256,
      jobId,
      analysisPath: "MULTIMODAL_EVIDENCE",
      actionCount: pipelineResult.semanticActions?.length || 0,
      fidelity: pipelineResult.grounding?.coverage.fidelity
    });
    if (!bound) {
      return notExecutableResponse(res, jobId, version.id, readiness, { grounding: pipelineResult.grounding });
    }

    return res.status(201).json({
      success: true,
      status: "COMPLETED",
      jobId,
      workflow: pipelineResult.workflow,
      workflowVersionId: version.id,
      semanticActions: pipelineResult.semanticActions,
      processUnderstanding: pipelineResult.processUnderstanding,
      grounding: pipelineResult.grounding,
      readiness: readiness.issues,
      provenance: pipelineResult.provenance,
    });
  }));

  // 6. Delete Evidence Recording / Document
  router.delete("/:docId", asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const workerId = param(req, "id");
    const docId = param(req, "docId");
    const doc = await store.getDocument(auth, docId).catch(() => undefined);
    // A missing document must not report success or trigger the worker purge below.
    if (!doc || (doc.workerId && doc.workerId !== workerId)) {
      return res.status(404).json({ error: "Evidence document not found" });
    }
    try {
      await store.deleteDocument(auth, docId);
    } catch (_) {}

    // Remove the stored file only when it lives inside this worker's own storage.
    const filePath = (doc?.parsedJson as any)?.filePath;
    if (filePath && isInsideStorage(filePath, auth.tenantId, workerId)) {
      try { fs.rmSync(filePath, { force: true }); } catch (_) {}
    }

    const purgeResult = await purgeOrRecompileWorkerAfterDocDeletion(config, store, auth, workerId, docId, aiProvider);
    res.json({
      success: true,
      message: "Evidence record deleted and derived steps/rules purged from worker memory instantly",
      remainingDocuments: purgeResult.remainingDocsCount
    });
  }));

  return router;
}
