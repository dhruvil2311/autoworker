import { test, expect } from "vitest";
import { WorkflowRuntime, type ExecutionPersistence } from "./runtime.js";
import { DataExecutor } from "./executors/data.js";
import type { RuntimeContextState } from "./context.js";

class MockPersistence implements ExecutionPersistence {
  async recordStepStarted(stepId: string) {}
  async recordStepCompleted(stepId: string, state: string) {}
  async recordRunState(state: string) {}
  async recordHitlPause(stepId: string, challengeType: string) {}
  async saveCheckpoint(cursor: string, contextState: RuntimeContextState, iterationPath: number[]) {}
  async loadCheckpoint() { return null; }
  async hasStepCompleted(stepId: string) { return false; }
}

test("DATA Executor Numerical Proof", async () => {
  const plan = {
    workflowVersionId: "v1",
    workflow: {
      root_step: {
        id: "seq",
        target: "CONTROL_FLOW",
        operation: "SEQUENCE",
        children: [
          {
            id: "set_sales",
            target: "DATA",
            operation: "SET_VARIABLE",
            args: { value: 500 },
            bind_result_to: "sales_total"
          },
          {
            id: "set_returns",
            target: "DATA",
            operation: "SET_VARIABLE",
            args: { value: 355 },
            bind_result_to: "returns_total"
          },
          {
            id: "calc_net",
            target: "DATA",
            operation: "TRANSFORM",
            args: {
              formula: {
                op: "SUBTRACT",
                left: { type: "VAR", name: "sales" },
                right: { type: "VAR", name: "returns" }
              },
              variables: {
                sales: "{{sales_total}}",
                returns: "{{returns_total}}"
              }
            },
            bind_result_to: "net_sales"
          },
          {
            id: "calc_tax",
            target: "DATA",
            operation: "TRANSFORM",
            args: {
              formula: {
                op: "MULTIPLY",
                left: { type: "VAR", name: "net" },
                right: { type: "LITERAL", value: 0.1 }
              },
              variables: {
                net: "{{net_sales}}"
              }
            },
            bind_result_to: "tax"
          },
          {
            id: "calc_final",
            target: "DATA",
            operation: "TRANSFORM",
            args: {
              formula: {
                op: "SUBTRACT",
                left: { type: "VAR", name: "net" },
                right: { type: "VAR", name: "tax" }
              },
              variables: {
                net: "{{net_sales}}",
                tax: "{{tax}}"
              }
            },
            bind_result_to: "final_revenue"
          }
        ]
      }
    }
  };

  const persistence = new MockPersistence();
  const caps = [new DataExecutor()];
  
  const runtime = new WorkflowRuntime(plan as any, persistence, caps, {
    inputs: {}, variables: {}, outputs: {}, artifacts: {}, scopes: [],
    executionMetadata: { runId: "r1", tenantId: "t1", workflowVersionId: "v1" }
  });

  await runtime.start();

  const state = runtime.getContext().getState();
  
  expect(state.variables.sales_total).toBe(500);
  expect(state.variables.returns_total).toBe(355);
  expect(state.variables.net_sales).toBe(145);
  expect(state.variables.tax).toBe(14.5);
  expect(state.variables.final_revenue).toBe(130.5);
});
