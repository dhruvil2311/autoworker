import * as path from "path";
import * as fs from "fs";
import { createHash } from "crypto";
import { logger } from "@ghost/observability";
import type { NormalizedDemonstration, Observation, VariableClassification, ProcessStructure } from "@ghost/bpi";
import { BusinessProcessIntelligence } from "@ghost/bpi";
import type { SemanticBPIProvider } from "@ghost/bpi/dist/ai.js";
import { WorkflowCompiler } from "../../compiler.js";
import { RealSemanticBPIProvider } from "../../ai-provider.js";
import type { WorkflowV2 } from "@ghost/workflow-schema";
import type { ApiConfig } from "../../config.js";
import {
  type VisionReasoningProvider,
  type SemanticEvidencePacket,
  type SemanticAction,
  type SemanticActionsResult,
  type ProcessUnderstandingResult,
  type EvidenceEpisode,
  type FrameEvidence,
  type OcrFact,
  OpenRouterError
} from "../openrouter/types.js";
import { OpenRouterProvider, SEMANTIC_EXTRACTION_PROMPT_VERSION } from "../openrouter/openrouter-provider.js";
import { FrameSampler } from "./frame-sampler.js";
import { TaskRelevanceEngine, type RawVisualObservation } from "./task-relevance-engine.js";
import { EvidenceEpisodeBuilder, dedupeOcr } from "./evidence-episode-builder.js";
import {
  groundSemanticActions,
  refineUrlWithOcr,
  normalizeText,
  type GroundedAction,
  type GroundingReport
} from "./grounding.js";

/** Keep the complete host and path shown in evidence; never reduce a subdomain to its registrable domain. */
export function extractUrlCandidates(text: string): string[] {
  const candidates = new Set<string>();
  const urlPattern = /(?:https?:\/\/)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d+)?(?:\/[a-z0-9._~:/?#[\]@!$&'()*+,;=%-]*)?/ig;
  for (const match of text.matchAll(urlPattern)) {
    let candidate = match[0].replace(/[.,;:!?)]+$/g, "");
    if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;
    try {
      const parsed = new URL(candidate);
      if (parsed.hostname.includes(".")) candidates.add(parsed.toString().replace(/\/$/, parsed.pathname === "/" && !candidate.endsWith("/") ? "" : "/"));
    } catch { /* Ignore malformed OCR fragments. */ }
  }
  return [...candidates];
}

export interface PipelineExecutionOptions {
  jobId: string;
  mediaPath: string;
  tenantId: string;
  workerId?: string | undefined;
  /** Objective stated by the user. Authoritative; never inferred from heuristics. */
  taskObjective?: string | undefined;
  /** Non-authoritative context shown to the model (for example a local CV summary). */
  taskContextHint?: string | undefined;
  rawObservations?: RawVisualObservation[] | undefined;
  rawFrames?: Array<{ frameId: string; timestamp: number; filePath: string }> | undefined;
  ocrFacts?: OcrFact[] | undefined;
  activeApplication?: string | undefined;
  /** Directory where completed model segments are stored so an interrupted analysis can resume. */
  checkpointDir?: string | undefined;
}

export interface PipelineExecutionResult {
  success: boolean;
  status: "COMPLETED" | "AI_QUOTA_EXHAUSTED" | "ANALYSIS_FAILED" | "NEEDS_RETRY" | "NEEDS_CLARIFICATION";
  message: string;
  workflow?: WorkflowV2 | undefined;
  semanticActions?: SemanticAction[] | undefined;
  processUnderstanding?: ProcessUnderstandingResult | undefined;
  evidencePacket?: SemanticEvidencePacket | undefined;
  grounding?: GroundingReport | undefined;
  provenance?: Record<string, any> | undefined;
  /** True when completed stages were persisted and a retry can continue from them. */
  resumable?: boolean | undefined;
  error?: string | undefined;
}

/**
 * Deterministic BPI provider that injects precomputed multimodal/local understanding
 * directly into BPI without making ANY external LLM requests.
 */
