import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { logger } from "@ghost/observability";
import type { NormalizedDemonstration, Observation } from "@ghost/bpi";
import { specificSelectorOnly } from "@ghost/workflow-schema";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DesktopAnalysisJob {
  jobId: string;
  tenantId?: string | undefined;
  workerId?: string | undefined;
  /** Upload document this job analyses, and the SHA-256 of its exact bytes. */
  documentId?: string | undefined;
  contentSha256?: string | undefined;
  outputDir?: string | undefined;
  status: "QUEUED" | "RUNNING" | "EXTRACTING" | "OCR" | "UNDERSTANDING" | "BUILDING_TIMELINE" | "BUILDING_WORKFLOW" | "NEEDS_CLARIFICATION" | "COMPLETED" | "FAILED";
  progressPercent: number;
  currentStage: string;
  mediaPath: string;
  mediaType: "VIDEO" | "SCREENSHOT" | "DESKTOP_RECORDING";
  result?: any;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

/** Upper bound on one local analysis; a hung analyser fails the job instead of leaving it RUNNING. */
const ANALYSIS_TIMEOUT_MS = Number(process.env.EVIDENCE_ANALYSIS_TIMEOUT_MS || 15 * 60 * 1000);

/** Text that belongs to the recording tool itself, matched as whole phrases only. */
const RECORDER_CHROME = [
  /\bstop sharing\b/i, /\bstop recording\b/i, /\bis sharing your screen\b/i,
  /localhost:5173/i, /localhost:4000/i, /\bteaching workspace\b/i
];

export class DesktopEvidenceBridge {
  private static instance: DesktopEvidenceBridge;
  private jobs: Map<string, DesktopAnalysisJob> = new Map();

  /** Persists job status beside its artefacts so a restart reports the truth instead of "not found". */
  private persistJobState(job: DesktopAnalysisJob): void {
    if (!job.outputDir) return;
    try {
      const dir = path.join(job.outputDir, job.jobId);
      fs.mkdirSync(dir, { recursive: true });
      const { result, ...rest } = job;
      fs.writeFileSync(path.join(dir, "job.json"), JSON.stringify({ ...rest, updatedAt: new Date().toISOString() }, null, 2), "utf8");
    } catch (err: any) {
      logger.warn({ jobId: job.jobId, err: err.message }, "Could not persist evidence job state");
    }
  }

  private constructor() {}

  public static getInstance(): DesktopEvidenceBridge {
    if (!DesktopEvidenceBridge.instance) {
      DesktopEvidenceBridge.instance = new DesktopEvidenceBridge();
    }
    return DesktopEvidenceBridge.instance;
  }

  public static async analyzeMedia(options: {
    jobId: string;
    mediaPath: string;
    outputDir: string;
    tenantId: string;
    workerId?: string;
  }): Promise<DesktopAnalysisJob> {
    return DesktopEvidenceBridge.getInstance().analyzeMedia(options);
  }

  public static async analyzeMediaSync(options: {
    jobId: string;
    mediaPath: string;
    outputDir: string;
    tenantId: string;
    workerId?: string;
  }): Promise<any> {
    return DesktopEvidenceBridge.getInstance().analyzeMediaSync(options);
  }

  public static translateToDemonstration(
    analysisResult: any,
    tenantId: string = "default"
  ): NormalizedDemonstration {
    return DesktopEvidenceBridge.getInstance().toNormalizedDemonstration(analysisResult, tenantId);
  }

  public async analyzeMediaSync(options: {
    jobId: string;
    mediaPath: string;
    outputDir: string;
    tenantId: string;
    workerId?: string;
  }): Promise<any> {
    await this.analyzeMedia(options);
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const interval = setInterval(() => {
        const currentJob = this.getJob(options.jobId, options.tenantId);
        if (currentJob?.status === "COMPLETED") {
          clearInterval(interval);
          resolve(currentJob.result);
        } else if (currentJob?.status === "FAILED") {
          clearInterval(interval);
          reject(new Error(currentJob.error || "Analysis failed"));
        } else if (Date.now() - start > 120000) {
          clearInterval(interval);
          reject(new Error("Analysis timeout after 120s"));
        }
      }, 500);
    });
  }

  public getJob(jobId: string, tenantId: string): DesktopAnalysisJob | undefined {
    let job = this.jobs.get(jobId);
    if (job && (job.tenantId || job.result?.tenant_id) !== tenantId) return undefined;
    if (!job) {
      // Check disk if server restarted
      const evidenceOutputDirs = [
        path.resolve(process.cwd(), "evidence_output", tenantId),
        path.resolve(process.cwd(), "apps/api/evidence_output", tenantId),
        path.resolve(__dirname, "../../evidence_output", tenantId),
        path.resolve(__dirname, "../../../evidence_output", tenantId),
      ];

      for (const baseDir of evidenceOutputDirs) {
        if (!fs.existsSync(baseDir)) continue;
        try {
          const findJobDir = (dir: string): string | null => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              const fullPath = path.join(dir, entry.name);
              if (entry.isDirectory()) {
                if (entry.name === jobId && (fs.existsSync(path.join(fullPath, "analysis_result.json")) || fs.existsSync(path.join(fullPath, "job.json")))) {
                  return fullPath;
                }
                const sub = findJobDir(fullPath);
                if (sub) return sub;
              }
            }
            return null;
          };

          const jobDir = findJobDir(baseDir);
          const stateFile = jobDir ? path.join(jobDir, "job.json") : null;
          const persisted = stateFile && fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf-8")) : null;
          if (persisted && persisted.tenantId !== tenantId) return undefined;
          const foundFile = jobDir && fs.existsSync(path.join(jobDir, "analysis_result.json")) ? path.join(jobDir, "analysis_result.json") : null;
          if (!foundFile && persisted) {
            // The process that ran this job is gone; an unfinished job cannot still be running.
            const unfinished = !["COMPLETED", "FAILED"].includes(persisted.status);
            job = {
              ...persisted,
              status: unfinished ? "FAILED" : persisted.status,
              error: unfinished ? "Analysis was interrupted by a service restart. Start the analysis again." : persisted.error
            } as DesktopAnalysisJob;
            this.jobs.set(jobId, job!);
            return job;
          }
          if (foundFile) {
            const data = JSON.parse(fs.readFileSync(foundFile, "utf-8"));
            if (data.tenant_id !== tenantId) return undefined;
            job = {
              jobId,
              tenantId,
              workerId: data.worker_id || data.asset?.worker_id || persisted?.workerId,
              documentId: persisted?.documentId,
              contentSha256: persisted?.contentSha256,
              outputDir: persisted?.outputDir,
              status: "COMPLETED",
              progressPercent: 100,
              currentStage: "COMPLETE",
              mediaPath: data.asset?.file_path || "",
              mediaType: data.asset?.evidence_type || "VIDEO",
              result: data,
              createdAt: data.asset?.created_at || new Date().toISOString(),
              completedAt: new Date().toISOString(),
            };
            this.jobs.set(jobId, job);
            return job;
          }
        } catch {}
      }
    }
    return job;
  }

  /**
   * Finds a completed analysis of exactly these bytes for this tenant and worker. Identity is the
   * content hash, never the file name, so a different video with the same name is analysed afresh.
   */
  public findCompletedJobForContent(contentSha256: string, tenantId: string, workerId: string): DesktopAnalysisJob | undefined {
    for (const job of this.jobs.values()) {
      if (job.status === "COMPLETED" && job.contentSha256 === contentSha256 && job.tenantId === tenantId && job.workerId === workerId) {
        return job;
      }
    }
    const baseDirs = [
      path.resolve(process.cwd(), "evidence_output", tenantId, workerId),
      path.resolve(process.cwd(), "apps/api/evidence_output", tenantId, workerId)
    ];
    for (const baseDir of baseDirs) {
      if (!fs.existsSync(baseDir)) continue;
      for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const stateFile = path.join(baseDir, entry.name, "job.json");
        if (!fs.existsSync(stateFile)) continue;
        try {
          const persisted = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
          if (persisted.contentSha256 === contentSha256 && persisted.tenantId === tenantId && persisted.workerId === workerId && persisted.status === "COMPLETED") {
            const job = this.getJob(persisted.jobId, tenantId);
            if (job?.status === "COMPLETED") return job;
          }
        } catch { /* Ignore unreadable state files. */ }
      }
    }
    return undefined;
  }

  public listJobs(): DesktopAnalysisJob[] {
    return Array.from(this.jobs.values());
  }

  private resolvePackageDir(): string {
    const candidates = [
      path.resolve(process.cwd(), "packages/desktop-evidence-engine"),
      path.resolve(process.cwd(), "../../packages/desktop-evidence-engine"),
      path.resolve(process.cwd(), "../packages/desktop-evidence-engine"),
      path.resolve(__dirname, "../../packages/desktop-evidence-engine"),
      path.resolve(__dirname, "../../../packages/desktop-evidence-engine"),
      path.resolve(__dirname, "../../../../packages/desktop-evidence-engine"),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        return c;
      }
    }
    return path.resolve(process.cwd(), "packages/desktop-evidence-engine");
  }

  private resolvePythonCommand(): string {
    if (process.env.PYTHON_PATH && fs.existsSync(process.env.PYTHON_PATH)) {
      return process.env.PYTHON_PATH;
    }

    if (process.platform === "win32") {
      const localAppData = process.env.LOCALAPPDATA || (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "AppData", "Local") : "");
      const candidates = [
        path.join(localAppData, "Programs", "Python", "Python314", "python.exe"),
        path.join(localAppData, "Programs", "Python", "Python313", "python.exe"),
        path.join(localAppData, "Programs", "Python", "Python312", "python.exe"),
        path.join(localAppData, "Programs", "Python", "Python311", "python.exe"),
        path.join(localAppData, "Programs", "Python", "Python310", "python.exe"),
        "C:\\Windows\\py.exe",
        "py.exe",
        "python.exe",
        "python",
      ];
      for (const cand of candidates) {
        if (cand.includes("\\") || cand.includes("/")) {
          if (fs.existsSync(cand)) {
            return cand;
          }
        }
      }
      return "python.exe";
    }

    return "python3";
  }

  private generateFallbackAnalysis(
    job: DesktopAnalysisJob,
    mediaPath: string,
    outputDir: string,
    tenantId: string,
    workerId?: string,
    reason?: string
  ): any {
    logger.warn({ jobId: job.jobId, reason }, "Desktop evidence analysis failed - marking job FAILED without generating fake actions");
    job.status = "FAILED";
    job.currentStage = "FAILED";
    job.progressPercent = 0;
    job.error = reason || "Desktop evidence analysis failed. No fake workflow generated.";
    job.completedAt = new Date().toISOString();
    this.persistJobState(job);
    return null;
  }

  /**
   * Spawns the Python desktop evidence intelligence pipeline asynchronously.
   */
  public async analyzeMedia(options: {
    jobId: string;
    mediaPath: string;
    outputDir: string;
    tenantId: string;
    workerId?: string;
    documentId?: string;
    contentSha256?: string;
  }): Promise<DesktopAnalysisJob> {
    const { jobId, mediaPath, outputDir, tenantId, workerId } = options;

    const ext = path.extname(mediaPath).toLowerCase();
    const mediaType = [".png", ".jpg", ".jpeg", ".webp"].includes(ext)
      ? "SCREENSHOT"
      : [".json"].includes(ext)
      ? "DESKTOP_RECORDING"
      : "VIDEO";

    const job: DesktopAnalysisJob = {
      jobId,
      tenantId,
      workerId,
      status: "QUEUED",
      progressPercent: 5,
      currentStage: "Media Ingestion Initialized",
      mediaPath,
      mediaType,
      documentId: options.documentId,
      contentSha256: options.contentSha256,
      outputDir,
      createdAt: new Date().toISOString(),
    };
    this.jobs.set(jobId, job);
    this.persistJobState(job);

    // Asynchronously run analysis
    setImmediate(async () => {
      try {
        job.status = "RUNNING";
        job.currentStage = "EXTRACTING";
        job.progressPercent = 20;
        this.persistJobState(job);

        const pythonPackageDir = this.resolvePackageDir();
        const pythonCmd = this.resolvePythonCommand();
        const args = [
          "-m", "ghost_evidence.cli", "analyze",
          "--media", mediaPath,
          "--output-dir", outputDir,
          "--tenant-id", tenantId,
          "--job-id", jobId,
        ];
        if (workerId) {
          args.push("--worker-id", workerId);
        }

        logger.info({ jobId, pythonCmd, pythonPackageDir, mediaPath }, "Spawning Python desktop evidence engine");

        let processFinished = false;
        let pythonProcess: any;
        let timeoutHandle: NodeJS.Timeout | undefined;

        try {
          const isAbsolute = path.isAbsolute(pythonCmd);
          pythonProcess = spawn(pythonCmd, args, {
            cwd: pythonPackageDir,
            shell: !isAbsolute && process.platform === "win32",
            env: {
              ...process.env,
              PYTHONPATH: pythonPackageDir,
            },
          });
        } catch (spawnErr: any) {
          logger.error({ jobId, err: spawnErr.message }, "Synchronous spawn error for python engine");
          this.generateFallbackAnalysis(job, mediaPath, outputDir, tenantId, workerId, spawnErr.message);
          return;
        }

        timeoutHandle = setTimeout(() => {
          if (processFinished) return;
          processFinished = true;
          try { pythonProcess.kill(); } catch { /* already exited */ }
          this.generateFallbackAnalysis(job, mediaPath, outputDir, tenantId, workerId, `Analysis exceeded ${Math.round(ANALYSIS_TIMEOUT_MS / 60000)} minutes and was stopped.`);
        }, ANALYSIS_TIMEOUT_MS);
        // The watchdog must not keep the process alive on its own.
        timeoutHandle.unref?.();

        // CRITICAL: Handle error event immediately to prevent unhandled 'error' event crash
        pythonProcess.on("error", (err: any) => {
          if (processFinished) return;
          processFinished = true;
          logger.error({ jobId, err: err.message, pythonCmd }, "Python process error event - engaging fallback analysis");
          this.generateFallbackAnalysis(job, mediaPath, outputDir, tenantId, workerId, err.message);
        });

        let stdoutData = "";
        let stderrData = "";

        if (pythonProcess.stdout) {
          pythonProcess.stdout.on("data", (chunk: any) => {
            stdoutData += chunk.toString();
          });
        }

        if (pythonProcess.stderr) {
          pythonProcess.stderr.on("data", (chunk: any) => {
            const text = chunk.toString();
            stderrData += text;

            if (text.includes("[PROGRESS:SAMPLING]")) {
              job.currentStage = "Sampling video frames";
              job.progressPercent = 25;
              logger.info({ jobId, stage: "SAMPLING" }, "Desktop evidence: Sampling video frames");
            } else if (text.includes("[PROGRESS:FRAMES]")) {
              job.currentStage = "Analyzing UI elements and OCR";
              job.progressPercent = 40;
              logger.info({ jobId, stage: "FRAMES" }, "Desktop evidence: Keyframes extracted, running OCR & UI detection");
            } else if (text.includes("[PROGRESS:ANALYZING]")) {
              job.currentStage = "Analyzing UI elements and text";
              job.progressPercent = Math.min(75, (job.progressPercent || 40) + 10);
              logger.info({ jobId, stage: "ANALYZING" }, "Desktop evidence: Processing frames");
            } else if (text.includes("[PROGRESS:ACTIONS]")) {
              job.currentStage = "Reconstructing desktop user interactions";
              job.progressPercent = 80;
              logger.info({ jobId, stage: "ACTIONS" }, "Desktop evidence: Reconstructing user interactions");
            } else if (text.includes("[PROGRESS:UNDERSTANDING]")) {
              job.currentStage = "Synthesizing business process understanding";
              job.progressPercent = 90;
              logger.info({ jobId, stage: "UNDERSTANDING" }, "Desktop evidence: Synthesizing process understanding");
            }
          });
        }

        pythonProcess.on("close", (code: number) => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          if (processFinished) return;
          processFinished = true;

          // Check on disk first: output JSON is written directly by Python pipeline and is not subject to stdout pipe buffer limits
          const resultFile = path.join(outputDir, jobId, "analysis_result.json");
          if (fs.existsSync(resultFile)) {
            try {
              const data = JSON.parse(fs.readFileSync(resultFile, "utf-8"));
              job.status = "COMPLETED";
              job.currentStage = "COMPLETE";
              job.progressPercent = 100;
              job.result = data;
              job.completedAt = new Date().toISOString();
              this.persistJobState(job);
              logger.info(
                { jobId, actionCount: data.semantic_actions?.length, framesCount: data.frames?.length },
                "Desktop evidence analysis completed and loaded from disk artifact"
              );
              return;
            } catch (readErr: any) {
              logger.warn({ jobId, err: readErr.message }, "Failed to parse analysis_result.json from disk");
            }
          }

          if (code === 0 && stdoutData.trim()) {
            try {
              const parsedResult = JSON.parse(stdoutData.trim());
              job.status = "COMPLETED";
              job.currentStage = "COMPLETE";
              job.progressPercent = 100;
              job.result = parsedResult;
              job.completedAt = new Date().toISOString();
              this.persistJobState(job);
              logger.info({ jobId }, "Desktop evidence analysis parsed from stdout");
              return;
            } catch (parseErr: any) {
              logger.warn({ jobId, err: parseErr.message }, "Failed to parse stdout JSON");
            }
          }

          // If code was non-zero or parsing failed, fallback gracefully so user flow continues
          logger.warn({ jobId, code, stderr: stderrData }, "Desktop evidence analysis completed with fallback");
          this.generateFallbackAnalysis(job, mediaPath, outputDir, tenantId, workerId, stderrData || `Process exited with code ${code}`);
        });
      } catch (err: any) {
        logger.error({ jobId, err: err.message }, "Unexpected error in desktop evidence runner - engaging fallback");
        this.generateFallbackAnalysis(job, mediaPath, outputDir, tenantId, workerId, err.message);
      }
    });

    return job;
  }

  /**
   * Converts the Python analysis result payload into a Ghost NormalizedDemonstration for BPI.
   */
  public toNormalizedDemonstration(
    analysisResult: any,
    tenantId: string
  ): NormalizedDemonstration {
    const mediaName = String(analysisResult.asset?.file_name || analysisResult.mediaPath || "").toLowerCase();
    const taskIntent = String(analysisResult.process_understanding?.task_intent || "").toLowerCase();
    let rawDetectedUrl = analysisResult.process_understanding?.detected_url ||
      analysisResult.timeline?.states?.find((s: any) => s.browser_url && !String(s.browser_url).includes("localhost:5173") && !String(s.browser_url).includes("sharing"))?.browser_url ||
      null;
    // Reconcile model-generated URL with screen OCR. OCR preserves subdomains that local CV
    // summaries sometimes truncate (for example docs.google.com -> google.com).
    const ocrUrls: string[] = [];
    for (const state of analysisResult.timeline?.states || []) {
      for (const text of state.visible_texts || []) {
        if (typeof text !== "string") continue;
        const matches = text.match(/(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:\/[a-z0-9._~:/?#[\]@!$&'()*+,;=%-]*)?/ig) || [];
        for (const match of matches) {
          try {
            const url = new URL(/^https?:\/\//i.test(match) ? match : `https://${match.replace(/[.,;:!?)]+$/g, "")}`);
            if (url.hostname.includes(".")) ocrUrls.push(url.toString().replace(/\/$/, ""));
          } catch { /* Ignore incomplete OCR fragments. */ }
        }
      }
    }
    const mostSpecificOcrUrl = ocrUrls.sort((a, b) => {
      const ua = new URL(a);
      const ub = new URL(b);
      return (ub.hostname.split(".").length * 10_000 + ub.pathname.length) - (ua.hostname.split(".").length * 10_000 + ua.pathname.length);
    })[0];
    if (mostSpecificOcrUrl) {
      let currentHostDepth = 0;
      try {
        if (rawDetectedUrl) currentHostDepth = new URL(/^https?:\/\//i.test(rawDetectedUrl) ? rawDetectedUrl : `https://${rawDetectedUrl}`).hostname.split(".").length;
      } catch { currentHostDepth = 0; }
      if (!rawDetectedUrl || new URL(mostSpecificOcrUrl).hostname.split(".").length > currentHostDepth) rawDetectedUrl = mostSpecificOcrUrl;
    }
    const detectedUrl = (rawDetectedUrl && !rawDetectedUrl.includes("localhost:5173") && !rawDetectedUrl.includes("sharing")) ? rawDetectedUrl : null;

    const isWebDemonstration = Boolean(detectedUrl) ||
      mediaName.includes("browser") || mediaName.includes("web") ||
      taskIntent.includes("browser") || taskIntent.includes("web") ||
      analysisResult.timeline?.applications_detected?.includes("Browser");

    // Layout artefacts and recording-tool chrome are removed; every removal is recorded with its reason.
    const droppedActions: Array<{ index: number; summary: string; reason: string }> = [];
    const filteredActions: any[] = (analysisResult.semantic_actions || []).filter((act: any, index: number) => {
      const val = String(act.parameters?.value || act.parameters?.demonstrated_value || "");
      const desc = String(act.summary || act.target_description || "");
      const win = String(act.window_title || "");
      const summary = desc || act.action_type || "action";
      if (/textregion_/i.test(val) || /textregion_/i.test(desc)) {
        droppedActions.push({ index, summary, reason: "CV layout artefact, not a user action" });
        return false;
      }
      if (RECORDER_CHROME.some(re => re.test(val) || re.test(desc) || re.test(win))) {
        droppedActions.push({ index, summary, reason: "Interaction with the recording tool, not the task" });
        return false;
      }
      return true;
    });

    // Only consecutive edits of the same field are merged; repeated clicks are distinct actions.
    const consolidatedActions: any[] = [];
    for (const act of filteredActions) {
      const last = consolidatedActions[consolidatedActions.length - 1];
      if (
        last &&
        (act.action_type === "ENTER_VALUE" || act.action_type === "TYPE") &&
        (last.action_type === "ENTER_VALUE" || last.action_type === "TYPE") &&
        act.target_description && act.target_description === last.target_description
      ) {
        last.parameters = { ...last.parameters, ...act.parameters };
        last.summary = act.summary;
        last.end_timestamp = act.end_timestamp ?? last.end_timestamp;
        droppedActions.push({ index: -1, summary: act.summary, reason: "Merged into the preceding edit of the same field" });
        continue;
      }
      consolidatedActions.push(act);
    }
    (analysisResult as any).dropped_actions = droppedActions;

    const observations: Observation[] = consolidatedActions.map((act: any, idx: number) => {
      let appName = act.application || (isWebDemonstration ? "Browser" : "Desktop");
      if (isWebDemonstration && appName === "Desktop") {
        appName = "Browser";
      }
      const actionType = act.action_type || "CLICK";
      const desc = act.summary || act.target_description || `${actionType} in ${appName}`;

      let bpiAction: Observation["action"] = "CLICK";
      if (actionType === "ENTER_VALUE" || actionType === "TYPE" || actionType === "INPUT" || act.parameters?.value !== undefined) {
        bpiAction = "INPUT";
      } else if (actionType === "READ_DATA" || actionType === "READ_FIELD" || actionType === "EXTRACT") {
        bpiAction = "EXTRACT";
      } else if (actionType === "NAVIGATE_WEB" || actionType === "NAVIGATE" || act.parameters?.url !== undefined) {
        bpiAction = "NAVIGATE";
      } else if (actionType === "SAVE_TRANSACTION" || actionType === "COMMIT_RECORD" || actionType === "SUBMIT") {
        bpiAction = "CLICK";
      }

      // A selector is used only when the evidence carried one; otherwise the step is targeted by its
      // demonstrated label/text at run time. Generic catch-all selectors are never synthesised.
      const evidenceSelector = act.target_selector?.strategy === "CSS" ? act.target_selector?.selector : (act.parameters?.selector || undefined);
      const resolvedSelector = specificSelectorOnly(evidenceSelector);
      const targetLabel = String(act.parameters?.field_label || act.parameters?.target_name || act.target_description || "")
        .replace(/^(?:click(?: on)?|press|submit|select|open|type(?: into)?|enter(?: into)?|fill(?: in)?)\s+/i, "").trim();

      return {
        sequence: idx + 1,
        timestamp: typeof act.start_timestamp === "number" ? String(act.start_timestamp) : "",
        action: bpiAction,
        context: {
          url: (bpiAction === "NAVIGATE" && detectedUrl) ? detectedUrl : (act.parameters?.url || (isWebDemonstration ? (detectedUrl || "") : appName)),
          page_title: desc,
          application: appName,
          window_title: act.window_title,
        },
        target: {
          dom_evidence: {
            tag: isWebDemonstration ? "browser_element" : "desktop_control",
            name: targetLabel || undefined,
            role: act.action_type,
            text: targetLabel || undefined,
            attributes: {
              application: appName,
              window_title: act.window_title || "",
              selector: resolvedSelector || (isWebDemonstration ? "" : JSON.stringify(act.target_selector || {})),
            },
          },
        },
        value: act.parameters?.value ? {
          raw_value: String(act.parameters.value),
          is_sensitive: String(act.parameters.field_label || "").toLowerCase().includes("pass"),
          placeholder: act.parameters.field_label || "value",
          classification: {
            value: act.is_demonstrated_value ? "RUNTIME_VARIABLE" : "CONSTANT",
            confidence: act.confidence || 0.9,
            classification: act.is_demonstrated_value ? "INFERRED_RULE" : "OBSERVED_FACT",
            evidence: [],
          },
          inferred_type: {
            value: (act.variable_type as any) || "string",
            confidence: 0.9,
            classification: "INFERRED_RULE",
            evidence: [],
          },
          semantic_role: {
            value: act.variable_name || "field",
            confidence: 0.9,
            classification: "INFERRED_RULE",
            evidence: [],
          },
        } : undefined,
        application: appName,
        action_type: actionType,
        inference_status: act.inference_status || "OBSERVED",
        provenance: act.provenance,
        source_media_id: analysisResult.media_id,
        frame_ids: act.provenance?.frame_ids || [],
        start_timestamp: act.start_timestamp,
        end_timestamp: act.end_timestamp,
        rationale: act.provenance?.rationale,
      } as any;
    });

    return {
      recording_id: analysisResult.media_id || `demo_${Date.now()}`,
      tenant_id: tenantId,
      source: "desktop_video",
      started_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
      observations,
    };
  }
}
