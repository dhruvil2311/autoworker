import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { InMemoryStore } from "../store.js";

const authHeader = { Authorization: "Bearer dev:user-a:tenant-a:owner" };

function createTestApp() {
  const store = new InMemoryStore();
  const config = {
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
    hitlSessionTimeoutSeconds: 300
  } as any;
  const app = createApp(config, store);
  return { app, store };
}

describe("Document Deletion & Procedural Memory Purge", () => {
  it("purges workflow steps and BPS when the governing document is deleted", async () => {
    const { app, store } = createTestApp();
    const auth = { userId: "user-a", tenantId: "tenant-a", role: "owner" as const };

    // 1. Create worker
    const worker = await store.createGhostWorker(auth, { name: "Invoice SOP Worker" });

    // 2. Upload an SOP document
    const docRes = await request(app)
      .post(`/api/v1/ghost-workers/${worker.id}/documents`)
      .set(authHeader)
      .send({
        name: "Invoice_Processing_SOP.docx",
        type: "TXT",
        content: "1. Navigate to accounting portal\n2. Enter invoice amount\n3. Click approve"
      });
    expect(docRes.status).toBe(201);
    const docId = docRes.body.document.id;

    // Simulate analysis/compilation having set BPS and activeVersionId
    const wfVersion = await store.createWorkflowVersion(auth, {
      name: "Invoice Workflow",
      root_step: {
        children: [
          { id: "s1", description: "Open accounting portal", operation: "NAVIGATE" },
          { id: "s2", description: "Enter invoice amount", operation: "INPUT" }
        ]
      }
    } as any);

    const bps = await store.createBPS(auth, {
      workerId: worker.id,
      status: "READY_FOR_REVIEW",
      specificationJson: {
        steps: [{ number: 1, description: "Open accounting portal" }],
        businessRules: [{ id: "r1", statement: "Must match PO" }]
      },
      generalizationJson: {},
      gapsJson: []
    });

    await store.updateGhostWorker(auth, worker.id, {
      workflowId: wfVersion.workflowId,
      activeVersionId: wfVersion.id,
      bpsId: bps.id,
      status: "READY_FOR_REVIEW",
      trainingSource: {
        type: "DOCUMENT_SOP",
        name: "Invoice_Processing_SOP.docx"
      }
    } as any);

    // Verify worker has activeVersionId and plan before deletion
    const beforePlan = await request(app)
      .get(`/api/v1/ghost-workers/${worker.id}/plan`)
      .set(authHeader);
    expect(beforePlan.status).toBe(200);
    expect(beforePlan.body.planObj.steps.length).toBeGreaterThan(0);

    // 3. Delete the document
    const delRes = await request(app)
      .delete(`/api/v1/ghost-workers/${worker.id}/documents/${docId}`)
      .set(authHeader);
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    // 4. Verify worker state after deletion
    const afterWorker = await store.getGhostWorker(auth, worker.id);
    expect(afterWorker?.activeVersionId).toBeUndefined();
    expect(afterWorker?.workflowId).toBeUndefined();
    expect(afterWorker?.bpsId).toBeUndefined();
    expect(afterWorker?.trainingSource).toBeUndefined();
    expect(afterWorker?.status).toBe("NEW");

    // 5. Verify documents list is empty
    const docsAfter = await request(app)
      .get(`/api/v1/ghost-workers/${worker.id}/documents`)
      .set(authHeader);
    expect(docsAfter.body.documents.length).toBe(0);

    // 6. Verify plan is gone (no ghost steps lingering)
    const afterPlan = await request(app)
      .get(`/api/v1/ghost-workers/${worker.id}/plan`)
      .set(authHeader);
    expect(afterPlan.status).toBe(404);
  });

  it("preserves video-trained workflow steps when an auxiliary document is deleted", async () => {
    const { app, store } = createTestApp();
    const auth = { userId: "user-a", tenantId: "tenant-a", role: "owner" as const };

    // 1. Create worker trained from video
    const worker = await store.createGhostWorker(auth, { name: "Video Grounded Worker" });

    const wfVersion = await store.createWorkflowVersion(auth, {
      name: "Video Workflow",
      compiler: {
        source_type: "VIDEO_RECORDING",
        source_media_name: "demo_recording.mp4",
        action_count: 4
      },
      root_step: {
        children: [
          { id: "s1", description: "Open website", operation: "NAVIGATE" },
          { id: "s2", description: "Enter username", operation: "INPUT" }
        ]
      }
    } as any);

    await store.updateGhostWorker(auth, worker.id, {
      workflowId: wfVersion.workflowId,
      activeVersionId: wfVersion.id,
      status: "READY_FOR_REVIEW",
      trainingSource: {
        type: "VIDEO_RECORDING",
        name: "demo_recording.mp4",
        actionCount: 4
      }
    } as any);

    // Register video document in store
    await store.createDocument(auth, {
      workerId: worker.id,
      type: "VIDEO",
      name: "demo_recording.mp4",
      parsedJson: { actionCount: 4 }
    });

    // 2. Upload an auxiliary document
    const docRes = await request(app)
      .post(`/api/v1/ghost-workers/${worker.id}/documents`)
      .set(authHeader)
      .send({
        name: "Supplemental_Rules.docx",
        type: "TXT",
        content: "Rule 1: Always check totals"
      });
    const docId = docRes.body.document.id;

    // 3. Delete the auxiliary document
    const delRes = await request(app)
      .delete(`/api/v1/ghost-workers/${worker.id}/documents/${docId}`)
      .set(authHeader);
    expect(delRes.status).toBe(200);

    // 4. Verify video workflow steps are STILL INTACT!
    const afterWorker = await store.getGhostWorker(auth, worker.id);
    expect(afterWorker?.activeVersionId).toBe(wfVersion.id);
    expect(afterWorker?.trainingSource?.type).toBe("VIDEO_RECORDING");

    const planAfter = await request(app)
      .get(`/api/v1/ghost-workers/${worker.id}/plan`)
      .set(authHeader);
    expect(planAfter.status).toBe(200);
    expect(planAfter.body.planObj.steps.length).toBe(2);
  });
});