export class PrecomputedSemanticBPIProvider implements SemanticBPIProvider {
  constructor(private understanding: ProcessUnderstandingResult) {}

  async inferBusinessIntent(): Promise<{ intent: string; confidence: number; reasoning: string }> {
    return {
      intent: this.understanding.taskIntent || "",
      confidence: this.understanding.confidence ?? 0.5,
      reasoning: "Precomputed from multimodal demonstration analysis"
    };
  }

  async inferEntities(targets: Record<number, any>): Promise<Record<number, { name: string; confidence: number; reasoning: string }>> {
    const res: Record<number, { name: string; confidence: number; reasoning: string }> = {};
    for (const [k, v] of Object.entries(targets)) {
      const seq = parseInt(k, 10);
      const name = v?.dom_evidence?.name || v?.name || v?.text;
      if (typeof name !== "string" || !name.trim()) continue;
      res[seq] = {
        name: name.trim().slice(0, 100),
        confidence: 0.5,
        reasoning: "Derived from interaction target"
      };
    }
    return res;
  }

  async classifyAmbiguousValues(
    values: Record<string, string>,
    _context: string
  ): Promise<Record<string, { classification: VariableClassification; type: "string" | "number" | "boolean" | "date"; semantic_role: string; confidence: number; reasoning: string }>> {
    const res: Record<string, any> = {};
    const knownVars = this.understanding.variables || [];
    for (const [k, v] of Object.entries(values)) {
      const match = knownVars.find(kv => kv.name === k || kv.semanticRole === k);
      const strVal = String(v || "");
      let inferredType: "string" | "number" | "boolean" | "date" = (match?.type as any) || "string";
      if (!match) {
        if (/^\d+(\.\d+)?$/.test(strVal)) inferredType = "number";
        else if (/^(true|false)$/i.test(strVal)) inferredType = "boolean";
        else if (!isNaN(Date.parse(strVal)) && strVal.length > 5) inferredType = "date";
      }

      res[k] = {
        classification: (match?.classification as VariableClassification) || "RUNTIME_VARIABLE",
        type: inferredType,
        semantic_role: match?.semanticRole || k,
        confidence: 0.5,
        reasoning: "Precomputed variable classification"
      };
    }
    return res;
  }

  async inferProcessStructure(events: Observation[] | any[]): Promise<{ structure: ProcessStructure; confidence: number; reasoning: string }> {
    const rawType = String(this.understanding.processStructure?.type || "LINEAR").toUpperCase();
    const type = (rawType.includes("LOOP") ? "LOOP" : (rawType.includes("CONDITIONAL") ? "CONDITIONAL" : "LINEAR")) as "LINEAR" | "LOOP" | "CONDITIONAL";
    return {
      structure: {
        type,
        steps: (events as any[]).map(e => e.sequence)
      },
      confidence: this.understanding.confidence ?? 0.5,
      reasoning: "Precomputed process structure"
    };
  }

  async inferPotentialBusinessRules(): Promise<string[]> {
    return (this.understanding.businessRules || []).map(r => typeof r === "string" ? r : r.rule).filter(Boolean);
  }

  async identifySemanticAmbiguities(): Promise<string[]> {
    return (this.understanding.exceptions || []).map(e => typeof e === "string" ? e : `${e.triggerCondition}: ${e.fallbackAction}`).filter(Boolean);
  }
}

const BPI_ACTION: Record<string, Observation["action"]> = {
  NAVIGATE: "NAVIGATE",
  CLICK: "CLICK",
  TYPE: "INPUT",
  SELECT: "INPUT",
  KEYPRESS: "KEYBOARD",
  EXTRACT: "EXTRACT",
  VERIFY: "EXTRACT",
  WAIT: "WAIT",
  SCROLL: "WAIT",
  UNSUPPORTED: "CLICK"
};

interface SegmentCheckpoint {
  key: string;
  result: SemanticActionsResult;
  completedAt: string;
}

