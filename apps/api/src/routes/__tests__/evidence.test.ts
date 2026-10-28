import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { InMemoryStore } from "../../store.js";
import { loadConfig, type ApiConfig } from "../../config.js";
import { DesktopEvidenceBridge } from "../../services/desktop-evidence-bridge.js";

describe("Evidence Compilation Route", () => {
  let app: any;
  let store: InMemoryStore;

  const mockConfig: ApiConfig = loadConfig({
    PORT: "3000",
    NODE_ENV: "test",
    APP_URL: "http://localhost:3000",
    API_URL: "http://localhost:3000",
    STORAGE_PROVIDER: "memory",
    ALLOW_MEMORY_STORAGE: "true",
    ALLOW_DEV_AUTH: "true",
    DEV_AUTH_ENABLED: "true"
  });

  const tenantA = "00000000-0000-4000-8000-000000000001";
  const tokenTenantA = `dev:user-a:${tenantA}:owner`;

  beforeEach(() => {
    store = new InMemoryStore();
    app = createApp(mockConfig, store);
  });

  it("successfully compiles workflow from non-UUID job ID without UUID syntax error", async () => {
    // 1. Create a ghost worker
    const worker = await store.createGhostWorker({ tenantId: tenantA, userId: "user-a", role: "owner" }, {
      name: "Excel ERP Operator",
      description: "Test worker"
    });

    // 2. Register mock completed analysis job in DesktopEvidenceBridge
    const jobId = "job_1790701109641_n594l9";
    const bridge = DesktopEvidenceBridge.getInstance();
    (bridge as any).jobs.set(jobId, {
      jobId,
      mediaPath: "C:\\Ghost\\synthetic_task.mp4",
      mediaType: "VIDEO",
      tenantId: tenantA,
      status: "COMPLETED",
      progress: 100,
      stage: "COMPLETE",
      startTime: new Date().toISOString(),
      result: {
        mediaId: "00000000-0000-4000-8000-000000000002",
        mediaPath: "C:\\Ghost\\synthetic_task.mp4",
        mediaType: "VIDEO",
        duration_seconds: 45.2,
        frames_analyzed: 14,
        timeline: [],
        semantic_actions: [
          {
            sequence: 1,
            start_timestamp: 4.5,
            action_type: "READ_FIELD",
            application: "Excel",
            target_description: "Amount cell",
            summary: "Read order amount from cell",
            parameters: { field_label: "Amount", selector: "A2" },
            confidence: 0.95,
            provenance: { frame_ids: ["frame_2"], rationale: "Observed cell selection" }
          }
        ],
        process_understanding: {
          task_intent: "Read order amount from an Excel worksheet",
          description: "Read the demonstrated order amount from a spreadsheet",
          applications_involved: ["Excel"],
          outputs: [{ description: "Read order amount" }],
          business_rules: []
        },
        uncertainties: []
      }
    });

    // 3. Post to compile-from-job with string job ID
    const res = await request(app)
      .post(`/api/v1/ghost-workers/${worker.id}/evidence/compile-from-job/${jobId}`)
      .set("Authorization", `Bearer ${tokenTenantA}`);

    expect(res.status).toBe(201);
    expect(res.body.bpsId).toBeDefined();
    expect(res.body.workflowVersionId).toBeDefined();
    expect(res.body.workflow).toBeDefined();

    // Verify worker was updated with READY_FOR_REVIEW and trainingSource
    const updatedWorker = await store.getGhostWorker({ tenantId: tenantA, userId: "user-a", role: "owner" }, worker.id);
    expect(updatedWorker?.status).toBe("READY_FOR_REVIEW");
    expect((updatedWorker?.triggerConfig?.trainingSource as any)?.jobId).toBe(jobId);
  }, 45000);
});
