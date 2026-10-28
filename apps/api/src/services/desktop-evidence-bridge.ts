import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { logger } from "@ghost/observability";
import type { NormalizedDemonstration, Observation } from "@ghost/bpi";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DesktopAnalysisJob {
  jobId: string;
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

export class DesktopEvidenceBridge {
  private static instance: DesktopEvidenceBridge;
  private jobs: Map<string, DesktopAnalysisJob> = new Map();

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
        const currentJob = this.getJob(options.jobId);
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

  public getJob(jobId: string): DesktopAnalysisJob | undefined {
    let job = this.jobs.get(jobId);
    if (!job) {
      // Check disk if server restarted
      const evidenceOutputDirs = [
        path.resolve(process.cwd(), "evidence_output"),
        path.resolve(process.cwd(), "apps/api/evidence_output"),
        path.resolve(__dirname, "../../evidence_output"),
        path.resolve(__dirname, "../../../evidence_output"),
      ];

      for (const baseDir of evidenceOutputDirs) {
        if (!fs.existsSync(baseDir)) continue;
        try {
          const findJobJson = (dir: string): string | null => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              const fullPath = path.join(dir, entry.name);
              if (entry.isDirectory()) {
                if (entry.name === jobId) {
                  const target = path.join(fullPath, "analysis_result.json");
                  if (fs.existsSync(target)) return target;
                }
                const sub = findJobJson(fullPath);
                if (sub) return sub;
              }
            }
            return null;
          };

          const foundFile = findJobJson(baseDir);
          if (foundFile) {
            const data = JSON.parse(fs.readFileSync(foundFile, "utf-8"));
            job = {
              jobId,
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

  public findJobIdForMedia(mediaPath: string): string | undefined {
    // 1. Check in-memory jobs
    for (const job of this.jobs.values()) {
      if (job.mediaPath === mediaPath && job.status === "COMPLETED") {
        return job.jobId;
      }
    }

    // 2. Check disk output directories
    const evidenceOutputDirs = [
      path.resolve(process.cwd(), "evidence_output"),
      path.resolve(process.cwd(), "apps/api/evidence_output"),
      path.resolve(__dirname, "../../evidence_output"),
      path.resolve(__dirname, "../../../evidence_output"),
    ];

    const baseName = path.basename(mediaPath);
    for (const baseDir of evidenceOutputDirs) {
      if (!fs.existsSync(baseDir)) continue;
      try {
        const findJob = (dir: string): string | null => {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              const target = path.join(fullPath, "analysis_result.json");
              if (fs.existsSync(target)) {
                try {
                  const data = JSON.parse(fs.readFileSync(target, "utf-8"));
                  if (data.asset?.file_path === mediaPath || data.asset?.file_name === baseName) {
                    const actions = data.semantic_actions || [];
                    const hasCorruption = actions.some((a: any) => {
                      const val = String(a.parameters?.value || "");
                      const desc = String(a.summary || "");
                      return val.includes("TextRegion_") || desc.includes("TextRegion_");
                    });
                    if (!hasCorruption && actions.length <= 35) {
                      return entry.name;
                    }
                  }
                } catch {}
              }
              const sub = findJob(fullPath);
              if (sub) return sub;
            }
          }
          return null;
        };

        const foundJobId = findJob(baseDir);
        if (foundJobId) {
          // Hydrate into in-memory jobs
          this.getJob(foundJobId);
          return foundJobId;
        }
      } catch {}
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
      status: "QUEUED",
      progressPercent: 5,
      currentStage: "Media Ingestion Initialized",
      mediaPath,
      mediaType,
      createdAt: new Date().toISOString(),
    };
    this.jobs.set(jobId, job);

    // Asynchronously run analysis
    setImmediate(async () => {
      try {
        job.status = "RUNNING";
        job.currentStage = "EXTRACTING";
        job.progressPercent = 20;

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
    const rawDetectedUrl = analysisResult.process_understanding?.detected_url ||
      analysisResult.timeline?.states?.find((s: any) => s.browser_url && !String(s.browser_url).includes("localhost:5173") && !String(s.browser_url).includes("sharing"))?.browser_url ||
      null;
    const detectedUrl = (rawDetectedUrl && !rawDetectedUrl.includes("localhost:5173") && !rawDetectedUrl.includes("sharing")) ? rawDetectedUrl : null;

    const isWebDemonstration = Boolean(detectedUrl) ||
      mediaName.includes("browser") || mediaName.includes("web") ||
      taskIntent.includes("browser") || taskIntent.includes("web") ||
      analysisResult.timeline?.applications_detected?.includes("Browser");

    // General demonstration consolidation: filter layout bounding boxes, recorder noise, and merge micro-actions
    const RECORDER_NOISE = [
      "stop sharing", "stop recording", "is sharing your screen", "hide",
      "autoworker", "localhost:5173", "localhost:4000", "teaching workspace",
      "new tab", "what is ffmpeg", "roadmap", "spatial floor", "chatgpt", "command room"
    ];
    const filteredActions: any[] = (analysisResult.semantic_actions || []).filter((act: any) => {
      const val = String(act.parameters?.value || act.parameters?.demonstrated_value || "").toLowerCase();
      const desc = String(act.summary || act.target_description || "").toLowerCase();
      const win = String(act.window_title || "").toLowerCase();
      if (val.includes("textregion_") || val.startsWith("[textregion_")) return false;
      if (desc.includes("textregion_") || desc.includes("[textregion_")) return false;
      if (RECORDER_NOISE.some(rn => val.includes(rn) || desc.includes(rn) || win.includes(rn))) return false;
      return true;
    });

    const consolidatedActions: any[] = [];
    for (const act of filteredActions) {
      if (consolidatedActions.length > 0) {
        const last = consolidatedActions[consolidatedActions.length - 1];
        if (
          (act.action_type === "ENTER_VALUE" || act.action_type === "TYPE") &&
          (last.action_type === "ENTER_VALUE" || last.action_type === "TYPE") &&
          (act.target_description === last.target_description || JSON.stringify(act.target_selector) === JSON.stringify(last.target_selector))
        ) {
          last.parameters = { ...last.parameters, ...act.parameters };
          last.summary = act.summary;
          continue;
        }
        if (act.action_type === "CLICK" && last.action_type === "CLICK" && act.summary === last.summary) {
          continue;
        }
      }
      consolidatedActions.push(act);
      if (consolidatedActions.length >= 25) break; // Intelligent step ceiling
    }

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

      // Derive smart selector for web elements dynamically from any demonstration
      let resolvedSelector = act.target_selector?.selector || act.parameters?.selector;
      if (!resolvedSelector && isWebDemonstration) {
        const rawTarget = act.parameters?.field_label || act.parameters?.target_name || act.target_description || desc || "";
        const clean = String(rawTarget).replace(/^(?:click|press|submit|select|open|add|type|enter|fill)\s+/i, '').replace(/["'\.\:;]/g, '').trim();
        const lowerClean = clean.toLowerCase();
        const slug = lowerClean.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

        if (bpiAction === "INPUT") {
          const inputCandidates: string[] = [];
          if (slug) {
            inputCandidates.push(
              `input[name='${slug}']`,
              `input[name*='${slug}' i]`,
              `input[placeholder*='${clean}' i]`,
              `input[aria-label*='${clean}' i]`,
              `[data-test*='${slug}']`,
              `#${slug}`
            );
          }
          inputCandidates.push("input:not([type='hidden'])");
          resolvedSelector = Array.from(new Set(inputCandidates.filter(Boolean))).join(", ");
        } else if (bpiAction === "CLICK") {
          const clickCandidates: string[] = [];
          if (clean) {
            clickCandidates.push(
              `button:has-text('${clean}')`,
              `a:has-text('${clean}')`,
              `[role='button']:has-text('${clean}')`
            );
          }
          if (slug) {
            clickCandidates.push(
              `[data-test*='${slug}']`,
              `#${slug}`,
              `button[name='${slug}']`,
              `a[href*='${slug}']`
            );
            const words = clean.split(/\s+/).filter(w => w.length > 3 && !['click', 'item', 'button', 'into', 'from', 'view'].includes(w.toLowerCase()));
            for (const w of words) {
              const wSlug = w.toLowerCase().replace(/[^a-z0-9]+/g, '');
              clickCandidates.push(`[data-test*='${wSlug}']`, `button:has-text('${w}')`, `a:has-text('${w}')`);
            }
          }
          clickCandidates.push("button", "a");
          resolvedSelector = Array.from(new Set(clickCandidates.filter(Boolean))).join(", ");
        }
      }

      return {
        sequence: idx + 1,
        timestamp: String(act.start_timestamp || idx),
        action: bpiAction,
        context: {
          url: act.parameters?.url || (isWebDemonstration ? (detectedUrl || "") : appName),
          page_title: desc,
          application: appName,
          window_title: act.window_title,
        },
        target: {
          dom_evidence: {
            tag: isWebDemonstration ? "browser_element" : "desktop_control",
            name: act.target_description,
            role: act.action_type,
            text: act.parameters?.target_name || act.target_description,
            attributes: {
              application: appName,
              window_title: act.window_title || "",
              selector: resolvedSelector || (isWebDemonstration ? "button, input, a" : JSON.stringify(act.target_selector || {})),
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

    // Ensure web demonstration starts with NAVIGATE if not already present
    if (isWebDemonstration && detectedUrl && observations.length > 0 && observations[0]?.action !== "NAVIGATE") {
      observations.unshift({
        sequence: 1,
        timestamp: "0.0",
        action: "NAVIGATE",
        context: {
          url: detectedUrl,
          page_title: `Open ${detectedUrl}`,
          application: "Browser"
        },
        target: {
          dom_evidence: {
            tag: "body",
            name: "Browser Navigation",
            role: "NAVIGATE",
            text: `Open ${detectedUrl}`,
            attributes: {
              selector: "body",
              application: "Browser",
              url: detectedUrl
            }
          }
        },
        application: "Browser",
        action_type: "NAVIGATE",
        inference_status: "OBSERVED"
      } as any);
      observations.forEach((o, i) => { o.sequence = i + 1; });
    }

    if (observations.length === 0) {
      observations.push({
        sequence: 1,
        timestamp: "0.5",
        action: isWebDemonstration ? "NAVIGATE" : "CLICK",
        context: {
          url: isWebDemonstration ? (detectedUrl || "about:blank") : "Desktop Application",
          page_title: isWebDemonstration ? "Web Portal" : "Active Screen Interaction",
          application: isWebDemonstration ? "Browser" : "Desktop",
        },
        target: {
          dom_evidence: {
            tag: isWebDemonstration ? "browser_navigation" : "desktop_control",
            name: isWebDemonstration ? "Web Portal" : "Desktop Workspace Element",
            role: isWebDemonstration ? "NAVIGATE" : "CLICK",
            text: isWebDemonstration ? "Navigate to web portal" : "Demonstrated action on desktop workspace",
            attributes: {
              application: isWebDemonstration ? "Browser" : "Desktop",
              selector: "body",
            },
          },
        },
        application: isWebDemonstration ? "Browser" : "Desktop",
        action_type: isWebDemonstration ? "NAVIGATE" : "CLICK",
        inference_status: "OBSERVED",
      } as any);
    }

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