export class EvidenceToWorkflowPipeline {
  private frameSampler: FrameSampler;
  private relevanceEngine: TaskRelevanceEngine;
  private episodeBuilder: EvidenceEpisodeBuilder;

  constructor(
    private config: ApiConfig,
    private provider: VisionReasoningProvider = new OpenRouterProvider(config)
  ) {
    this.frameSampler = new FrameSampler({
      sampleFps: config.videoSampleFps || 1,
      maxFramesTotal: config.maxLlmImagesTotal || 30
    });
    this.relevanceEngine = new TaskRelevanceEngine();
    this.episodeBuilder = new EvidenceEpisodeBuilder();
  }

  /**
   * Local evidence extraction -> segmented vision reasoning -> grounding -> BPI -> workflow compilation.
   * Each stage's losses (dropped frames, discarded noise, uncovered transitions) are reported in provenance.
   */
  public async executePipeline(options: PipelineExecutionOptions): Promise<PipelineExecutionResult> {
    const { jobId, mediaPath, tenantId, workerId, activeApplication } = options;
    const userObjective = (options.taskObjective || "").trim();
    const mediaName = path.basename(mediaPath);

    logger.info({ jobId, mediaPath }, "[EvidencePipeline] Starting evidence-to-workflow compilation");

    try {
      // Stage 1: frames
      let rawFrames = options.rawFrames || [];
      let extractionReport: Record<string, any> | undefined;
      if (!rawFrames.length && options.mediaPath && fs.existsSync(options.mediaPath)) {
        const outDir = options.checkpointDir ? path.dirname(options.checkpointDir) : path.resolve("./evidence_output", tenantId, jobId);
        rawFrames = this.frameSampler.extractFramesFromMedia(options.mediaPath, outDir);
        extractionReport = this.frameSampler.lastExtractionReport;
        if (!rawFrames.length) {
          return {
            success: false,
            status: "ANALYSIS_FAILED",
            message: extractionReport?.error || "No frames could be extracted from the uploaded media; it may be corrupt or in an unsupported format.",
            provenance: { jobId, mediaName, extraction: extractionReport }
          };
        }
      }
      const sampledFrames: FrameEvidence[] = this.frameSampler.sampleAndDeduplicateFrames(rawFrames);
      const samplingReport = this.frameSampler.lastSamplingReport;

      // Stage 2: relevance filtering
      const { relevant: relevantObservations, discarded: discardedNoise } = this.relevanceEngine.filterTaskRelevantObservations(
        options.rawObservations || [],
        { activeApp: activeApplication }
      );

      // Stage 3: before/action/after episodes
      const contextText = [userObjective, options.taskContextHint].filter(Boolean).join(" | ");
      const ocrFacts = options.ocrFacts || [];
      const episodes: EvidenceEpisode[] = this.episodeBuilder.buildEpisodes(
        relevantObservations,
        sampledFrames,
        ocrFacts,
        { activeApp: activeApplication, taskContext: contextText }
      );

      if (!episodes.length && !sampledFrames.length) {
        return {
          success: false,
          status: "ANALYSIS_FAILED",
          message: "No meaningful visual state changes or interaction evidence detected in recording.",
          provenance: { jobId, mediaName, extraction: extractionReport, sampling: samplingReport }
        };
      }

      const evidencePacket: SemanticEvidencePacket = this.episodeBuilder.packageEvidencePacket(
        episodes,
        ocrFacts,
        { activeApp: activeApplication, taskContext: contextText }
      );
      evidencePacket.keyFrames = sampledFrames;

      // Stage 4: segmented vision reasoning
      const perRequest = Math.max(1, this.config.maxLlmImagesPerRequest || 6);
      const segments = this.buildSegments(evidencePacket, sampledFrames, perRequest);
      const maxSegments = this.config.maxSegmentsPerVideo || 20;
      if (segments.length > maxSegments) {
        return {
          success: false,
          status: "ANALYSIS_FAILED",
          message: `This recording needs ${segments.length} analysis segments but the configured budget is ${maxSegments} (MAX_SEGMENTS_PER_VIDEO). Nothing was compiled; raise the budget or provide a shorter recording.`,
          provenance: { jobId, mediaName, segmentsRequired: segments.length, segmentBudget: maxSegments, sampling: samplingReport }
        };
      }

      const mediaFingerprint = this.fingerprintMedia(mediaPath, jobId);
      const merged: SemanticAction[] = [];
      const discarded: string[] = [];
      const unresolved: string[] = [];
      const boundaryMerges: Array<{ segment: number; action: string; target?: string }> = [];
      let lastUnderstanding: ProcessUnderstandingResult | undefined;
      let reusedSegments = 0;

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i]!;
        segment.segment = { index: i, total: segments.length };
        segment.precedingActions = merged.slice(-8).map(a => ({ action: a.action, target: a.arguments?.target, value: a.arguments?.value }));
        const key = this.segmentKey(segment, mediaFingerprint);
        let result = this.loadSegment(options.checkpointDir, i, key);
        if (result) {
          reusedSegments++;
        } else {
          logger.info({ jobId, segment: i + 1, of: segments.length, frames: segment.keyFrames?.length, episodes: segment.episodes.length }, "[EvidencePipeline] Semantic action extraction");
          try {
            result = await this.provider.extractSemanticActions(segment);
          } catch (err: any) {
            const failure = this.handleProviderError(err, `Semantic action extraction failed on segment ${i + 1} of ${segments.length}`);
            failure.resumable = Boolean(options.checkpointDir) && i > 0;
            failure.provenance = { jobId, mediaName, completedSegments: i, totalSegments: segments.length, reusedSegments };
            return failure;
          }
          this.saveSegment(options.checkpointDir, i, key, result);
        }

        // The first action of a segment may repeat the last one of the previous segment. It is merged only
        // when it carries no new evidence from this segment; a genuinely repeated action is kept.
        const segmentEvidence = new Set([...segment.episodes.map(e => e.episodeId), ...(segment.keyFrames || []).map(f => f.frameId)]);
        for (const action of result.semanticActions) {
          const prev = merged[merged.length - 1];
          const citesThisSegment = (action.evidenceEpisodeIds || []).some(id => segmentEvidence.has(id));
          const sharesEvidence = (action.evidenceEpisodeIds || []).some(id => (prev?.evidenceEpisodeIds || []).includes(id));
          if (prev && i > 0 && this.isFirstOfSegment(result, action) && this.sameAction(prev, action) && (sharesEvidence || !citesThisSegment)) {
            boundaryMerges.push({ segment: i, action: action.action, target: action.arguments?.target });
            prev.evidenceEpisodeIds = Array.from(new Set([...(prev.evidenceEpisodeIds || []), ...(action.evidenceEpisodeIds || [])]));
            continue;
          }
          merged.push(action);
        }
        discarded.push(...(result.discardedNoise || []));
        unresolved.push(...(result.unresolved || []));
        if (result.processUnderstanding) lastUnderstanding = result.processUnderstanding;
      }

