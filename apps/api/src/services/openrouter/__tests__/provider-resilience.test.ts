/**
 * Test E (LLM provider layer) — rate limits, Retry-After, 5xx retries, timeouts, truncation,
 * guarded JSON repair, configured fallback models, and the evidence-grounded prompt.
 *
 * MOCKED: the HTTP transport is a scripted fake fetch; no request leaves the machine.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { OpenRouterProvider, parseRetryAfterMs, backoffDelayMs } from "../openrouter-provider.js";
import { OpenRouterQuotaManager } from "../quota-manager.js";
import { OpenRouterError, type SemanticEvidencePacket } from "../types.js";
import { loadConfig } from "../../../config.js";

type Scripted = { status: number; body?: any; headers?: Record<string, string>; throws?: Error };

function fakeFetch(script: Scripted[], seen: any[] = []): typeof fetch {
  let i = 0;
  return (async (_url: any, init: any) => {
    seen.push({ body: JSON.parse(init.body) });
    const next = script[Math.min(i++, script.length - 1)]!;
    if (next.throws) throw next.throws;
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      headers: { get: (k: string) => next.headers?.[k.toLowerCase()] ?? null },
      text: async () => JSON.stringify(next.body ?? {}),
      json: async () => next.body
    } as any;
  }) as any;
}

const completion = (content: unknown, finish = "stop") => ({
  choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) }, finish_reason: finish }],
  usage: { total_tokens: 10 }
});

const packet: SemanticEvidencePacket = {
  packetId: "p1",
  taskContext: "Restock an item",
  activeApplication: "Browser",
  episodes: [{
    episodeId: "ep_01", timestampStart: 1, timestampEnd: 2, application: "Browser",
    before: { frames: [], ocr: [] }, action: { type: "CLICK", targetText: "Restock", source: "cursor-analysis", confidence: 0.9 }, after: { frames: [], ocr: [] }
  }],
  ocrFacts: ["inventory.acme.test/items"],
  confidence: 0.9,
  timestamps: { start: 0, end: 3 },
  keyFrames: [{ frameId: "frame_000003", timestamp: 1.5, base64: Buffer.from("img").toString("base64") }]
};

const validActions = {
  semanticActions: [{ action: "CLICK", arguments: { target: "Restock" }, application: "Browser", evidenceEpisodeIds: ["ep_01"], confidence: 0.9, evidenceStatus: "OBSERVED" }],
  discardedNoise: [], unresolved: []
};

function provider(script: Scripted[], env: Record<string, string> = {}, seen: any[] = []) {
  const config = loadConfig({
    NODE_ENV: "test", STORAGE_PROVIDER: "memory", ALLOW_MEMORY_STORAGE: "true",
    OPENROUTER_API_KEY: "test-key", OPENROUTER_VISION_MODEL: "vendor/vision:free", OPENROUTER_REASONING_MODEL: "vendor/text:free",
    OPENROUTER_MAX_RETRIES: "2", ...env
  });
  const p = new OpenRouterProvider(config, fakeFetch(script, seen));
  const sleeps: number[] = [];
  p.setSleep(async ms => { sleeps.push(ms); });
  return { p, sleeps };
}

describe("Test E — LLM provider resilience", () => {
  beforeEach(() => OpenRouterQuotaManager.getInstance().resetForTesting());

  it("parses Retry-After seconds and HTTP dates; backoff is bounded with jitter", () => {
    expect(parseRetryAfterMs("2")).toBe(2000);
    expect(parseRetryAfterMs(new Date(Date.now() + 5000).toUTCString(), Date.now())).toBeGreaterThan(3000);
    expect(parseRetryAfterMs(undefined)).toBeUndefined();
    for (let a = 1; a < 10; a++) expect(backoffDelayMs(a)).toBeLessThanOrEqual(15_000);
    expect(backoffDelayMs(3, 1000, 15_000, () => 0)).toBe(2000);
  });

  it("honours a short Retry-After on 429 and then succeeds", async () => {
    const { p, sleeps } = provider([
      { status: 429, body: { error: "slow down" }, headers: { "retry-after": "1" } },
      { status: 200, body: completion(validActions) }
    ]);
    const result = await p.extractSemanticActions(packet);
    expect(result.semanticActions).toHaveLength(1);
    expect(sleeps[0]).toBeGreaterThanOrEqual(1000);
  });

  it("fails fast with RATE_LIMITED and opens a cooldown when Retry-After is long", async () => {
    const { p } = provider([{ status: 429, body: { error: "quota" }, headers: { "retry-after": "3600" } }]);
    const err = await p.extractSemanticActions(packet).catch(e => e);
    expect(err).toBeInstanceOf(OpenRouterError);
    expect(err.type).toBe("RATE_LIMITED");
    expect(err.details.retryAfterMs).toBe(3_600_000);
    expect(OpenRouterQuotaManager.getInstance().isCircuitOpen()).toBe(true);
  });

  it("retries 5xx with backoff and gives up after the configured attempts", async () => {
    const ok = provider([{ status: 503 }, { status: 200, body: completion(validActions) }]);
    expect((await ok.p.extractSemanticActions(packet)).semanticActions).toHaveLength(1);
    expect(ok.sleeps).toHaveLength(1);

    OpenRouterQuotaManager.getInstance().resetForTesting();
    const bad = provider([{ status: 502 }, { status: 502 }, { status: 502 }]);
    const err = await bad.p.extractSemanticActions(packet).catch(e => e);
    expect(err.type).toBe("PROVIDER_ERROR");
  });

  it("reports network failures and timeouts as typed, retryable errors", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    const { p } = provider([{ status: 0, throws: abort }, { status: 0, throws: abort }, { status: 0, throws: abort }]);
    const err = await p.extractSemanticActions(packet).catch(e => e);
    expect(err.type).toBe("TIMEOUT");
  });

  it("rejects output cut off at the token limit instead of returning a partial action list", async () => {
    const { p } = provider([{ status: 200, body: completion(validActions, "length") }]);
    const err = await p.extractSemanticActions(packet).catch(e => e);
    expect(err.type).toBe("OUTPUT_TRUNCATED");
  });

  it("a JSON repair may fix syntax but may not add actions", async () => {
    const broken = '{"semanticActions":[{"action":"CLICK","arguments":{"target":"Restock"},"evidenceEpisodeIds":["ep_01"]}'; // missing brackets
    const padded = { ...validActions, semanticActions: [...validActions.semanticActions, { action: "CLICK", arguments: { target: "Invented" } }] };
    const { p } = provider([{ status: 200, body: completion(broken) }, { status: 200, body: completion(padded) }]);
    const err = await p.extractSemanticActions(packet).catch(e => e);
    expect(err.type).toBe("MALFORMED_OUTPUT");
    expect(err.message).toMatch(/repair produced 2 actions/);
  });

  it("uses an explicitly configured fallback vision model for provider failures only", async () => {
    const seen: any[] = [];
    const { p } = provider(
      [{ status: 500 }, { status: 500 }, { status: 500 }, { status: 200, body: completion(validActions) }],
      { OPENROUTER_FALLBACK_VISION_MODELS: "other/vision:free" },
      seen
    );
    const result = await p.extractSemanticActions(packet);
    expect(result.semanticActions).toHaveLength(1);
    expect(seen.at(-1).body.model).toBe("other/vision:free");

    OpenRouterQuotaManager.getInstance().resetForTesting();
    const seen2: any[] = [];
    const limited = provider([{ status: 429, body: { error: "daily limit exceeded" } }], { OPENROUTER_FALLBACK_VISION_MODELS: "other/vision:free" }, seen2);
    await limited.p.extractSemanticActions(packet).catch(() => undefined);
    expect(seen2.every(r => r.body.model === "vendor/vision:free")).toBe(true);
  });

  it("sends a neutral, evidence-citing prompt with every image labelled by frame id", async () => {
    const seen: any[] = [];
    const { p } = provider([{ status: 200, body: completion(validActions) }], {}, seen);
    await p.extractSemanticActions(packet);
    const [system, user] = seen[0].body.messages;
    expect(system.content).not.toMatch(/sauce|backpack|add to cart|postal code|checkout/i);
    expect(system.content).toMatch(/cite its evidence/);
    const labels = user.content.filter((c: any) => c.type === "text" && c.text.startsWith("FRAME "));
    expect(labels.map((l: any) => l.text)).toEqual(["FRAME frame_000003 @ 1.5s"]);
    expect(user.content.filter((c: any) => c.type === "image_url")).toHaveLength(1);
  });
});
