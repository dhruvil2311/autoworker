import * as fs from "fs";
import { logger } from "@ghost/observability";
import type { ApiConfig } from "../../config.js";
import {
  type VisionReasoningProvider,
  type SemanticEvidencePacket,
  type SemanticActionsResult,
  type SemanticAction,
  type ProcessReasoningContext,
  type ProcessUnderstandingResult,
  type CriticResult,
  type FrameEvidence,
  SemanticActionsResultSchema,
  ProcessUnderstandingResultSchema,
  OpenRouterError
} from "./types.js";
import { OpenRouterQuotaManager } from "./quota-manager.js";

export function cleanJsonPayload(raw: string): string {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  // If text contains markdown commentary before or after the JSON, find the outermost JSON structure
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    text = text.substring(firstBrace, lastBrace + 1).trim();
  }
  return text;
}

/** Parses Retry-After (seconds or HTTP date) into milliseconds. */
export function parseRetryAfterMs(header: string | null | undefined, now: number = Date.now()): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}

/** Exponential backoff with full jitter, capped. */
export function backoffDelayMs(attempt: number, baseMs = 1000, capMs = 15_000, random: () => number = Math.random): number {
  const ceiling = Math.min(capMs, baseMs * Math.pow(2, Math.max(0, attempt - 1)));
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}

/** Counts action objects in a (possibly broken) JSON text; a repair may never exceed this. */
function countActionObjects(text: string): number {
  return (text.match(/"action"\s*:/g) || []).length;
}

const SUPPORTED_ACTIONS = "NAVIGATE, CLICK, TYPE, SELECT, KEYPRESS, SCROLL, WAIT, EXTRACT, VERIFY";

export const SEMANTIC_EXTRACTION_PROMPT_VERSION = "evidence-grounded-2";

const SEMANTIC_EXTRACTION_PROMPT = `You reconstruct the workflow a user demonstrated in a screen recording, using only the evidence provided.

Evidence you receive:
- Chronological keyframes. Each image is preceded by a text label "FRAME <frameId> @ <seconds>s".
- Interaction episodes detected by local computer vision (before/action/after), with ids like ep_01.
- OCR text lines with timestamps.

Rules:
1. Report only actions the evidence shows. Do not add steps from general knowledge of how an application usually works, and do not complete a process the recording does not complete.
2. Every action must cite its evidence in "evidenceEpisodeIds" using the exact episode ids and/or frame ids given to you.
3. "evidenceStatus" is "OBSERVED" only when the action is visible in the cited evidence, "INFERRED" when it is implied by the change between cited frames (for example a field that becomes filled), and "UNKNOWN" otherwise.
4. "arguments.target" is the visible label or text of the control exactly as shown on screen. "arguments.value" is the exact text typed or option chosen, copied from the frames. If a value is unreadable, omit it and say so in "rationale".
5. Copy address-bar URLs verbatim, including every subdomain, path and query. If the address is clipped or unreadable, omit "arguments.url" and record the uncertainty in "unresolved".
6. Use only these action names: ${SUPPORTED_ACTIONS}. If the user did something these cannot express, emit action "UNSUPPORTED" and describe it in "rationale".
7. Ignore recording-tool UI, operating-system chrome, idle time and cursor movement that changes nothing; list what you ignored in "discardedNoise".
8. List anything you saw but could not interpret in "unresolved" instead of guessing.
9. "processUnderstanding.taskIntent" states the user's goal only as far as the evidence supports it. Leave it empty if the goal is not evident.

Return JSON only:
{
  "semanticActions": [
    { "action": "CLICK", "arguments": { "target": "visible label", "value": "typed text", "url": "address" },
      "application": "Browser", "evidenceEpisodeIds": ["ep_01", "frame_000004"], "confidence": 0.0,
      "evidenceStatus": "OBSERVED", "rationale": "what in the cited evidence shows this" }
  ],
  "processUnderstanding": {
    "taskIntent": "", "applicationEnvironment": "Web Browser | Windows Desktop | Mixed",
    "processStructure": { "type": "LINEAR", "stepIndices": [] },
    "variables": [], "businessRules": [], "expectedOutcomes": [], "exceptions": [], "confidence": 0.0
  },
  "discardedNoise": [],
  "unresolved": []
}`;

interface CompletionResult {
  content: string;
  model: string;
  finishReason?: string | undefined;
}