      if (!merged.length) {
        return {
          success: false,
          status: "NEEDS_CLARIFICATION",
          message: "The recording was analysed, but no task actions could be identified in it. Nothing was compiled.",
          evidencePacket,
          provenance: { jobId, mediaName, segments: segments.length, unresolved, discardedNoise: discarded, sampling: samplingReport }
        };
      }

      // Stage 5: process understanding over the complete action list
      let processUnderstanding: ProcessUnderstandingResult;
      if (segments.length === 1 && lastUnderstanding) {
        processUnderstanding = lastUnderstanding;
      } else {
        try {
          processUnderstanding = await this.provider.compileProcessUnderstanding(merged, { objective: userObjective, tenantId, workerId });
        } catch (err: any) {
          const failure = this.handleProviderError(err, "Process understanding compilation failed");
          failure.resumable = Boolean(options.checkpointDir);
          failure.semanticActions = merged;
          failure.provenance = { jobId, mediaName, completedSegments: segments.length, totalSegments: segments.length, reusedSegments };
          return failure;
        }
      }

      // Stage 6: grounding (deterministic; separates observation from interpretation)
      const citedFrameIds = sampledFrames.map(f => f.frameId);
      const grounding = groundSemanticActions({
        actions: merged,
        packet: evidencePacket,
        ocrFacts,
        userObjective,
        modelObjective: processUnderstanding.taskIntent,
        discardedNoise: discarded,
        citedFrameIds
      });

