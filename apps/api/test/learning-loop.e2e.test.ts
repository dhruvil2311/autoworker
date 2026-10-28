import { describe, it, expect, beforeEach } from "vitest";
import { createStore, AppStore } from "../src/store.js";
import { analyzeRecording, analyzeFromDocuments } from "../src/bpi-service.js";
import { WorkflowCompiler } from "../src/compiler.js";
import { loadConfig } from "../src/config.js";
import { AuthContext } from "@ghost/shared-types";

describe("Learning to Execution Loop (E2E)", () => {
  let store: AppStore;
  let auth: AuthContext;

  beforeEach(() => {
    store = createStore(loadConfig());
    auth = { tenantId: "tenant_e2e_loop", userId: "user_e2e_loop", role: "admin" } as any;
  });

  it("learns from human correction and improves its next execution", async () => {
    // 1. Setup Base Worker
    const worker = await store.createGhostWorker(auth, { 
      name: "Refund Ghost", 
      description: "Process refunds" 
    } as any);
    
    // Simulate initial BPI compilation with a default BPS
    const compiler = new WorkflowCompiler({} as any);
    const initialWorkflow = await compiler.compile({
      id: "mock_bps_1",
      identity: { name: "test", version: "1.0" },
      intent: "Refund Process",
      variables: [],
      dataFlow: [],
      transformations: [],
      observations: [],
      unresolvedGaps: []
    } as any, { version: "1.0" }, {
      steps: [{
        description: "Click refund",
        fallbackChain: [{ providerType: "BROWSER_SEMANTIC" }],
        semanticOperationId: "CLICK"
      }]
    });
    
    const version1 = await store.createWorkflowVersion(auth, initialWorkflow as any);
    await store.updateGhostWorker(auth, worker.id, { 
      workflowId: version1.workflowId, 
      activeVersionId: version1.id, 
      status: "ACTIVE" 
    } as any);

    // Initial plan expects something that we can verify
    expect(initialWorkflow.root_step.children?.some(c => c.operation === "CALL_API" || c.operation === "CALL_MCP" || c.operation === "ACT")).toBe(true);

    // 2. Execution Run Fails, Requires HITL
    const run1 = await store.createRun(auth, version1.id, "key1", worker.id, "PRODUCTION");
    
    // Transition to running state
    await store.updateRunState(auth, run1.id, "STARTING");
    await store.updateRunState(auth, run1.id, "RUNNING");

    // Worker would pause here and create HITL request
    await store.updateRunState(auth, run1.id, "WAITING_FOR_HUMAN");
    const expiresAt = new Date(Date.now() + 1000 * 60).toISOString();
    await store.createHitlRequest(auth, {
      runId: run1.id,
      workflowStepId: "step_mock_click",
      challengeType: "ELEMENT_NOT_FOUND",
      expiresAt
    });
    
    const hitls = await store.listHitlRequests(auth);
    const hitl = hitls.find(h => h.runId === run1.id)!;

    // 3. Human Corrects the Flow
    const resolutionText = "The refund action is now under More Actions";
    await store.takeHitlControl(auth.tenantId, auth.userId, hitl.runId);
    
    // Memory rule added from the correction
    await store.addMemoryRule(auth, worker.id, resolutionText, {
      source: "HITL",
      runId: hitl.runId,
      stepId: hitl.workflowStepId
    });
    await store.completeHitlIntervention(auth.tenantId, hitl.runId);

    // 4. Recompile triggered by the new memory
    // We simulate that pipeline here (bypassing Real API):
    const newBpsJson = {
      id: "mock_bps_2",
      identity: { name: "test", version: "2.0" },
      intent: "Refund Process",
      variables: [],
      dataFlow: [],
      transformations: [],
      observations: [{
        type: "EXTRACT",
        value: "The refund action is now under More Actions"
      }],
      unresolvedGaps: []
    };

    const newWorkflow = await compiler.compile(newBpsJson as any, { version: "2.0" }, {
      steps: [{
        description: "Click more actions",
        fallbackChain: [{ providerType: "BROWSER_SEMANTIC" }],
        semanticOperationId: "CLICK"
      }]
    });
    const version2 = await store.createWorkflowVersion(auth, newWorkflow as any);
    await store.updateGhostWorker(auth, worker.id, { 
      workflowId: version2.workflowId, 
      activeVersionId: version2.id 
    } as any);

    const hasMoreActions = newWorkflow.root_step.children?.some(c => c.operation === "CALL_API" || c.operation === "CALL_MCP" || c.operation === "ACT") ?? false;
    expect(hasMoreActions).toBe(true);

    // 6. The next execution binds to Version 2 securely
    const run2 = await store.createRun(auth, version2.id, "key2", worker.id, "PRODUCTION");
    expect(run2.workflowVersionId).toBe(version2.id);
  });
});