export class OpenRouterProvider implements VisionReasoningProvider {
  private quotaManager: OpenRouterQuotaManager;
  private apiKey: string;
  private baseUrl: string;
  private visionModel: string;
  private reasoningModel: string;
  private fallbackVisionModels: string[];
  private siteUrl?: string;
  private siteName?: string;
  private maxRetries: number;
  private timeoutMs: number;
  /** Longest provider-requested wait the request loop will sleep through before giving up. */
  private maxRetryAfterWaitMs = 20_000;
  private sleep: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms));

  constructor(private config: ApiConfig, private fetchImpl: typeof fetch = (...args) => fetch(...args)) {
    this.quotaManager = OpenRouterQuotaManager.getInstance({
      allowPaidModels: config.allowPaidModels,
      maxConcurrentRequests: config.openRouterMaxConcurrentRequests,
      maxRetries: config.openRouterMaxRetries
    });
    this.apiKey = config.openRouterApiKey || "";
    this.baseUrl = (config.openRouterBaseUrl || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
    this.visionModel = config.openRouterVisionModel || config.openRouterModel || "qwen/qwen3.8-27b:free";
    this.reasoningModel = config.openRouterReasoningModel || config.openRouterModel || "qwen/qwen3.8-27b:free";
    this.fallbackVisionModels = (config.openRouterFallbackVisionModels || []).filter(m => m && m !== this.visionModel);
    this.siteUrl = config.openRouterSiteUrl || config.appUrl;
    this.siteName = config.openRouterSiteName || "Ghost Desktop Automation";
    this.maxRetries = config.openRouterMaxRetries ?? 1;
    this.timeoutMs = config.openRouterRequestTimeoutMs ?? 60_000;
  }

  public getQuotaManager(): OpenRouterQuotaManager {
    return this.quotaManager;
  }

  /** Test seam: replaces real sleeping in retry paths. */
  public setSleep(fn: (ms: number) => Promise<void>): void {
    this.sleep = fn;
  }

  /**
   * Dispatches one chat completion with bounded retries. Retries cover timeouts, network errors,
   * 5xx and short Retry-After rate limits; authentication, payment, bad-request and long
   * rate-limit responses fail immediately with a typed error.
   */
  private async executeChatCompletion(
    model: string,
    messages: any[],
    options: { maxTokens?: number; temperature?: number } = {}
  ): Promise<CompletionResult> {
    if (!this.apiKey) {
      throw new OpenRouterError(
        "AUTH_ERROR",
        "OpenRouter API key is missing. Set OPENROUTER_API_KEY in environment to run AI analysis.",
        401
      );
    }

    this.quotaManager.checkCostGuard(model);

    const url = `${this.baseUrl}/chat/completions`;
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": this.siteUrl || "http://localhost:5173",
      "X-Title": this.siteName || "Ghost Desktop Automation"
    };

    const body: any = {
      model,
      messages,
      temperature: options.temperature ?? 0.1,
      max_tokens: Math.max(options.maxTokens ?? 8000, 8000),
      reasoning: { effort: "low" }
    };

    const startTime = Date.now();
    const maxAttempts = 1 + Math.max(0, this.maxRetries);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await this.quotaManager.acquireSlotWithWait();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
      let response: Response;
      try {
        logger.info({ model, attempt, maxAttempts }, `[OpenRouter] Dispatching inference request (${model})`);
        response = await this.fetchImpl(url, { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal });
      } catch (err: any) {
        clearTimeout(timeoutId);
        const timedOut = err?.name === "AbortError";
        if (attempt < maxAttempts) {
          this.quotaManager.releaseSlot();
          logger.warn({ err: err?.message, attempt, timedOut }, "[OpenRouter] Request failed before a response; retrying");
          await this.sleep(backoffDelayMs(attempt));
          continue;
        }
        this.quotaManager.recordFailure(timedOut ? 408 : 503, err?.message, { modelScoped: true });
        throw timedOut
          ? new OpenRouterError("TIMEOUT", `OpenRouter request timed out after ${this.timeoutMs}ms`, 408)
          : new OpenRouterError("SERVICE_UNAVAILABLE", `OpenRouter communication failed: ${err?.message}`, 503);
      }
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      if (!response.ok) {
        const status = response.status;
        const errorText = await response.text().catch(() => "");
        const retryAfterMs = parseRetryAfterMs(response.headers?.get?.("retry-after"));
        logger.warn({ status, errorText: errorText.slice(0, 300), duration, model, retryAfterMs }, "[OpenRouter] HTTP error response");

        if (status === 401 || status === 403) {
          this.quotaManager.recordFailure(status, "Authentication failed");
          throw new OpenRouterError(status === 401 ? "AUTH_ERROR" : "ACCESS_DENIED", `OpenRouter auth error: ${errorText}`, status);
        }
        if (status === 402) {
          this.quotaManager.recordFailure(status, "Payment required");
          throw new OpenRouterError("PAYMENT_REQUIRED", `OpenRouter payment required: ${errorText}`, 402);
        }
        if (status === 429) {
          const shortWait = retryAfterMs !== undefined && retryAfterMs <= this.maxRetryAfterWaitMs;
          if (shortWait && attempt < maxAttempts) {
            this.quotaManager.releaseSlot();
            await this.sleep(retryAfterMs! + backoffDelayMs(1, 250, 1000));
            continue;
          }
          this.quotaManager.recordFailure(new OpenRouterError("RATE_LIMITED", `OpenRouter rate limit reached: ${errorText}`, 429));
          if (retryAfterMs) this.quotaManager.applyCooldown(retryAfterMs);
          throw new OpenRouterError("RATE_LIMITED", `OpenRouter rate limit reached: ${errorText}`, 429, { retryAfterMs });
        }
        if (status === 400 || status === 413) {
          this.quotaManager.recordFailure(status, "Invalid request");
          throw new OpenRouterError("INVALID_REQUEST", `OpenRouter bad request: ${errorText}`, status);
        }
        if (status >= 500) {
          if (attempt < maxAttempts) {
            this.quotaManager.releaseSlot();
            await this.sleep(retryAfterMs ?? backoffDelayMs(attempt));
            continue;
          }
          this.quotaManager.recordFailure(status, `Provider 5xx error: ${errorText}`, { modelScoped: true });
          throw new OpenRouterError("PROVIDER_ERROR", `OpenRouter service error (${status}): ${errorText}`, status);
        }
        this.quotaManager.recordFailure(status, errorText);
        throw new OpenRouterError("UNKNOWN_ERROR", `OpenRouter error (${status}): ${errorText}`, status);
      }

      const data: any = await response.json().catch(() => null);
      const choice = data?.choices?.[0];
      const msg = choice?.message;
      const content = (msg?.content && typeof msg.content === "string" && msg.content.trim().length > 0)
        ? msg.content
        : (msg?.reasoning || msg?.reasoning_details?.[0]?.text || "");
      const finishReason = choice?.finish_reason || choice?.native_finish_reason;

      if (!content || typeof content !== "string") {
        this.quotaManager.recordFailure(200, "Empty choice content");
        throw new OpenRouterError("MALFORMED_OUTPUT", "OpenRouter returned empty message content in response.", 200);
      }

      const tokensEstimate = data?.usage?.total_tokens || Math.ceil(content.length / 4);
      this.quotaManager.recordSuccess(tokensEstimate);
      logger.info({ model, duration, tokensEstimate, finishReason }, `[OpenRouter] Successfully received response (${duration}ms)`);
      return { content, model, finishReason };
    }

    throw new OpenRouterError("TIMEOUT", "Max retry attempts exceeded without response");
  }

  /** Vision call with explicitly configured fallback models for provider-side failures only. */
  private async executeVisionCompletion(messages: any[]): Promise<CompletionResult> {
    const models = [this.visionModel, ...this.fallbackVisionModels];
    let lastError: unknown;
    for (const model of models) {
      try {
        return await this.executeChatCompletion(model, messages);
      } catch (err) {
        lastError = err;
        const retryable = err instanceof OpenRouterError && ["PROVIDER_ERROR", "TIMEOUT", "SERVICE_UNAVAILABLE"].includes(err.type);
        if (!retryable) throw err;
        logger.warn({ model, type: (err as OpenRouterError).type }, "[OpenRouter] Vision model failed; trying next configured vision model");
      }
    }
    throw lastError;
  }

  /**
   * OpenRouter Call #1 — Semantic Action Extraction from Evidence Episodes.
   * Each attached image is labelled with its frame id so actions can cite the frames they come from.
   */
  public async extractSemanticActions(packet: SemanticEvidencePacket): Promise<SemanticActionsResult> {
    const condensedEpisodes = packet.episodes.map(ep => ({
      episodeId: ep.episodeId,
      time: `${ep.timestampStart.toFixed(1)}s - ${ep.timestampEnd.toFixed(1)}s`,
      application: ep.application,
      windowTitle: ep.windowTitle,
      frames: [...ep.before.frames, ...ep.after.frames].map(f => f.frameId),
      action: {
        type: ep.action.type,
        target: ep.action.targetText,
        value: ep.action.value,
        source: ep.action.source,
        confidence: ep.action.confidence
      },
      beforeOcr: ep.before.ocr.slice(0, 12).map(o => o.text),
      afterOcr: ep.after.ocr.slice(0, 12).map(o => o.text)
    }));

    const ocrLines = (packet.timedOcr && packet.timedOcr.length)
      ? packet.timedOcr.map(o => `${typeof o.timestamp === "number" ? `[${o.timestamp.toFixed(1)}s]` : "[?]"} ${o.text}`)
      : packet.ocrFacts;
    const preceding = (packet.precedingActions || []).map((a, i) => `${i + 1}. ${a.action}${a.target ? ` "${a.target}"` : ""}${a.value ? ` = "${a.value}"` : ""}`);

    const header = [
      `Task context from the user: ${packet.taskContext || "(none provided)"}`,
      `Active application: ${packet.activeApplication}`,
      packet.segment ? `Segment ${packet.segment.index + 1} of ${packet.segment.total} (${packet.timestamps.start.toFixed(1)}s - ${packet.timestamps.end.toFixed(1)}s).` : "",
      preceding.length ? `Actions already reconstructed from earlier segments (do not repeat them; continue from here):\n${preceding.join("\n")}` : "",
      `OCR text (verbatim; preserve exact URL spelling):\n${ocrLines.join("\n") || "(no OCR text)"}`,
      `Evidence episodes:\n${JSON.stringify(condensedEpisodes, null, 2)}`
    ].filter(Boolean).join("\n\n");

    const userContent: any[] = [{ type: "text", text: header }];

    const framesToAttach: FrameEvidence[] = packet.keyFrames && packet.keyFrames.length
      ? packet.keyFrames
      : packet.episodes.map(ep => ep.after.frames[0] || ep.before.frames[0]).filter((f): f is FrameEvidence => Boolean(f));

    const attached = new Set<string>();
    for (const frame of framesToAttach) {
      if (!frame || attached.has(frame.frameId)) continue;
      // Keep original resolution: address bars and small labels are unreadable in thumbnails.
      let b64 = frame.base64;
      if (!b64 && frame.imagePath && fs.existsSync(frame.imagePath)) {
        try { b64 = fs.readFileSync(frame.imagePath).toString("base64"); } catch { /* Skip unreadable frame. */ }
      }
      if (!b64) continue;
      userContent.push({ type: "text", text: `FRAME ${frame.frameId} @ ${frame.timestamp.toFixed(1)}s` });
      userContent.push({ type: "image_url", image_url: { url: b64.startsWith("data:") ? b64 : `data:image/jpeg;base64,${b64}` } });
      attached.add(frame.frameId);
    }

    const messages = [
      { role: "system", content: SEMANTIC_EXTRACTION_PROMPT },
      { role: "user", content: userContent }
    ];

    const completion = await this.executeVisionCompletion(messages);
    if (completion.finishReason === "length") {
      throw new OpenRouterError(
        "OUTPUT_TRUNCATED",
        `Model output was cut off at the token limit (model ${completion.model}); the action list would be incomplete. Reduce the segment size and retry.`
      );
    }
    return this.parseWithGuardedRepair(completion.content, SemanticActionsResultSchema, "semantic actions");
  }

  /**
   * One syntax-only repair attempt. A repaired result may not contain more actions than the
   * original text did, so the repair cannot introduce steps the vision model never produced.
   */
  private async parseWithGuardedRepair<T extends { semanticActions?: unknown[] }>(raw: string, schema: { parse(v: unknown): T }, label: string): Promise<T> {
    const cleaned = cleanJsonPayload(raw);
    try {
      return schema.parse(JSON.parse(cleaned));
    } catch (parseErr: any) {
      logger.warn({ parseErr: parseErr.message, rawText: raw.slice(0, 200) }, `[OpenRouter] ${label} JSON invalid; attempting syntax-only repair`);
      const maxActions = countActionObjects(cleaned);
      const repaired = await this.executeChatCompletion(this.reasoningModel, [
        { role: "system", content: "Fix only the JSON syntax of the user's text so it parses. Do not add, remove, reorder or rewrite any items or values. Output JSON only, without code fences." },
        { role: "user", content: cleaned }
      ]);
      try {
        const parsed = schema.parse(JSON.parse(cleanJsonPayload(repaired.content)));
        if (Array.isArray(parsed.semanticActions) && parsed.semanticActions.length > maxActions) {
          throw new Error(`repair produced ${parsed.semanticActions.length} actions from text containing ${maxActions}`);
        }
        return parsed;
      } catch (finalErr: any) {
        throw new OpenRouterError("MALFORMED_OUTPUT", `OpenRouter ${label} failed schema validation: ${finalErr.message}`);
      }
    }
  }

  /**
   * OpenRouter Call #2 — Process Compilation & Business Process Intelligence.
   * Synthesizes semantic actions into higher-level business process understanding.
   */
  public async compileProcessUnderstanding(
    semanticActions: SemanticAction[],
    context: ProcessReasoningContext
  ): Promise<ProcessUnderstandingResult> {
    const systemPrompt = `You summarise a demonstrated process from an ordered list of actions that were already extracted from a recording.

Rules:
1. Do not add, remove or reorder actions. Describe only what the listed actions accomplish.
2. Generalise a literal value into a variable only when the actions show it is data that changes between runs; otherwise keep it as a constant.
3. Report a LOOP or CONDITIONAL structure only if the actions show a repetition or an alternative branch.
4. Business rules and exceptions must come from the actions or the user's stated objective. If there are none, return empty lists.
5. If the goal is not evident, leave taskIntent empty.

Return strict JSON only:
{
  "taskIntent": "",
  "applicationEnvironment": "Web Browser | Windows Desktop | Mixed",
  "processStructure": { "type": "LINEAR | LOOP | CONDITIONAL", "stepIndices": [] },
  "variables": [ { "name": "", "type": "string | number | boolean | date", "classification": "CONSTANT | EXAMPLE_VALUE | RUNTIME_VARIABLE | EXTRACTED_VALUE | DERIVED_VALUE", "semanticRole": "", "defaultValue": "" } ],
  "businessRules": [ { "rule": "", "confidence": 0.0, "reasoning": "" } ],
  "expectedOutcomes": [],
  "exceptions": [ { "triggerCondition": "", "fallbackAction": "" } ],
  "confidence": 0.0
}`;

    const userPayload = {
      taskObjective: context.objective || "",
      semanticActions,
      existingVariables: context.variables || [],
      knownUncertainties: context.uncertainties || []
    };

    const completion = await this.executeChatCompletion(this.reasoningModel, [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(userPayload, null, 2) }
    ]);
    if (completion.finishReason === "length") {
      throw new OpenRouterError("OUTPUT_TRUNCATED", `Process summary was cut off at the token limit (model ${completion.model}).`);
    }
    return this.parseWithGuardedRepair(completion.content, ProcessUnderstandingResultSchema as any, "process understanding") as Promise<ProcessUnderstandingResult>;
  }

  /**
   * Optional OpenRouter Call #3 — Workflow Critic (Configurable, disabled by default).
   * A critic that cannot be parsed is reported as not passed; it never passes by default.
   */
  public async critiqueWorkflow(workflow: any, evidence: SemanticEvidencePacket): Promise<CriticResult> {
    if (!this.config.enableWorkflowCritic) {
      return {
        passed: true,
        unsupportedSteps: [],
        hallucinatedVariables: [],
        clutterDetected: [],
        suggestions: []
      };
    }

    const systemPrompt = `You are a strict QA critic validating a compiled automation workflow against ground truth evidence.
Verify:
1. Are there unsupported or hallucinated steps?
2. Did any passive UI clutter slip in (unrelated browser tabs, desktop wallpaper)?
3. Are all variables grounded in evidence?
Return JSON: { "passed": boolean, "unsupportedSteps": [], "hallucinatedVariables": [], "clutterDetected": [], "suggestions": [] }`;

    const completion = await this.executeChatCompletion(this.reasoningModel, [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify({ workflow, packetSummary: evidence.taskContext }, null, 2) }
    ]);

    try {
      return JSON.parse(cleanJsonPayload(completion.content));
    } catch {
      return {
        passed: false,
        unsupportedSteps: [],
        hallucinatedVariables: [],
        clutterDetected: [],
        suggestions: ["Critic response could not be parsed; the workflow was not independently reviewed."]
      };
    }
  }
}