      const provenance: Record<string, any> = {
        jobId,
        mediaName,
        extraction: extractionReport,
        sampling: samplingReport,
        episodesCount: episodes.length,
        segments: segments.length,
        reusedSegments,
        boundaryMerges,
        semanticActionsCount: merged.length,
        discardedNoise: discarded,
        discardedObservations: discardedNoise.length,
        unresolved,
        coverage: grounding.coverage
      };

      if (grounding.blocking) {
        return {
          success: false,
          status: "NEEDS_CLARIFICATION",
          message: "The recording was interpreted, but some actions are not supported by the evidence or required details are missing. Resolve the listed items; no workflow was compiled.",
          semanticActions: merged,
          processUnderstanding,
          evidencePacket,
          grounding,
          provenance
        };
      }

      // Stage 7: BPI on grounded actions
      const demo = this.demonstrationFromGrounding(grounding, processUnderstanding, ocrFacts, { jobId, tenantId });
      const bpiProvider = new PrecomputedSemanticBPIProvider({ ...processUnderstanding, taskIntent: grounding.objective.text });
      const bpi = new BusinessProcessIntelligence(bpiProvider as any);
      const bpiResult = await bpi.processDemonstration(demo);

      const blockingGaps = bpiResult.specification.unresolvedGaps.filter(gap => gap.blocking);
      if (blockingGaps.length > 0 || bpiResult.specification.status === "NEEDS_CLARIFICATION") {
        return {
          success: false,
          status: "NEEDS_CLARIFICATION",
          message: "Evidence was interpreted, but required workflow details remain unresolved. Clarify the blocking items before compilation.",
          semanticActions: merged,
          processUnderstanding,
          evidencePacket,
          grounding,
          provenance: { ...provenance, blockingGaps }
        };
      }

      // Stage 8: compile; the compiler preserves every grounded action and adds approval gates.
      const aiProvider = new RealSemanticBPIProvider(this.config);
      const compiler = new WorkflowCompiler(aiProvider);
      const compiledWorkflow = await compiler.compile(bpiResult.specification, {
        version: "openrouter-evidence-compiler-2.0",
        evidenceSourced: true,
        grounding
      });

      Object.assign(compiledWorkflow.compiler as any, {
        source_type: "OPENROUTER_SEMANTIC_EVIDENCE",
        source_recording_id: jobId,
        source_media_name: mediaName,
        action_count: merged.length,
        frame_count: sampledFrames.length,
        compiled_from: `Evidence Demonstration: ${mediaName}`,
        process_understanding: processUnderstanding,
        evidence_provenance: provenance
      });

      logger.info(
        { jobId, stepsCount: compiledWorkflow.root_step?.children?.length, fidelity: grounding.coverage.fidelity },
        "[EvidencePipeline] Workflow compiled from evidence"
      );

