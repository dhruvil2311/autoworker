import { describe, expect, it } from "vitest";
import { WorkflowRuntime } from "../runtime.js";
import { ExecutionPlanner } from "../planner.js";
import { DataExecutor, ApiExecutor, HumanExecutor, BrowserDeterministicExecutor, BrowserSemanticExecutor } from "../executors/index.js";
import type { WorkflowV2 } from "@ghost/workflow-schema";
import type { ExecutionPersistence } from "../runtime.js";

const mockPersistence = (): ExecutionPersistence => {
  const steps: any[] = [];
  let runState = "QUEUED";
  let checkpoint: any = null;

  return {
    async recordStepStarted(stepId) { steps.push({ id: stepId, state: "RUNNING" }); },
    async recordStepCompleted(stepId, state, strategy, message, outputs) {
      const step = steps.find(s => s.id === stepId && s.state === "RUNNING");
      if (step) {
        step.state = state;
        step.outputs = outputs;
      }
    },
    async recordRunState(state) { runState = state; },
    async recordHitlPause() {},
    async saveCheckpoint(cursor, contextState, iterationPath) {
      checkpoint = { cursor, contextState, iterationPath };
    },
    async loadCheckpoint() { return checkpoint; },
    async hasStepCompleted(stepId) {
      return steps.some(s => s.id === stepId && s.state === "SUCCEEDED");
    }
  };
};

describe("Tenant Isolation Test", () => {
  it("isolates context state between two concurrent runtime instances", async () => {
    const workflow: WorkflowV2 = {
      workflow_version: "2.0",
      name: "Tenant 1 workflow",
      status: "ACTIVE",
      variables: [],
      secrets: [],
      expected_domains: ["example.com"],
      compiler: { version: "1.0", source_specification_id: "test", compiled_at: new Date().toISOString() },
      root_step: {
        id: "root",
        operation: "SEQUENCE",
        target: "DATA",
        description: "Root",
        children: [
          {
            id: "set_secret",
            operation: "SET_VARIABLE",
            target: "DATA",
            description: "Set secret",
            args: { value: "TENANT_1_SECRET" },
            bind_result_to: "secret"
          }
        ]
      }
    };

    const planner = new ExecutionPlanner();
    const plan1 = planner.createPlan("tenant1_run", workflow);
    const plan2 = planner.createPlan("tenant2_run", workflow);
    const persistence1 = mockPersistence();
    const persistence2 = mockPersistence();
    
    const runtime1 = new WorkflowRuntime(plan1, persistence1, [new DataExecutor(), new ApiExecutor(), new HumanExecutor(), new BrowserDeterministicExecutor(), new BrowserSemanticExecutor()]);
    const runtime2 = new WorkflowRuntime(plan2, persistence2, [new DataExecutor(), new ApiExecutor(), new HumanExecutor(), new BrowserDeterministicExecutor(), new BrowserSemanticExecutor()]);

    await Promise.all([runtime1.start(), runtime2.start()]);

    const checkpoint1 = runtime1.getContext().getState();
    const checkpoint2 = runtime2.getContext().getState();
    
    expect(checkpoint1.variables.secret).toBe("TENANT_1_SECRET");
    expect(checkpoint2.variables.secret).toBe("TENANT_1_SECRET");
    // Ensure they are distinct objects in memory
    expect(checkpoint1).not.toBe(checkpoint2);
  });
});
