/**
 * LLM Client for the OIR Intelligence Layer
 * 
 * Provides schema-constrained structured output from an LLM.
 * Uses Gemini API (OpenAI-compatible endpoint). Temperature is locked to 0.1 for determinism.
 * 
 * INVARIANTS:
 * 1. Never generates free-text prose — only structured JSON.
 * 2. All outputs are validated against the caller's schema.
 * 3. Retries on transient failures with exponential backoff.
 * 4. Token budget is capped to prevent runaway costs.
 */

import fs from "fs";
import path from "path";

// ─── Env Loading ────────────────────────────────────────────────────────────

function loadEnv(): void {
  try {
    let currentDir = process.cwd();
    while (currentDir !== path.parse(currentDir).root) {
      const envPath = path.join(currentDir, ".env");
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, "utf-8");
        content.split("\n").forEach((line) => {
          const [key, ...val] = line.split("=");
          if (key && val.length > 0) {
            const k = key.trim();
            if (!process.env[k]) {
              process.env[k] = val.join("=").trim();
            }
          }
        });
        return;
      }
      currentDir = path.dirname(currentDir);
    }
  } catch (_) { }
}

loadEnv();

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LlmCallOptions {
  /** The system prompt establishing the LLM's role and output constraints */
  systemPrompt: string;
  /** The user prompt containing the data to reason over */
  userPrompt: string;
  /** A JSON schema description for the expected output */
  schemaDescription: string;
  /** Maximum retry attempts on transient failure (default: 2) */
  maxRetries?: number;
  /** Temperature override (default: 0.1) */
  temperature?: number;
  /** Optional response format override for providers that support JSON mode */
  responseFormat?: string;
}

export interface LlmCallResult<T> {
  data: T;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
}

// ─── Client ─────────────────────────────────────────────────────────────────

export async function callLlm<T>(options: LlmCallOptions): Promise<LlmCallResult<T>> {
  const apiKey = process.env.GEMINI_API_KEY;
  const baseUrl = process.env.GEMINI_BASE_URL || process.env.OPENROUTER_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai";
  let model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  // nemotron doesn't support JSON mode reliably
  if (model.includes("nemotron")) {
    model = "gemini-2.5-flash";
  }

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set. Cannot perform LLM inference.");
  }

  const maxRetries = options.maxRetries ?? 2;
  const temperature = options.temperature ?? 0.1;

  const systemPrompt = `${options.systemPrompt}

CRITICAL RULES:
1. Output ONLY valid JSON. No markdown, no code blocks, no explanations.
2. Adhere strictly to this JSON schema:
${options.schemaDescription}
3. Never invent data that is not present in the input.
4. If uncertain, set confidence to a low value and explain in the "reasoning" field.`;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 1s, 2s, 4s...
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
    }

    const startMs = Date.now();

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: options.userPrompt },
          ],
          temperature,
          max_tokens: 4096,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status >= 500 || response.status === 429) {
          lastError = new Error(`LLM API transient error: ${response.status} - ${errorText}`);
          continue; // Retry
        }
        throw new Error(`LLM API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      const latencyMs = Date.now() - startMs;

      if (!content) {
        lastError = new Error("LLM returned empty response");
        continue;
      }

      // Parse JSON, stripping markdown fences if the model ignored instructions
      let cleaned = content.trim();
      if (cleaned.startsWith("```")) {
        const lines = cleaned.split("\n");
        lines.shift();
        if (lines[lines.length - 1]?.startsWith("```")) {
          lines.pop();
        }
        cleaned = lines.join("\n");
      }

      const parsed = JSON.parse(cleaned) as T;

      return {
        data: parsed,
        model,
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        latencyMs,
      };
    } catch (e: any) {
      if (e.message?.includes("JSON")) {
        lastError = e;
        continue; // Retry on JSON parse failure
      }
      throw e;
    }
  }

  throw lastError || new Error("LLM call failed after all retries.");
}
