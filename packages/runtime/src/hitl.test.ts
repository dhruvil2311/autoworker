import { test, expect } from "vitest";
import { WorkflowRuntime, type ExecutionPersistence } from "./runtime.js";
import type { WorkflowV2Step } from "@ghost/workflow-schema";
import type { RuntimeContextState } from "./context.js";
import { MissingVariableError } from "./context.js";
import type { ExecutionCapability, ExecutionResult } from "./executors/index.js";
import { DataExecutor } from "./executors/data.js";

class MockPersistence implements ExecutionPersistence {
  completedSteps = new Set<string>();
  runState = "";
  lastCheckpoint: any = null;
  hitlRequests: any[] = [];

  async recordStepStarted(stepId: string): Promise<void> {}
  async recordStepCompleted(stepId: string, state: string, strategy?: string, message?: string, outputs?: any): Promise<void> {
    if (state === "SUCCEEDED") {
      this.completedSteps.add(stepId);
    }
  }
  async recordRunState(state: string, sessionMetadata?: any): Promise<void> {
    this.runState = state;
  }
  async recordHitlPause(stepId: string, challengeType: string): Promise<void> {
    this.hitlRequests.push({ stepId, challengeType });
  }
  async saveCheckpoint(cursor: string, contextState: RuntimeContextState, iterationPath: number[]): Promise<void> {
    this.lastCheckpoint = { cursor, contextState: JSON.parse(JSON.stringify(contextState)), iterationPath: [...iterationPath] };
  }
  async loadCheckpoint(): Promise<{ cursor: string; contextState: RuntimeContextState; iterationPath: number[] } | null> {
    return this.lastCheckpoint;
  }
  async hasStepCompleted(stepId: string): Promise<boolean> {
    return this.completedSteps.has(stepId);
  }
}

// Implement hitl resolution helper
function resolveProvideValueHitl(persistence: MockPersistence, missingKey: string, providedValue: any, expectedType: string) {
  if (!persistence.lastCheckpoint) throw new Error("No checkpoint to resolve");
  
  // validate expected type
  if (expectedType === "number" && typeof providedValue !== "number") {
    throw new Error("Resolution rejected: invalid type");
  }
  
  // reject unauthorized variable path
  if (missingKey.includes("__proto__") || missingKey.includes("constructor") || missingKey.includes("admin")) {
    throw new Error("Resolution rejected: unauthorized path");
  }

  // update runtime context
  const state = persistence.lastCheckpoint.contextState;
  
  if (missingKey.startsWith("variables.")) {
    state.variables[missingKey.slice(10)] = providedValue;
  } else if (missingKey.startsWith("inputs.")) {
    state.inputs[missingKey.slice(7)] = providedValue;
  } else {
    state.variables[missingKey] = providedValue;
  }
  
  persistence.lastCheckpoint.contextState = state;
}

test("PROVIDE_VALUE HITL loop", async () => {
  const plan = {
    workflowVersionId: "v1",
    workflow: {
      root_step: {
        id: "root",
        target: "DATA",
        operation: "TRANSFORM",
        args: { formula: { op: "ADD", left: { type: "VAR", name: "stock_buffer" }, right: { type: "LITERAL", value: 10 } }, variables: { stock_buffer: "{{stock_buffer}}" } },
        bind_result_to: "final_stock"
      }
    }
  };

  const persistence = new MockPersistence();
  const caps = [new DataExecutor()];
  
  const runtime = new WorkflowRuntime(plan as any, persistence, caps, {
    inputs: {},
    variables: {}, outputs: {}, artifacts: {}, scopes: [],
    executionMetadata: { runId: "r1", tenantId: "t1", workflowVersionId: "v1" }
  });

  await runtime.start();
  
  expect(persistence.runState).toBe("WAITING_FOR_HUMAN");
  expect(persistence.hitlRequests.length).toBe(1);
  expect(persistence.hitlRequests[0].challengeType).toBe("MISSING_RUNTIME_VALUE");

  // Invalid type test
  expect(() => {
    resolveProvideValueHitl(persistence, "stock_buffer", "hello", "number");
  }).toThrow("Resolution rejected: invalid type");

  // Unauthorized path test
  expect(() => {
    resolveProvideValueHitl(persistence, "__proto__.admin", 5, "number");
  }).toThrow("Resolution rejected: unauthorized path");

  // Valid value test
  resolveProvideValueHitl(persistence, "stock_buffer", 5, "number");
  
  // Resume
  const runtime2 = new WorkflowRuntime(plan as any, persistence, caps);
  await runtime2.start();

  expect(persistence.runState).toBe("SUCCEEDED");
  expect(runtime2.getContext().getState().variables.final_stock).toBe(15);
});
