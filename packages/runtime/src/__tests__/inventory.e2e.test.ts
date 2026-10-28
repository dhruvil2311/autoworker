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

describe("Inventory E2E Test", () => {
  it("executes inventory updates using loop and variable resolution", async () => {
    const workflow: WorkflowV2 = {
      workflow_version: "2.0",
      name: "Inventory Update",
      status: "ACTIVE",
      variables: [],
      secrets: [],
      expected_domains: ["erp.example.com"],
      compiler: { version: "1.0", source_specification_id: "test", compiled_at: new Date().toISOString() },
      root_step: {
        id: "root",
        operation: "SEQUENCE",
        target: "DATA",
        description: "Root",
        children: [
          {
            id: "get_products",
            operation: "SET_VARIABLE",
            target: "DATA",
            description: "Load products",
            args: { value: [{ sku: "A1", stock: 10 }, { sku: "B2", stock: 5 }] },
            bind_result_to: "products"
          },
          {
            id: "loop_products",
            operation: "FOR_EACH",
            target: "DATA",
            description: "Loop products",
            args: { collection: "{{products}}", item_name: "product" },
            children: [
              {
                id: "update_product",
                operation: "CALL_API",
                target: "API",
                description: "Update product in ERP",
                args: {
                  url: "https://erp.example.com/api/inventory",
                  method: "POST",
                  body: { sku: "{{product.sku}}", stock: "{{product.stock}}" }
                }
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
    
    // FOR_EACH loops through 2 products successfully
    expect(runtime.getContext().getState().variables.products.length).toBe(2);
  });
});
