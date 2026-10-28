import * as fs from "fs";
import * as path from "path";
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

export class OpenRouterProvider implements VisionReasoningProvider {
  private quotaManager: OpenRouterQuotaManager;
  private apiKey: string;
  private baseUrl: string;
  private visionModel: string;
  private reasoningModel: string;
  private siteUrl?: string;
  private siteName?: string;
  private maxRetries: number;
  private timeoutMs: number = 45_000;

  constructor(private config: ApiConfig) {
    this.quotaManager = OpenRouterQuotaManager.getInstance({
      allowPaidModels: config.allowPaidModels,
      maxConcurrentRequests: config.openRouterMaxConcurrentRequests,
      maxRetries: config.openRouterMaxRetries
    });
    this.apiKey = config.openRouterApiKey || "";
    this.baseUrl = (config.openRouterBaseUrl || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
    this.visionModel = config.openRouterVisionModel || config.openRouterModel || "qwen/qwen3.8-27b:free";
    this.reasoningModel = config.openRouterReasoningModel || config.openRouterModel || "qwen/qwen3.8-27b:free";
    this.siteUrl = config.openRouterSiteUrl || config.appUrl;
    this.siteName = config.openRouterSiteName || "Ghost Desktop Automation";
    this.maxRetries = config.openRouterMaxRetries ?? 1;
  }

  public getQuotaManager(): OpenRouterQuotaManager {
    return this.quotaManager;
  }

  /**
   * Dispatches a chat completion request to OpenRouter with strict quota, cost-guard, and error handling.
   */
  private async executeChatCompletion(
    model: string,
    messages: any[],
    options: { maxTokens?: number; temperature?: number } = {}
  ): Promise<string> {
    if (!this.apiKey) {
      throw new OpenRouterError(
        "AUTH_ERROR",
        "OpenRouter API key is missing. Set OPENROUTER_API_KEY in environment to run AI analysis.",
        401
      );
    }

    // 1. Enforce Cost Guard
    this.quotaManager.checkCostGuard(model);

    // 2. Enforce Quota & Concurrency
    this.quotaManager.acquireSlot();

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
    let attempt = 0;
    const maxAttempts = 1 + Math.max(0, this.maxRetries);

    while (attempt < maxAttempts) {
      attempt++;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

        logger.info(
          { model, attempt, maxAttempts, url },
          `[OpenRouter] Dispatching inference request (${model})`
        );

        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;

        if (!response.ok) {
          const status = response.status;
          const errorText = await response.text().catch(() => "");
          logger.warn({ status, errorText, duration, model }, "[OpenRouter] HTTP error response");

          if (status === 401) {
            this.quotaManager.recordFailure(status, "Authentication failed");
            throw new OpenRouterError("AUTH_ERROR", `OpenRouter auth error: ${errorText}`, 401);
          }
          if (status === 402) {
            this.quotaManager.recordFailure(status, "Payment required");
            throw new OpenRouterError("PAYMENT_REQUIRED", `OpenRouter payment required: ${errorText}`, 402);
          }
          if (status === 429) {
            this.quotaManager.recordFailure(status, "Rate limit reached");
            // Do not retry 429 in a tight loop
            throw new OpenRouterError("RATE_LIMITED", `OpenRouter rate limit reached: ${errorText}`, 429);
          }
          if (status === 400) {
            this.quotaManager.recordFailure(status, "Invalid request");
            throw new OpenRouterError("INVALID_REQUEST", `OpenRouter bad request: ${errorText}`, 400);
          }
          if (status >= 500) {
            this.quotaManager.recordFailure(status, `Provider 5xx error: ${errorText}`);
            if (attempt < maxAttempts) {
              await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
              continue;
            }
            throw new OpenRouterError("PROVIDER_ERROR", `OpenRouter service error (${status}): ${errorText}`, status);
          }

          this.quotaManager.recordFailure(status, errorText);
          throw new OpenRouterError("UNKNOWN_ERROR", `OpenRouter error (${status}): ${errorText}`, status);
        }

        const data: any = await response.json();
        const msg = data?.choices?.[0]?.message;
        const content = (msg?.content && typeof msg.content === "string" && msg.content.trim().length > 0)
          ? msg.content
          : (msg?.reasoning || msg?.reasoning_details?.[0]?.text || "");

        if (!content || typeof content !== "string") {
          this.quotaManager.recordFailure(200, "Empty choice content");
          throw new OpenRouterError("MALFORMED_OUTPUT", "OpenRouter returned empty message content in response.", 200);
        }

        const tokensEstimate = data?.usage?.total_tokens || Math.ceil(content.length / 4);
        this.quotaManager.recordSuccess(tokensEstimate);

        logger.info(
          { model, duration, tokensEstimate },
          `[OpenRouter] Successfully received response (${duration}ms)`
        );

        return content;
      } catch (err: any) {
        if (err.name === "AbortError") {
          this.quotaManager.recordFailure(408, "Request timeout");
          throw new OpenRouterError("TIMEOUT", `OpenRouter request timed out after ${this.timeoutMs}ms`, 408);
        }
        if (err instanceof OpenRouterError) {
          throw err;
        }
        if (attempt < maxAttempts) {
          logger.warn({ err: err.message, attempt }, "[OpenRouter] Retrying request after error");
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
          continue;
        }
        this.quotaManager.recordFailure(500, err.message);
        throw new OpenRouterError("UNKNOWN_ERROR", `OpenRouter communication failed: ${err.message}`);
      }
    }

    throw new OpenRouterError("TIMEOUT", "Max retry attempts exceeded without response");
  }

