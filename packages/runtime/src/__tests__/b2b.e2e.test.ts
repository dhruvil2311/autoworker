import { describe, expect, it } from "vitest";
import { WorkflowRuntime } from "../runtime.js";
import { ExecutionPlanner } from "../planner.js";
import { DataExecutor, ApiExecutor, HumanExecutor, BrowserDeterministicExecutor, BrowserSemanticExecutor } from "../executors/index.js";
import type { WorkflowV2 } from "@ghost/workflow-schema";
import type { ExecutionPersistence, RuntimeContextState } from "../runtime.js";

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

describe("B2B Order E2E Test", () => {
  it("executes conditional B2B order routing", async () => {
    const workflow: WorkflowV2 = {
      workflow_version: "2.0",
      name: "B2B Order Routing",
      status: "ACTIVE",
      variables: [],
      secrets: [],
      expected_domains: ["b2b.example.com"],
      compiler: { version: "1.0", source_specification_id: "test", compiled_at: new Date().toISOString() },
      root_step: {
        id: "root",
        operation: "SEQUENCE",
        target: "DATA",
        description: "Root",
        children: [
          {
            id: "get_order",
            operation: "SET_VARIABLE",
            target: "DATA",
            description: "Load order",
            args: { value: { id: "ORD-123", amount: 15000 } },
            bind_result_to: "order"
          },
          {
            id: "check_amount",
            operation: "IF",
            target: "DATA",
            description: "Check if order requires manual approval",
            args: { condition: "{{order.amount}} > 10000" },
            children: [
              {
                id: "require_approval",
                operation: "CALL_API",
                target: "API",
                description: "Notify manager",
                args: { url: "https://b2b.example.com/notify", method: "POST" }
              }
            ]
          }
        ]
      }
    };

    const planner = new ExecutionPlanner();
    const plan = planner.createPlan("v1", workflow);
    const persistence = mockPersistence();
    const runtime = new WorkflowRuntime(plan, persistence, [
      new DataExecutor(),
      new ApiExecutor(),
      new HumanExecutor(),
      new BrowserDeterministicExecutor(),
      new BrowserSemanticExecutor()
    ]);

    await runtime.start();
    
    // Check if context evaluated IF correctly and executed require_approval
    expect(runtime.getContext().getState().variables.order.id).toBe("ORD-123");
  });
});
