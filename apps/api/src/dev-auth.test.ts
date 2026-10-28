import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { InMemoryStore } from "./store.js";

function createTestApp() {
  return createApp(
    {
      nodeEnv: "development",
      port: 4000,
      appUrl: "http://localhost:5173",
      apiUrl: "http://localhost:4000",
      storageProvider: "memory",
      allowInMemoryStorage: true,
      allowDevAuth: true,
      devAuthEnabled: true,
      devAuthEmail: "admin@ghost.local",
      devAuthPassword: "Ghost@123456",
      devAuthUserId: "00000000-0000-0000-0000-000000000002",
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

describe("development auth", () => {
  it("issues a dev bearer token for the seeded developer account", async () => {
    const app = createTestApp();

    const login = await request(app)
      .post("/api/v1/auth/dev/login")
      .send({ email: "admin@ghost.local", password: "Ghost@123456" });

    expect(login.status).toBe(200);
    expect(login.body.token).toContain("dev:");
    expect(login.body.user.email).toBe("admin@ghost.local");

    const workflows = await request(app)
      .get("/api/v1/workflows")
      .set("Authorization", `Bearer ${login.body.token}`);

    expect(workflows.status).toBe(200);
  });
});
