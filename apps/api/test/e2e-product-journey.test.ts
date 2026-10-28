import { describe, it, expect, beforeEach } from "vitest";
import { createStore, AppStore } from "../src/store.js";
import { analyzeRecording } from "../src/bpi-service.js";
import { WorkflowCompiler } from "../src/compiler.js";
import { loadConfig } from "../src/config.js";
import { AuthContext } from "@ghost/shared-types";

describe("Phase 3 Product Journey", () => {
  let store: AppStore;
  let auth: AuthContext;
  let workerId: string;

  beforeEach(() => {
    store = createStore(loadConfig());
    auth = { tenantId: "tenant_e2e_1", userId: "user_e2e_1", role: "admin" } as any;
  });

  it("completes the full merchant lifecycle (Show -> Review -> Test -> Activate)", async () => {
    // 1. Create Worker
    const worker = await store.createGhostWorker(auth, { name: "E2E Test Worker", description: "Integration test" } as any);
    workerId = worker.id;
    expect(worker.status).toBe("NEW");

    // 2. Show (Upload Recording)
    const mockRecording = {
      recording_id: "rec_e2e_123",
      events: [
        { event_id: "e1", sequence: 1, event_type: "click", page: { url: "https://shopify.com", title: "Test" }, target: { selector_candidates: [{ value: "btn-login" }] } }
      ]
    };
    const recording = await store.createRecording(auth, mockRecording as any);
    await store.updateGhostWorker(auth, workerId, { recordingId: recording.id, status: "ANALYZING" } as any);
    
    const w2 = await store.getGhostWorker(auth, workerId);
    expect(w2?.status).toBe("ANALYZING");

    // 3. Analysis via BPI
    const analysis = await analyzeRecording(loadConfig(), store, auth, workerId, recording.id);
    expect(analysis.bpsId).toBeDefined();
    
    // Check if worker was marked READY_FOR_REVIEW
    const w3 = await store.getGhostWorker(auth, workerId);
    expect(w3?.status).toBe("READY_FOR_REVIEW");

    // 4. Compile (Approve Plan)
    const compiler = new WorkflowCompiler();
    const bps = await store.getBPS(auth, analysis.bpsId);
    const workflow = compiler.compile(bps!.specificationJson, { version: "phase3-e2e" });
    const version = await store.createWorkflowVersion(auth, workflow as any);
    await store.updateGhostWorker(auth, workerId, { workflowId: version.workflowId, activeVersionId: version.id, status: "READY_FOR_APPROVAL" } as any);

    const w4 = await store.getGhostWorker(auth, workerId);
    expect(w4?.status).toBe("READY_FOR_APPROVAL");
    expect(w4?.activeVersionId).toBe(version.id);

    // 5. Activate
    await store.updateGhostWorker(auth, workerId, { status: "ACTIVE" } as any);
    const w5 = await store.getGhostWorker(auth, workerId);
    expect(w5?.status).toBe("ACTIVE");
    
    // 6. Schedule (Stream 4)
    const schedule = await store.createSchedule(auth, { workerId, cronExpression: "0 0 * * *" });
    expect(schedule.id).toBeDefined();
    expect(schedule.workerId).toBe(workerId);
  });
});
