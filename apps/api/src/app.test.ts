import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createStore, InMemoryStore } from "./store.js";

const auth = { Authorization: "Bearer dev:user-a:tenant-a:owner" };

function createTestApp() {
  return createApp(
    {
      nodeEnv: "test",
      port: 4000,
      appUrl: "http://localhost:5173",
      apiUrl: "http://localhost:4000",
      storageProvider: "memory",
      allowInMemoryStorage: true,
      allowDevAuth: true,
      geminiModel: "test-model",
      geminiBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      geminiApiKey: undefined,
      supabaseUrl: undefined,
      supabaseAnonKey: undefined,
      supabaseServiceRoleKey: undefined,
      browserbaseApiKey: undefined,
      browserbaseProjectId: undefined,
      webhookSigningSecret: undefined,
      encryptionKey: undefined,
      redisUrl: undefined,
      sentryDsn: undefined,
      hitlSessionTimeoutSeconds: 300
    } as any,
    new InMemoryStore()
  );
}

function sampleRecording() {
  return {
    recording_id: "00000000-0000-4000-8000-000000000001",
    started_at: new Date().toISOString(),
    source: "test_harness",
    events: [
      {
        event_id: "00000000-0000-4000-8000-000000000002",
        sequence: 1,
        timestamp: new Date().toISOString(),
        event_type: "click",
        page: { url: "https://example.com/inventory", title: "Inventory" },
        target: {
          tag: "button",
          role: "button",
          accessible_name: "Save",
          selector_candidates: [{ strategy: "css", value: "#save", confidence: 0.9 }],
          attributes: {},
          nearby_context: []
        },
        input: null,
        screenshot_reference: null,
        viewport: { width: 1280, height: 720 },
        browser: { user_agent: "vitest" }
      }
    ],
    metadata: {}
  };
}

describe("api", () => {
  it("requires auth for recording ingestion", async () => {
    const response = await request(createTestApp()).post("/api/v1/recordings").send(sampleRecording());
    expect(response.status).toBe(401);
  });

  it("ingests and compiles a recording into a draft workflow", async () => {
    const app = createTestApp();
    const ingest = await request(app).post("/api/v1/recordings").set(auth).send(sampleRecording());
    expect(ingest.status).toBe(201);

    const compile = await request(app).post("/api/v1/recordings/00000000-0000-4000-8000-000000000001/compile").set(auth);
    expect(compile.status).toBe(410);
  });

  it("reuses the first recording for the same idempotency key", async () => {
    const app = createTestApp();
    const first = await request(app)
      .post("/api/v1/recordings")
      .set(auth)
      .set("idempotency-key", "repeat-001")
      .send(sampleRecording());

    const duplicate = await request(app)
      .post("/api/v1/recordings")
      .set(auth)
      .set("idempotency-key", "repeat-001")
      .send({
        ...sampleRecording(),
        recording_id: "00000000-0000-4000-8000-000000000003"
      });

    expect(first.status).toBe(201);
    expect(duplicate.status).toBe(201);
    expect(duplicate.body.recording_id).toBe(first.body.recording_id);
  });
});