  /**
   * OpenRouter Call #1 — Semantic Action Extraction from Evidence Episodes.
   * Concurrently compresses evidence and outputs structured JSON only.
   */
  public async extractSemanticActions(packet: SemanticEvidencePacket): Promise<SemanticActionsResult> {
    const systemPrompt = `You are an expert computer automation engineer reconstructing the complete task workflow performed by a user from evidence episodes and sequential video frames.

CRITICAL TASK RULES:
1. Examine the attached chronological keyframes and episodes showing the user demonstration.
2. Reconstruct the complete, ordered sequence of interactions required to reproduce the task:
   - Initial navigation (e.g. NAVIGATE to the web application URL).
   - Form inputs (e.g. TYPE or ENTER username, password, first name, last name, postal code). Always include the exact text value typed in arguments.value.
   - Button and link clicks (e.g. CLICK login button, product title link, add to cart, shopping cart link, checkout button, continue button). Include the target element name/id in arguments.target.
   - Data verification / extraction (e.g. EXTRACT or VERIFY the summary total or completion state).
3. Do not omit intermediate steps (such as adding an item to the cart, clicking into the cart, or clicking checkout).
4. Ignore passive OS chrome (taskbars, minimize buttons, system tray).
5. Output cleanly structured JSON only:
{
  "semanticActions": [
    {
      "action": "ACTION_NAME",
      "arguments": { "target": "element_name", "value": "text_if_typing", "url": "url_if_navigating" },
      "application": "Browser",
      "evidenceEpisodeIds": ["ep_01"],
      "confidence": 0.95,
      "evidenceStatus": "OBSERVED",
      "rationale": "Clear description of action and why it occurred"
    }
  ],
  "discardedNoise": [
    "description of ignored noise"
  ]
}`;

    // Package episodes concisely
    const condensedEpisodes = packet.episodes.map(ep => ({
      episodeId: ep.episodeId,
      time: `${ep.timestampStart.toFixed(1)}s - ${ep.timestampEnd.toFixed(1)}s`,
      application: ep.application,
      windowTitle: ep.windowTitle,
      action: {
        type: ep.action.type,
        target: ep.action.targetText,
        value: ep.action.value,
        source: ep.action.source,
        confidence: ep.action.confidence
      },
      beforeOcrSummary: ep.before.ocr.slice(0, 8).map(o => o.text),
      afterOcrSummary: ep.after.ocr.slice(0, 8).map(o => o.text)
    }));

    const userContent: any[] = [
      {
        type: "text",
        text: `Task Context: ${packet.taskContext || "Desktop/Browser Demonstration"}\nActive Application: ${packet.activeApplication}\nEvidence Episodes:\n${JSON.stringify(condensedEpisodes, null, 2)}`
      }
    ];

    // Select up to 6 keyframes across the recording to ensure fast inference and prevent massive payloads
    const maxImages = 6;
    const framesToAttach: FrameEvidence[] = [];

    if (packet.keyFrames && packet.keyFrames.length > 0) {
      if (packet.keyFrames.length <= maxImages) {
        framesToAttach.push(...packet.keyFrames);
      } else {
        const step = (packet.keyFrames.length - 1) / (maxImages - 1);
        for (let i = 0; i < maxImages; i++) {
          const idx = Math.min(Math.round(i * step), packet.keyFrames.length - 1);
          const kf = packet.keyFrames[idx];
          if (kf) framesToAttach.push(kf);
        }
      }
    } else {
      for (const ep of packet.episodes) {
        const frame = ep.after.frames[0] || ep.before.frames[0];
        if (frame) framesToAttach.push(frame);
      }
    }

    const attachedFrameIds = new Set<string>();
    for (const frame of framesToAttach) {
      if (!frame || attachedFrameIds.has(frame.frameId)) continue;

      let b64 = frame.base64;
      // Prefer compressed thumbnail if available to keep network payload ultra-lean (<150KB) and fast
      if (frame.imagePath) {
        const thumbCandidate1 = frame.imagePath.replace(/[\\\/]frames[\\\/]/, "/thumbnails/").replace(/\.jpg$/, "_thumb.jpg");
        const thumbCandidate2 = path.join(path.dirname(frame.imagePath), "..", "thumbnails", `${frame.frameId}_thumb.jpg`);
        const thumbPath = fs.existsSync(thumbCandidate1) ? thumbCandidate1 : (fs.existsSync(thumbCandidate2) ? thumbCandidate2 : null);
        if (thumbPath) {
          try {
            b64 = fs.readFileSync(thumbPath).toString("base64");
          } catch (_) {}
        }
      }

      if (b64) {
        userContent.push({
          type: "image_url",
          image_url: {
            url: b64.startsWith("data:") ? b64 : `data:image/jpeg;base64,${b64}`
          }
        });
        attachedFrameIds.add(frame.frameId);
      }
    }

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent }
    ];

    const rawJson = await this.executeChatCompletion(this.visionModel, messages);
    const cleaned = cleanJsonPayload(rawJson);

    try {
      const parsed = JSON.parse(cleaned);
      return SemanticActionsResultSchema.parse(parsed);
    } catch (parseErr: any) {
      logger.warn({ parseErr: parseErr.message, rawText: rawJson.slice(0, 200) }, "[OpenRouter] JSON parse failed, attempting controlled repair");
      // Controlled single repair attempt
      const repairPrompt = `The previous JSON response contained syntax errors or schema violations. Fix and output valid JSON conforming exactly to the requested schema. Do not include markdown code fences or conversational text.`;
      const repaired = await this.executeChatCompletion(this.reasoningModel, [
        { role: "system", content: repairPrompt },
        { role: "user", content: `Broken JSON:\n${cleaned}` }
      ]);
      const repairedClean = cleanJsonPayload(repaired);
      try {
        const parsedRepaired = JSON.parse(repairedClean);
        return SemanticActionsResultSchema.parse(parsedRepaired);
      } catch (finalErr: any) {
        throw new OpenRouterError("MALFORMED_OUTPUT", `OpenRouter output failed schema validation: ${finalErr.message}`);
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
    const systemPrompt = `You are an expert business process architect compiling higher-level process intelligence from validated semantic actions.

COMPILATION INSTRUCTIONS:
1. Keep ONLY task-relevant actions.
2. Remove:
   - Browser chrome interactions
   - Inactive tabs
   - Redundant clicks or micro-adjustments
   - Duplicate waits
3. Generalize literal values into reusable variables where evidence supports it (e.g., turn specific item name into product variable, specific credentials into auth variables).
4. Identify process structure:
   - LINEAR: Standard sequence
   - LOOP: Repeated operations over datasets
   - CONDITIONAL: Alternate branches based on state
5. Extract business rules and exception handling:
   - Identify trigger conditions (e.g. "If redirected to login due to unauthorized session")
   - Identify fallback actions (e.g. "Re-authenticate using standard credentials")
6. Mark uncertainty explicitly.

OUTPUT FORMAT:
Return strict, cleanly structured JSON only:
{
  "taskIntent": "Concise description of the overall business process being performed",
  "applicationEnvironment": "Web Browser | Windows Desktop | Mixed",
  "processStructure": {
    "type": "LINEAR | LOOP | CONDITIONAL",
    "stepIndices": [0, 1, 2, 3]
  },
  "variables": [
    {
      "name": "variable_name",
      "type": "string | number | boolean | date",
      "classification": "CONSTANT | EXAMPLE_VALUE | RUNTIME_VARIABLE | EXTRACTED_VALUE | DERIVED_VALUE",
      "semanticRole": "credential | order_id | search_query | etc.",
      "defaultValue": "example string"
    }
  ],
  "businessRules": [
    {
      "rule": "Rule description",
      "confidence": 0.95,
      "reasoning": "Reason for rule"
    }
  ],
  "expectedOutcomes": [
    "What the completed state should verify"
  ],
  "exceptions": [
    {
      "triggerCondition": "Condition that causes a branch or failure",
      "fallbackAction": "Exact recovery step"
    }
  ],
  "confidence": 0.95
}`;

    const userPayload = {
      taskObjective: context.objective || "Reconstruct demonstrated business workflow",
      semanticActions,
      existingVariables: context.variables || [],
      knownUncertainties: context.uncertainties || []
    };

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(userPayload, null, 2) }
    ];

    const rawJson = await this.executeChatCompletion(this.reasoningModel, messages);
    const cleaned = cleanJsonPayload(rawJson);

    try {
      const parsed = JSON.parse(cleaned);
      return ProcessUnderstandingResultSchema.parse(parsed);
    } catch (parseErr: any) {
      logger.warn({ parseErr: parseErr.message }, "[OpenRouter] Process JSON parse failed, attempting controlled repair");
      const repairPrompt = `Fix and output valid JSON conforming exactly to the ProcessUnderstandingResult schema. Return strict JSON only.`;
      const repaired = await this.executeChatCompletion(this.reasoningModel, [
        { role: "system", content: repairPrompt },
        { role: "user", content: `Broken JSON:\n${cleaned}` }
      ]);
      const repairedClean = cleanJsonPayload(repaired);
      try {
        const parsedRepaired = JSON.parse(repairedClean);
        return ProcessUnderstandingResultSchema.parse(parsedRepaired);
      } catch (finalErr: any) {
        throw new OpenRouterError("MALFORMED_OUTPUT", `OpenRouter process compilation failed validation: ${finalErr.message}`);
      }
    }
  }

  /**
   * Optional OpenRouter Call #3 — Workflow Critic (Configurable, disabled by default).
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

    const raw = await this.executeChatCompletion(this.reasoningModel, [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify({ workflow, packetSummary: evidence.taskContext }, null, 2) }
    ]);

    try {
      return JSON.parse(cleanJsonPayload(raw));
    } catch {
      return {
        passed: true,
        unsupportedSteps: [],
        hallucinatedVariables: [],
        clutterDetected: [],
        suggestions: []
      };
    }
  }
}
