import { test, expect } from "vitest";
import { WorkflowRuntime, type ExecutionPersistence } from "./runtime.js";
import type { WorkflowV2Step } from "@ghost/workflow-schema";
import type { RuntimeContextState } from "./context.js";
import type { ExecutionCapability, ExecutionResult } from "./executors/index.js";

class MockPersistence implements ExecutionPersistence {
  completedSteps = new Set<string>();
  runState = "";
  lastCheckpoint: any = null;

  async recordStepStarted(stepId: string): Promise<void> {}
  async recordStepCompleted(stepId: string, state: string, strategy?: string, message?: string, outputs?: any): Promise<void> {
    if (state === "SUCCEEDED") {
      this.completedSteps.add(stepId);
    }
  }
  async recordRunState(state: string, sessionMetadata?: any): Promise<void> {
    this.runState = state;
  }
  async recordHitlPause(stepId: string, challengeType: string): Promise<void> {}
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

const counters: Record<string, number> = {};

class MockSideEffectExecutor implements ExecutionCapability {
  canExecute(step: WorkflowV2Step): boolean {
    return step.target === "API" && step.operation === "EXTRACT";
  }

  async execute(step: WorkflowV2Step, context: any): Promise<ExecutionResult> {
    const item = context.get("product");
    const name = step.id === "se1" ? "SIDE_EFFECT_1" : "SIDE_EFFECT_2";
    const key = `${item}:${name}`;
    counters[key] = (counters[key] || 0) + 1;
    return { state: "SUCCEEDED" };
  }
}

class MockCheckpointExecutor implements ExecutionCapability {
  canExecute(step: WorkflowV2Step): boolean {
    return step.target === "API" && step.operation === "CHECKPOINT";
  }
  async execute(step: WorkflowV2Step, context: any): Promise<ExecutionResult> {
    return { state: "SUCCEEDED" };
  }
}

test("Durable Crash Recovery", async () => {
  const plan = {
    workflowVersionId: "v1",
    workflow: {
      root_step: {
        id: "root",
        target: "CONTROL_FLOW",
        operation: "FOR_EACH",
        args: { collection: "{{products}}", item_name: "product" },
        children: [
          { id: "se1", target: "API", operation: "EXTRACT" },
          { id: "chk", target: "API", operation: "CHECKPOINT" },
          { id: "se2", target: "API", operation: "EXTRACT" }
        ]
      }
    }
  };

  const persistence = new MockPersistence();
  const caps = [new MockSideEffectExecutor(), new MockCheckpointExecutor()];
  
  let runtime = new WorkflowRuntime(plan as any, persistence, caps, {
    inputs: { products: ["A", "B", "C"] },
    variables: {}, outputs: {}, artifacts: {}, scopes: [],
    executionMetadata: { runId: "r1", tenantId: "t1", workflowVersionId: "v1" }
  });

  // Intercept the checkpoint save to simulate a crash
  const originalSave = persistence.saveCheckpoint.bind(persistence);
  persistence.saveCheckpoint = async (cursor, state, iter) => {
    await originalSave(cursor, state, iter);
    if (cursor === "chk" && iter[0] === 1) { // 1 is B
      throw new Error("SIMULATED_CRASH");
    }
  };

  await runtime.start();
  
  // Verify state before crash
  expect(persistence.runState).toBe("FAILED");
  expect(counters["A:SIDE_EFFECT_1"]).toBe(1);
  expect(counters["A:SIDE_EFFECT_2"]).toBe(1);
  expect(counters["B:SIDE_EFFECT_1"]).toBe(1);
  expect(counters["B:SIDE_EFFECT_2"]).toBeUndefined();
  
  // Restore persistence save
  persistence.saveCheckpoint = originalSave;
  
  // Create completely new runtime instance
  const runtime2 = new WorkflowRuntime(plan as any, persistence, caps);
  await runtime2.start();
  
  // Verify completed execution
  expect(persistence.runState).toBe("SUCCEEDED");
  expect(counters["A:SIDE_EFFECT_1"]).toBe(1);
  expect(counters["A:SIDE_EFFECT_2"]).toBe(1);
  expect(counters["B:SIDE_EFFECT_1"]).toBe(1);
  expect(counters["B:SIDE_EFFECT_2"]).toBe(1);
  expect(counters["C:SIDE_EFFECT_1"]).toBe(1);
  expect(counters["C:SIDE_EFFECT_2"]).toBe(1);
});
