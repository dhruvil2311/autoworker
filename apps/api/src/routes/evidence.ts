import { Router, type Request, type Response } from "express";
import * as path from "path";
import * as fs from "fs";
import { AppStore } from "../store.js";
import { logger } from "@ghost/observability";
import { DesktopEvidenceBridge } from "../services/desktop-evidence-bridge.js";
import { BusinessProcessIntelligence } from "@ghost/bpi";
import { RealSemanticBPIProvider } from "../ai-provider.js";
import { WorkflowCompiler } from "../compiler.js";
import type { ApiConfig } from "../config.js";
import { purgeOrRecompileWorkerAfterDocDeletion } from "../services/doc-purge.js";
import { EvidenceToWorkflowPipeline } from "../services/evidence/evidence-pipeline.js";
import type { RawVisualObservation } from "../services/evidence/task-relevance-engine.js";

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

export function createEvidenceRouter(config: ApiConfig, store: AppStore): Router {
  const router = Router({ mergeParams: true });
  const bridge = DesktopEvidenceBridge.getInstance();
  const aiProvider = new RealSemanticBPIProvider(config);

  // 1. Upload Video or Screenshot Evidence
  router.post("/upload", asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const workerId = param(req, "id");
    const { name, content, type } = req.body;

    if (!name || !content) {
      return res.status(400).json({ error: "Missing name or content" });
    }

    // Check if worker already has a document with this exact filename
    const existingDocs = await store.listDocuments(auth, workerId);
    const duplicate = existingDocs.find(d => d.name === name);
    if (duplicate && (duplicate.parsedJson as any)?.filePath && fs.existsSync((duplicate.parsedJson as any).filePath)) {
      logger.info({ workerId, name, docId: duplicate.id }, "Reusing existing evidence document");
      return res.status(200).json({
        document: duplicate,
        asset: { id: duplicate.id, name: duplicate.name },
        filePath: (duplicate.parsedJson as any).filePath,
        mediaId: duplicate.id,
      });
    }

    const uploadsDir = path.resolve("./evidence_storage", auth.tenantId, workerId);
    fs.mkdirSync(uploadsDir, { recursive: true });

    const safeName = `${Date.now()}_${path.basename(name)}`;
    const targetFilePath = path.join(uploadsDir, safeName);

    // Save content (base64 or text)
    if (content.startsWith("data:")) {
      const base64Data = content.split(";base64,").pop();
      fs.writeFileSync(targetFilePath, Buffer.from(base64Data, "base64"));
    } else {
      fs.writeFileSync(targetFilePath, content, "utf-8");
    }

    // Save reference in worker_documents store
    const doc = await store.createDocument(auth, {
      workerId,
      type: type || (name.match(/\.(mp4|webm|mov|mkv)$/i) ? "VIDEO" : "IMAGE"),
      name,
      parsedJson: {
        filePath: targetFilePath,
        fileName: safeName,
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
    const targetId = param(req, "id");
    let resolvedId = targetId;
    try {
      let worker = await store.getGhostWorker(auth, targetId);
      if (!worker) {
        const all = await store.listGhostWorkers(auth);
        worker = all.find(w => w.id === targetId || (w as any).allIds?.includes(targetId)) ||
                 all.find(w => w.name && w.name.trim().toLowerCase() === targetId.trim().toLowerCase());
      }
      if (worker) resolvedId = worker.id;
    } catch (_) {}

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
      return res.json({
        evidence: { documents: [], runs: [] },
        documents: [],
        allDocuments: []
      });
    }
  }));

  // 2. Trigger Asynchronous Desktop Evidence Analysis
  router.post("/analyze", asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const workerId = param(req, "id");
    const { filePath, documentId, assetId, videoPath } = req.body;

    let targetPath = filePath || videoPath;
    const docId = documentId || assetId;
    if (!targetPath && docId) {
      const doc = await store.getDocument(auth, docId);
      targetPath = (doc?.parsedJson as any)?.filePath;
    }

    if (!targetPath || !fs.existsSync(targetPath)) {
      return res.status(400).json({ error: `Evidence file not found: ${targetPath || 'no path specified'}` });
    }

    // Check if an existing completed job already exists for this media file
    const existingJobId = bridge.findJobIdForMedia(targetPath);
    if (existingJobId) {
      const existingJob = bridge.getJob(existingJobId);
      if (existingJob && (existingJob.status === "COMPLETED" || existingJob.status === "RUNNING")) {
        logger.info({ jobId: existingJobId, targetPath }, "Reusing already analyzed evidence job");
        return res.status(200).json({
          jobId: existingJob.jobId,
          job: {
            id: existingJob.jobId,
            status: existingJob.status,
            currentStage: existingJob.currentStage,
            progressPercent: existingJob.progressPercent,
            result: existingJob.result,
          },
          status: existingJob.status,
          currentStage: existingJob.currentStage,
          progressPercent: existingJob.progressPercent,
        });
      }
    }

    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const outputDir = path.resolve("./evidence_output", auth.tenantId, workerId);

    const job = await bridge.analyzeMedia({
      jobId,
      mediaPath: targetPath,
      outputDir,
      tenantId: auth.tenantId,
      workerId,
    });

    res.status(202).json({
      jobId: job.jobId,
      job: { id: job.jobId, status: job.status, currentStage: job.currentStage, progressPercent: job.progressPercent },
      status: job.status,
      currentStage: job.currentStage,
      progressPercent: job.progressPercent,
    });
  }));

  // 3. Poll Analysis Job Status
  router.get("/jobs/:jobId", asyncHandler(async (req, res) => {
    const jobId = param(req, "jobId");
    const job = bridge.getJob(jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    res.json({ job, ...job });
  }));

  // 4. Retrieve Reconstructed Timeline
  router.get("/jobs/:jobId/timeline", asyncHandler(async (req, res) => {
    const jobId = param(req, "jobId");
    const job = bridge.getJob(jobId);
    if (!job || !job.result) {
      return res.status(404).json({ error: "Job timeline not ready or job not found" });
    }
    res.json({
      timeline: job.result.timeline,
      processUnderstanding: job.result.process_understanding,
      semanticActions: job.result.semantic_actions,
      frames: job.result.frames,
      uncertainties: (job.result.uncertainties || []).map((u: any, i: number) => formatHumanReadableUncertainty(u, i)),
      compiledWorkflow: job.result.compiledWorkflow || null,
      compiledWorkflowVersionId: job.result.compiledWorkflowVersionId || null,
      specification: job.result.specification || null,
      bpsId: job.result.bpsId || null,
    });
  }));

  // 5. Compile Analyzed Demonstration directly into BPS and Workflow V2
  router.post("/compile-from-job/:jobId", asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const workerId = param(req, "id");
    const jobId = param(req, "jobId");

    const job = bridge.getJob(jobId);
    if (!job || !job.result) {
      return res.status(400).json({ error: "Analysis job has not completed yet" });
    }

    try {
      // 0. Locate extracted keyframes from job output directories
    const outputDirsToSearch = [
      (job as any).outputDir,
      path.resolve("./evidence_output", auth.tenantId, workerId, jobId),
      path.resolve("./evidence_output", auth.tenantId, (job.result.media_id || job.result.asset?.id || jobId)),
      path.resolve(process.cwd(), "apps/api/evidence_output", auth.tenantId, (job.result.media_id || jobId)),
      path.resolve(process.cwd(), "evidence_output", auth.tenantId, (job.result.media_id || jobId)),
    ].filter(Boolean);

    let framesDir: string | undefined;
    for (const dir of outputDirsToSearch) {
      const candidate = path.join(dir, "frames");
      if (fs.existsSync(candidate)) {
        framesDir = candidate;
        break;
      }
    }

    const rawFrames: Array<{ frameId: string; timestamp: number; filePath: string }> = [];
    const states = job.result.timeline?.states || [];
    if (framesDir && fs.existsSync(framesDir)) {
      const frameFiles = fs.readdirSync(framesDir).filter(f => f.match(/\.(jpg|jpeg|png|webp)$/i)).sort();
      for (let i = 0; i < frameFiles.length; i++) {
        const file = frameFiles[i]!;
        const baseName = path.parse(file).name;
        const matchedState = states.find((s: any) => s.frame_id === baseName);
        const timestamp = matchedState?.timestamp ?? (i * 1.0);
        rawFrames.push({
          frameId: baseName,
          timestamp,
          filePath: path.join(framesDir, file)
        });
      }
    }

    // 0.5 If OpenRouter is configured and frames exist, compile using multimodal OpenRouter pipeline
    if (config.openRouterApiKey && !config.openRouterApiKey.includes("placeholder") && rawFrames.length > 0) {
      try {
        const ocrFacts: Array<{ text: string; timestamp?: number }> = [];
        for (const s of states) {
          const texts: string[] = s.visible_texts || [];
          for (const t of texts) {
            if (t && t.trim().length > 1) {
              ocrFacts.push({ text: t.trim(), timestamp: s.timestamp });
            }
          }
        }

        const rawObservations: RawVisualObservation[] = (job.result.semantic_actions || []).map((act: any, idx: number) => ({
          id: act.id || `obs_${idx}`,
          timestamp: act.start_timestamp ?? (idx * 1.5),
          type: act.action_type || "CLICK",
          application: act.application || states[0]?.active_application || "Browser",
          windowTitle: act.window_title || states[0]?.active_window_title,
          targetText: act.summary || act.target_description || act.parameters?.field_label,
          targetDescription: act.target_description || act.summary,
          value: act.parameters?.value,
          isClickTarget: act.action_type === "CLICK",
          isTextMutation: act.action_type === "ENTER_VALUE" || act.action_type === "TYPE",
          confidence: act.confidence ?? 0.9
        }));

        const targetMediaFile = job.result.asset?.file_path || job.mediaPath || "desktop_demonstration.webm";
        const taskObjective = job.result.process_understanding?.task_intent || `Workflow demonstration from ${path.basename(targetMediaFile)}`;
        const activeApp = states[0]?.active_application || "Browser";

        logger.info({ jobId, frameCount: rawFrames.length }, "[CompileFromJob] Running OpenRouter multimodal evidence compilation on extracted keyframes");
        const pipeline = new EvidenceToWorkflowPipeline(config);

        const pipelineResult = await pipeline.executePipeline({
          jobId,
          mediaPath: targetMediaFile,
          tenantId: auth.tenantId,
          workerId,
          rawFrames,
          rawObservations,
          ocrFacts,
          activeApplication: activeApp,
          taskObjective,
        });

        if (pipelineResult.success && pipelineResult.workflow) {
          const workflow = pipelineResult.workflow;
          const workflowVersion = await store.createWorkflowVersion(auth, workflow as any);
          const currentWorker = await store.getGhostWorker(auth, workerId);
          const mediaName = path.basename(targetMediaFile);
          const trainingSource = {
            type: "VIDEO_RECORDING" as const,
            name: mediaName,
            mediaId: job.result.mediaId || jobId,
            jobId,
            actionCount: pipelineResult.semanticActions?.length || 0,
            frameCount: rawFrames.length,
            compiledAt: new Date().toISOString()
          };

          if ((store as any).purgeWorkerRuns) {
            await (store as any).purgeWorkerRuns(auth, [workerId]);
          }

          await store.updateGhostWorker(auth, workerId, {
            workflowId: workflowVersion.workflowId,
            activeVersionId: workflowVersion.id,
            status: "READY_FOR_REVIEW",
            trainingSource,
            triggerConfig: {
              ...(currentWorker?.triggerConfig || {}),
              trainingSource
            }
          } as any);

          job.result.compiledWorkflow = workflow;
          job.result.compiledWorkflowVersionId = workflowVersion.id;

          return res.status(201).json({
            bpsId: (workflow.compiler as any)?.bps_id || null,
            workflowVersionId: workflowVersion.id,
            workflow,
            processUnderstanding: pipelineResult.processUnderstanding,
            semanticActions: pipelineResult.semanticActions,
            provenance: pipelineResult.provenance
          });
        } else if (pipelineResult.status === "AI_QUOTA_EXHAUSTED" || pipelineResult.error?.includes("RATE_LIMIT") || pipelineResult.error?.includes("429")) {
          return res.status(429).json({
            success: false,
            status: "AI_QUOTA_EXHAUSTED",
            error: "RATE_LIMITED_EXHAUSTED",
            message: pipelineResult.message,
            reason: pipelineResult.error || pipelineResult.message
          });
        }
      } catch (pipeErr: any) {
        logger.warn({ err: pipeErr.message, jobId }, "[CompileFromJob] OpenRouter pipeline error");
        if (pipeErr.message?.includes("429") || pipeErr.message?.toLowerCase().includes("rate limit") || pipeErr.message?.toLowerCase().includes("quota")) {
          return res.status(429).json({
            success: false,
            status: "AI_QUOTA_EXHAUSTED",
            error: "RATE_LIMITED_EXHAUSTED",
            message: `OpenRouter rate limit exhausted: ${pipeErr.message}`,
            reason: pipeErr.message
          });
        }
      }
    }

    // 1. Convert to NormalizedDemonstration
    const demo = bridge.toNormalizedDemonstration(job.result, auth.tenantId);

    // 2. Process via BPI
    const hasAnyLLM = Boolean(config.geminiApiKey || config.groqApiKey || config.openRouterApiKey || config.fallbackLlmApiKey);
    const bpi = hasAnyLLM
      ? new BusinessProcessIntelligence(aiProvider as any)
      : new BusinessProcessIntelligence();

    const bpiResult = await bpi.processDemonstration(demo);

    // 3. Persist BPS
    const bps = await store.createBPS(auth, {
      workerId,
      status: bpiResult.specification.status,
      specificationJson: bpiResult.specification,
      generalizationJson: bpiResult.generalization,
      gapsJson: bpiResult.gaps,
    });

    // 4. Compile into WorkflowV2
    const compiler = new WorkflowCompiler(aiProvider);
    const mediaName = job.result.mediaPath
      ? path.basename(job.result.mediaPath)
      : (job.result.mediaId || "Desktop Screen Recording");
    const frameCount = (job.result as any).frames_analyzed || (job.result as any).framesCount || 0;
    const actionCount = demo.observations.length;

    const workflow = await compiler.compile(bpiResult.specification, {
      version: "desktop-evidence-compiler-1.0",
    });

    // Attach clear provenance directly to the workflow definition
    (workflow.compiler as any).source_type = "VIDEO_RECORDING";
    (workflow.compiler as any).source_recording_id = jobId;
    (workflow.compiler as any).source_media_name = mediaName;
    (workflow.compiler as any).source_media_id = job.result.mediaId || jobId;
    (workflow.compiler as any).action_count = actionCount;
    (workflow.compiler as any).frame_count = frameCount;
    (workflow.compiler as any).compiled_from = `Video Recording: ${mediaName}`;

    // 5. Create Workflow Version
    const workflowVersion = await store.createWorkflowVersion(auth, workflow as any);

    // 6. Update Ghost Worker with explicit training provenance
    const currentWorker = await store.getGhostWorker(auth, workerId);
    const trainingSource = {
      type: "VIDEO_RECORDING" as const,
      name: mediaName,
      mediaId: job.result.mediaId,
      jobId,
      actionCount,
      frameCount,
      compiledAt: new Date().toISOString()
    };

    if ((store as any).purgeWorkerRuns) {
      await (store as any).purgeWorkerRuns(auth, [workerId]);
    }

    await store.updateGhostWorker(auth, workerId, {
      workflowId: workflowVersion.workflowId,
      activeVersionId: workflowVersion.id,
      bpsId: bps.id,
      status: "READY_FOR_REVIEW",
      trainingSource,
      triggerConfig: {
        ...(currentWorker?.triggerConfig || {}),
        trainingSource
      }
    } as any);

    // 6.5 Ensure this video demonstration is registered in worker_documents as verified forensic evidence
    try {
      const existingDocs = await store.listDocuments(auth, workerId);
      const docParsedJson = {
        filePath: job.result.mediaPath,
        mediaId: job.result.mediaId,
        jobId,
        actionCount,
        frameCount,
        steps: demo.observations.map((o: any) => o.description || o.action_type || o.summary),
        rules: bpiResult.specification.businessRules || [],
        summary: `Learned from Video Recording: ${mediaName} (${actionCount} actions)`,
        compiledAt: new Date().toISOString()
      };

      const matchingDoc = existingDocs.find(d => 
        (d.parsedJson as any)?.jobId === jobId || 
        (d.parsedJson as any)?.mediaId === job.result.mediaId ||
        d.name === mediaName
      );

      if (matchingDoc) {
        try {
          await store.deleteDocument(auth, matchingDoc.id);
        } catch {}
      }

      await store.createDocument(auth, {
        workerId,
        type: "VIDEO",
        name: mediaName,
        parsedJson: docParsedJson
      });
      logger.info({ workerId, mediaName, actionCount }, "Registered compiled video demonstration into worker_documents");
    } catch (docErr) {
      logger.warn({ err: docErr, workerId }, "Failed to register video demonstration into worker_documents");
    }

    // 6. Cache compilation result onto job and persist to disk so it is stored and reused
    job.result.compiledWorkflow = workflow;
    job.result.compiledWorkflowVersionId = workflowVersion.id;
    job.result.bpsId = bps.id;
    job.result.specification = bpiResult.specification;

    try {
      const outDir = (job as any).outputDir || path.resolve("./evidence_output", auth.tenantId, workerId);
      const resultJsonPath = path.join(outDir, "analysis_result.json");
      if (fs.existsSync(resultJsonPath)) {
        fs.writeFileSync(resultJsonPath, JSON.stringify(job.result, null, 2), "utf8");
      }
    } catch (persistErr) {
      logger.warn({ err: persistErr, jobId }, "Failed to update analysis_result.json with compiled workflow");
    }

    logger.info({
      workerId,
      jobId,
      workflowVersionId: workflowVersion.id,
      sourceMedia: mediaName,
      sourceType: "VIDEO_RECORDING",
      frameCount,
      actionCount
    }, `Compiled workflow from uploaded video recording: "${mediaName}" (${actionCount} actions, ${frameCount} frames)`);

    res.status(201).json({
      bpsId: bps.id,
      workflowVersionId: workflowVersion.id,
      workflow,
      processUnderstanding: job.result.process_understanding,
      uncertainties: job.result.uncertainties,
      specification: bpiResult.specification,
    });
  } catch (err: any) {
    logger.error({ err, workerId, jobId }, "Failed to compile workflow from job");
    return res.status(500).json({ error: err.message || "Compilation failed" });
  }
  }));

  // 5.5 Run OpenRouter Evidence-to-Workflow Pipeline Directly
  router.post("/pipeline/compile", asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const workerId = param(req, "id");
    const { filePath, videoPath, documentId, assetId, taskObjective, activeApplication } = req.body;

    let targetPath = filePath || videoPath;
    const docId = documentId || assetId;
    if (!targetPath && docId) {
      const doc = await store.getDocument(auth, docId);
      targetPath = (doc?.parsedJson as any)?.filePath;
    }

    if (!targetPath || !fs.existsSync(targetPath)) {
      return res.status(400).json({ error: `Evidence file not found: ${targetPath || 'no path specified'}` });
    }

    const jobId = `pipe_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const pipeline = new EvidenceToWorkflowPipeline(config);

    const pipelineResult = await pipeline.executePipeline({
      jobId,
      mediaPath: targetPath,
      tenantId: auth.tenantId,
      workerId,
      taskObjective,
      activeApplication,
    });

    if (!pipelineResult.success || !pipelineResult.workflow) {
      if (pipelineResult.status === "AI_QUOTA_EXHAUSTED") {
        return res.status(429).json({
          status: "AI_QUOTA_EXHAUSTED",
          error: "AI_QUOTA_EXHAUSTED",
          message: pipelineResult.message,
        });
      }
      return res.status(422).json({
        status: "ANALYSIS_FAILED",
        error: "ANALYSIS_FAILED",
        message: pipelineResult.message,
      });
    }

    let workflowVersion = null;
    try {
      const mediaName = path.basename(targetPath);
      workflowVersion = await store.createWorkflowVersion(auth, pipelineResult.workflow as any);

      await store.createDocument(auth, {
        workerId,
        type: targetPath.endsWith(".mp4") ? "VIDEO" : "IMAGE",
        name: mediaName,
        parsedJson: {
          filePath: targetPath,
          jobId,
          actionCount: pipelineResult.semanticActions?.length || 0,
          summary: `Compiled via OpenRouter Evidence Pipeline: ${mediaName}`,
          compiledAt: new Date().toISOString(),
        }
      });
    } catch (saveErr: any) {
      logger.warn({ err: saveErr.message }, "Could not persist compiled pipeline workflow to store");
    }

    return res.status(201).json({
      success: true,
      status: "COMPLETED",
      jobId,
      workflow: pipelineResult.workflow,
      workflowVersionId: workflowVersion?.id || null,
      semanticActions: pipelineResult.semanticActions,
      processUnderstanding: pipelineResult.processUnderstanding,
      provenance: pipelineResult.provenance,
    });
  }));

  // 6. Delete Evidence Recording / Document
  router.delete("/:docId", asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const workerId = param(req, "id");
    const docId = param(req, "docId");
    try {
      await store.deleteDocument(auth, docId);
    } catch (_) {}

    // Clean physical files if docId corresponds to a file or media
    try {
      const storageDir = path.resolve("./evidence_storage", auth.tenantId, workerId);
      if (fs.existsSync(storageDir)) {
        for (const f of fs.readdirSync(storageDir)) {
          if (f.includes(docId)) {
            try { fs.rmSync(path.join(storageDir, f), { force: true }); } catch (_) {}
          }
        }
      }
    } catch (_) {}

    const purgeResult = await purgeOrRecompileWorkerAfterDocDeletion(config, store, auth, workerId, docId, aiProvider);
    res.json({
      success: true,
      message: "Evidence record deleted and derived steps/rules purged from worker memory instantly",
      remainingDocuments: purgeResult.remainingDocsCount
    });
  }));

  return router;
}
