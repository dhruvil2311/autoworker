import { afterEach, describe, expect, it, vi } from "vitest";
import { RealSemanticBPIProvider } from "./ai-provider.js";
import type { Observation } from "@ghost/bpi";

describe("RealSemanticBPIProvider (Phase 1C)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("inferBusinessIntent validates JSON schema and returns result", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: "Test Intent",
                confidence: 0.95,
                reasoning: "Looks like a test"
              })
            }
          }
        ]
      })
    }) as typeof fetch;

    const provider = new RealSemanticBPIProvider({
      nodeEnv: "test",
      port: 4000,
      appUrl: "http://localhost:5173",
      apiUrl: "http://localhost:4000",
      geminiApiKey: "test-key",
      geminiModel: "test-model",
      geminiBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      allowDevAuth: true,
      allowInMemoryStorage: true,
      hitlSessionTimeoutSeconds: 300,
      supabaseUrl: undefined,
      supabaseAnonKey: undefined,
      supabaseServiceRoleKey: undefined,
      browserbaseApiKey: undefined,
      browserbaseProjectId: undefined,
      webhookSigningSecret: undefined,
      encryptionKey: undefined,
      redisUrl: undefined,
      sentryDsn: undefined
    } as any);

    const obs: Observation[] = [];
    const result = await provider.inferBusinessIntent(obs);
    expect(result.intent).toBe("Test Intent");
    expect(result.confidence).toBe(0.95);
  });

  it("rejects malformed responses safely via Zod", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                not_intent: "Missing required fields"
              })
            }
          }
        ]
      })
    }) as typeof fetch;

    const provider = new RealSemanticBPIProvider({
      geminiApiKey: "test-key",
      geminiModel: "test-model",
      geminiBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    } as any);

    // Zod throws inside the try/catch loop, then it falls back to the safe return
    const result = await provider.inferBusinessIntent([]);
    expect(result.intent).toBe("Unknown Process");
    expect(result.confidence).toBe(0);
  });

  it("redacts sensitive data from observed website content before sending to LLM", async () => {
    let sentBody: any;
    globalThis.fetch = vi.fn().mockImplementation(async (url, options) => {
      sentBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ intent: "Test", confidence: 0.9, reasoning: "none" }) } }]
        })
      };
    }) as typeof fetch;

    const provider = new RealSemanticBPIProvider({
      geminiApiKey: "test-key",
      geminiModel: "test-model",
      geminiBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    } as any);

    const obs: Observation[] = [
      {
        sequence: 1,
        timestamp: new Date().toISOString(),
        action: "INPUT",
        context: { url: "https://example.com/login", page_title: "Login" },
        value: { raw_value: "my_super_secret_password_123", is_sensitive: true, classification: { value: "USER_INPUT", confidence: 1, classification: "OBSERVED_FACT", evidence: [] } }
      }
    ];

    await provider.inferBusinessIntent(obs);

    const promptText = sentBody.messages[1].content;
    expect(promptText).not.toContain("my_super_secret_password_123");
    expect(promptText).toContain("***REDACTED***");
  });
});
