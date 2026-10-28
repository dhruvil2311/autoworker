import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError, apiRequest, authorizationHeader, currentToken } from "./client.js";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k)
  });
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  store.set("ghost_api_url", "http://api.test");
});

afterEach(() => vi.unstubAllGlobals());

async function failure(path: string, options?: Parameters<typeof apiRequest>[1]): Promise<ApiError> {
  const err = await apiRequest(path, options).then(() => undefined, (e: unknown) => e);
  if (!(err instanceof ApiError)) throw new Error(`expected ApiError, got ${String(err)}`);
  return err;
}

function respond(status: number, body: unknown) {
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "x-request-id": "req-1" }
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("session token", () => {
  it("strips the prefix the classic client stores", () => {
    store.set("ghost_api_token", "Bearer dev:u1:t1:member");
    expect(currentToken()).toBe("dev:u1:t1:member");
    expect(authorizationHeader()).toBe("Bearer dev:u1:t1:member");
  });

  it("adds exactly one prefix to a bare token", () => {
    store.set("ghost_api_token", "dev:u1:t1:owner");
    expect(authorizationHeader()).toBe("Bearer dev:u1:t1:owner");
  });

  it("sends no authorization header when signed out", async () => {
    const fetchMock = respond(200, { ok: true });
    expect(authorizationHeader()).toBeUndefined();
    await apiRequest("/api/v1/me");
    const headers = fetchMock.mock.calls[0]![1].headers as Record<string, string>;
    expect(headers.authorization).toBeUndefined();
  });

  it("never sends a doubled prefix", async () => {
    store.set("ghost_api_token", "Bearer dev:u1:t1:member");
    const fetchMock = respond(200, { ok: true });
    await apiRequest("/api/v1/me");
    const headers = fetchMock.mock.calls[0]![1].headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer dev:u1:t1:member");
  });
});

describe("error handling", () => {
  it("keeps structured error fields", async () => {
    respond(403, { error: { code: "FORBIDDEN", message: "Missing permission", required: "hitl.decide" } });
    const err = await failure("/api/v1/x");
    expect(err.status).toBe(403);
    expect(err.code).toBe("FORBIDDEN");
    expect(err.details).toEqual({ required: "hitl.decide" });
    expect(err.requestId).toBe("req-1");
  });

  it("keeps top-level fields of the flat error shape (compile refusals)", async () => {
    respond(422, { error: "Workflow is not ready", status: "NOT_READY", draft_version_id: "v-1", issues: [{ code: "UNGROUNDED" }] });
    const err = await failure("/api/v1/x");
    expect(err.code).toBe("NOT_READY");
    expect(err.message).toBe("Workflow is not ready");
    expect(err.details.draft_version_id).toBe("v-1");
    expect(err.details.issues).toEqual([{ code: "UNGROUNDED" }]);
  });

  it("signals an expired session on 401", async () => {
    respond(401, { error: "unauthorized" });
    await apiRequest("/api/v1/me").catch(() => undefined);
    expect((window.dispatchEvent as any).mock.calls[0][0].type).toBe("ghost:unauthorized");
  });

  it("rejects responses that break the contract", async () => {
    respond(200, { id: 42 });
    const err = await failure("/api/v1/x", { schema: z.object({ id: z.string() }) });
    expect(err.code).toBe("CONTRACT_MISMATCH");
  });

  it("reports an unreachable server as a network error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const err = await failure("/api/v1/x");
    expect(err.status).toBe(0);
    expect(err.code).toBe("NETWORK");
  });
});