      return {
        success: true,
        status: "COMPLETED",
        message: `Workflow compiled from evidence (${merged.length} actions, ${sampledFrames.length} keyframes, coverage ${grounding.coverage.fidelity}).`,
        workflow: compiledWorkflow,
        semanticActions: merged,
        processUnderstanding,
        evidencePacket,
        grounding,
        provenance
      };
    } catch (err: any) {
      logger.error({ jobId, err: err.message }, "[EvidencePipeline] Unexpected pipeline exception");
      return {
        success: false,
        status: "ANALYSIS_FAILED",
        message: `Unexpected pipeline error: ${err.message}`,
        error: err.message
      };
    }
  }

  private handleProviderError(err: any, prefix: string): PipelineExecutionResult {
    logger.warn({ err: err.message, type: err.type }, `[EvidencePipeline] ${prefix}`);

    const isRateLimitOrQuota = (err instanceof OpenRouterError && (err.type === "AI_QUOTA_EXHAUSTED" || err.type === "RATE_LIMITED" || err.type === "PAYMENT_REQUIRED")) ||
                               err.status === 429 ||
                               err.statusCode === 429 ||
                               err.message?.includes("429") ||
                               err.message?.toLowerCase().includes("rate limit") ||
                               err.message?.toLowerCase().includes("quota") ||
                               err.message?.toLowerCase().includes("credits");

    if (isRateLimitOrQuota) {
      return {
        success: false,
        status: "AI_QUOTA_EXHAUSTED",
        message: `Semantic compilation could not complete because the OpenRouter model quota or rate limit was exhausted: ${err.message}`,
        error: `RATE_LIMIT_EXHAUSTED: ${err.message}`
      };
    }

    if (err instanceof OpenRouterError && err.type === "COST_GUARD_VIOLATION") {
      return {
        success: false,
        status: "ANALYSIS_FAILED",
        message: `Cost Guard blocked non-free model inference: ${err.message}`,
        error: `COST_GUARD_VIOLATION: ${err.message}`
      };
    }

    if (err instanceof OpenRouterError && ["TIMEOUT", "PROVIDER_ERROR", "SERVICE_UNAVAILABLE", "OUTPUT_TRUNCATED", "MALFORMED_OUTPUT"].includes(err.type)) {
      return {
        success: false,
        status: "NEEDS_RETRY",
        message: `${prefix}: ${err.message}`,
        error: `${err.type}: ${err.message}`
      };
    }

    return {
      success: false,
      status: "ANALYSIS_FAILED",
      message: `${prefix}: ${err.message || "Unknown error during compilation"}`,
      error: err.message || "Compilation failed"
    };
  }

  /** Splits the evidence into chronological segments that each fit one vision request. */
  private buildSegments(packet: SemanticEvidencePacket, frames: FrameEvidence[], perRequest: number): SemanticEvidencePacket[] {
    const timed = packet.timedOcr || [];
    const make = (keyFrames: FrameEvidence[], episodes: EvidenceEpisode[], start: number, end: number): SemanticEvidencePacket => {
      const ocr = timed.filter(o => typeof o.timestamp !== "number" || (o.timestamp >= start && o.timestamp < end));
      return {
        ...packet,
        packetId: `${packet.packetId}_${start.toFixed(1)}`,
        episodes,
        keyFrames,
        timedOcr: ocr,
        ocrFacts: ocr.map(o => o.text),
        timestamps: { start, end: Number.isFinite(end) ? end : (packet.timestamps.end ?? start) }
      };
    };

    if (frames.length <= perRequest) {
      return [make(frames, packet.episodes, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY)].map(s => ({ ...s, timestamps: packet.timestamps }));
    }

    const segments: SemanticEvidencePacket[] = [];
    for (let i = 0; i < frames.length; i += perRequest) {
      const chunk = frames.slice(i, i + perRequest);
      const start = i === 0 ? Number.NEGATIVE_INFINITY : chunk[0]!.timestamp;
      const next = frames[i + perRequest];
      const end = next ? next.timestamp : Number.POSITIVE_INFINITY;
      const episodes = packet.episodes.filter(ep => {
        const t = (ep.timestampStart + ep.timestampEnd) / 2;
        return t >= start && t < end;
      });
      const segment = make(chunk, episodes, start, end);
      segment.timestamps = { start: chunk[0]!.timestamp, end: chunk[chunk.length - 1]!.timestamp };
      segments.push(segment);
    }
    return segments;
  }

  private fingerprintMedia(mediaPath: string, jobId: string): string {
    try {
      const stat = fs.statSync(mediaPath);
      return `${path.basename(mediaPath)}:${stat.size}:${stat.mtimeMs}`;
    } catch {
      return `job:${jobId}`;
    }
  }

  /** A checkpoint is valid only for the same media, evidence, prompt version and model. */
  private segmentKey(segment: SemanticEvidencePacket, mediaFingerprint: string): string {
    return createHash("sha256").update(JSON.stringify({
      prompt: SEMANTIC_EXTRACTION_PROMPT_VERSION,
      model: this.config.openRouterVisionModel,
      media: mediaFingerprint,
      context: segment.taskContext,
      frames: (segment.keyFrames || []).map(f => `${f.frameId}@${f.timestamp}`),
      episodes: segment.episodes.map(e => e.episodeId),
      preceding: segment.precedingActions || []
    })).digest("hex");
  }

  private loadSegment(dir: string | undefined, index: number, key: string): SemanticActionsResult | undefined {
    if (!dir) return undefined;
    try {
      const file = path.join(dir, `segment_${index}.json`);
      if (!fs.existsSync(file)) return undefined;
      const data = JSON.parse(fs.readFileSync(file, "utf8")) as SegmentCheckpoint;
      return data.key === key ? data.result : undefined;
    } catch {
      return undefined;
    }
  }

  private saveSegment(dir: string | undefined, index: number, key: string, result: SemanticActionsResult): void {
    if (!dir) return;
    try {
      fs.mkdirSync(dir, { recursive: true });
      const checkpoint: SegmentCheckpoint = { key, result, completedAt: new Date().toISOString() };
      fs.writeFileSync(path.join(dir, `segment_${index}.json`), JSON.stringify(checkpoint), "utf8");
    } catch (err: any) {
      logger.warn({ err: err.message, index }, "[EvidencePipeline] Could not persist segment checkpoint");
    }
  }

  private sameAction(a: SemanticAction, b: SemanticAction): boolean {
    return normalizeText(a.action) === normalizeText(b.action) &&
      normalizeText(a.arguments?.target) === normalizeText(b.arguments?.target) &&
      normalizeText(a.arguments?.value) === normalizeText(b.arguments?.value) &&
      normalizeText(a.arguments?.url) === normalizeText(b.arguments?.url);
  }

  private isFirstOfSegment(result: SemanticActionsResult, action: SemanticAction): boolean {
    return result.semanticActions[0] === action;
  }

  /**
   * Builds the BPI demonstration from grounded actions. Every grounded action becomes exactly one
   * observation carrying its evidence; nothing is synthesised and nothing is dropped.
   */
  private demonstrationFromGrounding(
    grounding: GroundingReport,
    processUnderstanding: ProcessUnderstandingResult,
    ocrFacts: OcrFact[],
    context: { jobId: string; tenantId: string }
  ): NormalizedDemonstration {
    const ocrUrls = ocrFacts.flatMap(f => extractUrlCandidates(f.text || "").map(url => ({ url, timestamp: f.timestamp })));
    const firstNav = grounding.actions.find(g => g.action === "NAVIGATE" && g.url === grounding.destination?.url);
    const destination = refineUrlWithOcr(grounding.destination?.url, ocrUrls, firstNav?.evidence.timestampEnd);
    const isBrowser = /browser|web/i.test(processUnderstanding.applicationEnvironment || "") || Boolean(destination);
    const observations = grounding.actions.map(g => this.observationFromGrounded(g, {
      url: g.action === "NAVIGATE" ? refineUrlWithOcr(g.url, ocrUrls, g.evidence.timestampEnd) : destination,
      isBrowser
    }));
    return {
      recording_id: context.jobId,
      tenant_id: context.tenantId,
      source: "SCREEN_RECORDING",
      started_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
      observations
    };
  }

  private observationFromGrounded(g: GroundedAction, ctx: { url: string | undefined; isBrowser: boolean }): Observation {
    const targetText = g.target?.text || g.target?.label || "";
    const description = this.describe(g);
    return {
      sequence: g.index + 1,
      timestamp: g.evidence.timestampStart !== undefined ? String(g.evidence.timestampStart) : "",
      action: BPI_ACTION[g.action] || "CLICK",
      context: {
        url: ctx.url || "",
        page_title: description,
        application: g.application
      },
      target: {
        dom_evidence: {
          tag: ctx.isBrowser ? "browser_element" : "desktop_control",
          name: targetText,
          role: g.target?.role || g.action,
          text: targetText,
          attributes: { selector: g.target?.selector || "", application: g.application }
        }
      },
      value: g.value ? {
        raw_value: g.value,
        is_sensitive: /pass(word)?|pwd|otp|pin\b/i.test(targetText),
        placeholder: targetText,
        classification: { value: "RUNTIME_VARIABLE", confidence: g.confidence, classification: "INFERRED_RULE", evidence: [] },
        inferred_type: { value: "string", confidence: 0.9, classification: "INFERRED_RULE", evidence: [] },
        semanticRole: { value: "input_data", confidence: 0.9, classification: "INFERRED_RULE", evidence: [] }
      } : undefined,
      application: g.application,
      action_type: g.action,
      inference_status: g.basis,
      frame_ids: g.evidence.frameIds,
      start_timestamp: g.evidence.timestampStart,
      end_timestamp: g.evidence.timestampEnd,
      rationale: g.rationale,
      grounding: g
    } as any;
  }

  private describe(g: GroundedAction): string {
    const target = g.target?.text || g.target?.label;
    switch (g.action) {
      case "NAVIGATE": return `Open ${g.url || "the demonstrated address"}`;
      case "TYPE": return `Enter ${/pass(word)?|pwd|otp/i.test(target || "") ? "the credential" : `"${g.value ?? ""}"`} into ${target ? `"${target}"` : "the field"}`;
      case "SELECT": return `Choose "${g.value ?? ""}" in ${target ? `"${target}"` : "the list"}`;
      case "CLICK": return `Click ${target ? `"${target}"` : "the demonstrated control"}`;
      case "KEYPRESS": return `Press ${g.value || "the demonstrated key"}${target ? ` in "${target}"` : ""}`;
      case "EXTRACT": return `Read ${target ? `"${target}"` : "the displayed result"}`;
      case "VERIFY": return `Confirm ${target ? `"${target}"` : "the expected state"}`;
      case "WAIT": return "Wait for the page to update";
      case "SCROLL": return `Scroll${target ? ` to "${target}"` : ""}`;
      default: return g.rationale || g.rawAction;
    }
  }

  /**
   * Converts semantic actions into a BPI demonstration (used by callers that already hold model
   * output). Actions are grounded against the supplied OCR; none are added or removed.
   */
  public toNormalizedDemonstration(
    semanticActions: SemanticAction[],
    processUnderstanding: ProcessUnderstandingResult,
    context: {
      jobId: string;
      mediaName: string;
      tenantId: string;
      ocrFacts?: Array<{ text: string; timestamp?: number }> | undefined;
      rawObservations?: RawVisualObservation[] | undefined;
      userObjective?: string | undefined;
    }
  ): NormalizedDemonstration {
    const ocrFacts: OcrFact[] = (context.ocrFacts || []).map(o => ({ text: o.text, timestamp: o.timestamp }));
    const packet: SemanticEvidencePacket = {
      packetId: `pkt_${context.jobId}`,
      taskContext: context.userObjective || "",
      activeApplication: processUnderstanding.applicationEnvironment || "Browser",
      episodes: [],
      ocrFacts: ocrFacts.map(o => o.text),
      timedOcr: dedupeOcr(ocrFacts),
      confidence: processUnderstanding.confidence ?? 0,
      timestamps: { start: 0, end: 0 }
    };
    const grounding = groundSemanticActions({
      actions: semanticActions,
      packet,
      ocrFacts,
      userObjective: context.userObjective,
      modelObjective: processUnderstanding.taskIntent
    });
    return this.demonstrationFromGrounding(grounding, processUnderstanding, ocrFacts, { jobId: context.jobId, tenantId: context.tenantId });
  }
}
