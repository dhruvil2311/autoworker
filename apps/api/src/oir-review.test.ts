import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { InMemoryStore } from "./store.js";

const auth = { Authorization: "Bearer dev:user-a" };

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

async function createWorker(app: ReturnType<typeof createTestApp>) {
  const response = await request(app)
    .post("/api/v1/ghost-workers")
    .set(auth)
    .send({ name: "Acme Shopify Refund Worker", description: "Process Shopify refund requests safely" });
  expect(response.status).toBe(201);
  return response.body;
}

describe("OIR review API", () => {
  it("creates, retrieves, and approves an evidence-backed OIR draft from SOP, CSV, and API spec", async () => {
    const app = createTestApp();
    const worker = await createWorker(app);

    const sop = await request(app)
      .post(`/api/v1/ghost-workers/${worker.id}/documents`)
      .set(auth)
      .send({
        name: "Refund SOP",
        type: "SOP",
        content: [
          "Procedure",
          "1. Check the Shopify order.",
          "2. Refunds over $500 require manager approval.",
          "3. Notify the customer after refund approval."
        ].join("\n")
      });
    expect(sop.status).toBe(201);

    const csv = await request(app)
      .post(`/api/v1/ghost-workers/${worker.id}/documents`)
      .set(auth)
      .send({
        name: "refunds_august.csv",
        type: "CSV",
        content: "order_id,customer_email,refund_amount,reason\n1001,a@example.com,742.00,damaged"
      });
    expect(csv.status).toBe(201);

    const draft = await request(app)
      .post(`/api/v1/ghost-workers/${worker.id}/oir/draft`)
      .set(auth)
      .send({
        business_goal: "Process Shopify refund requests safely",
        api_spec: {
          method: "GET",
          endpoint: "https://shop.example/admin/api/2026-07/orders/1001.json",
          status_code: 200
        }
      });

    expect(draft.status).toBe(201);
    expect(draft.body.oir_review.status).toBe("DRAFT");
    expect(draft.body.oir_review.report.graphValid).toBe(true);
    expect(draft.body.oir_review.report.evidenceCompleteness).toBe(100);
    expect(draft.body.oir_review.graph.evidenceLinks.length).toBeGreaterThanOrEqual(3);

    const review = await request(app).get(`/api/v1/ghost-workers/${worker.id}/oir`).set(auth);
    expect(review.status).toBe(200);
    expect(review.body.oir_review.graph.nodes.length).toBeGreaterThanOrEqual(3);

    const approval = await request(app).post(`/api/v1/ghost-workers/${worker.id}/oir/approve`).set(auth);
    expect(approval.status).toBe(200);
    expect(approval.body.oir_review.status).toBe("APPROVED");
  });

  it("blocks approval when uploaded policy evidence contradicts itself", async () => {
    const app = createTestApp();
    const worker = await createWorker(app);

    await request(app)
      .post(`/api/v1/ghost-workers/${worker.id}/documents`)
      .set(auth)
      .send({
        name: "Finance Refund SOP",
        type: "SOP",
        content: "1. Check the Shopify order.\n2. Refunds over $500 require manager approval."
      });

    const draft = await request(app)
      .post(`/api/v1/ghost-workers/${worker.id}/oir/draft`)
      .set(auth)
      .send({
        business_goal: "Process Shopify refund requests safely",
        clarifications: [{ question: "What threshold should support use?", answer: "Refunds over $1000 require manager approval." }]
      });

    expect(draft.status).toBe(201);
    expect(draft.body.oir_review.report.contradictions).toHaveLength(1);

    const approval = await request(app).post(`/api/v1/ghost-workers/${worker.id}/oir/approve`).set(auth);
    expect(approval.status).toBe(409);
    expect(approval.body.error.code).toBe("OIR_APPROVAL_BLOCKED");
  });

  it("does not expose drafts for missing workers", async () => {
    const app = createTestApp();
    const response = await request(app)
      .get("/api/v1/ghost-workers/00000000-0000-4000-8000-000000000999/oir")
      .set(auth);

    expect(response.status).toBe(404);
  });
});
