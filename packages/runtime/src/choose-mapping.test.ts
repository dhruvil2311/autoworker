import { test, expect } from "vitest";
import { WorkflowRuntime, type ExecutionPersistence } from "./runtime.js";
import type { WorkflowV2Step } from "@ghost/workflow-schema";
import type { RuntimeContextState } from "./context.js";
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

const counters: Record<string, number> = {};

class MockProcessOrderExecutor implements ExecutionCapability {
  canExecute(step: WorkflowV2Step): boolean {
    return step.target === "API" && step.operation === "ACT";
  }
  async execute(step: WorkflowV2Step, context: any): Promise<ExecutionResult> {
    const item = context.get("order").id;
    counters[item] = (counters[item] || 0) + 1;
    return { state: "SUCCEEDED" };
  }
}

function resolveChooseMappingHitl(persistence: MockPersistence, unmatchedEntity: string, mappedTo: string, authorizedEntity: string) {
  if (!persistence.lastCheckpoint) throw new Error("No checkpoint to resolve");
  
  if (unmatchedEntity !== authorizedEntity) {
    throw new Error("Resolution rejected: unauthorized mapping mutation");
  }

  const state = persistence.lastCheckpoint.contextState;
  const mappings = state.variables.mappings || {};
  mappings[unmatchedEntity] = mappedTo;
  state.variables.mappings = mappings;
  
  persistence.lastCheckpoint.contextState = state;
}

test("CHOOSE_MAPPING HITL loop", async () => {
  const plan = {
    workflowVersionId: "v1",
    workflow: {
      root_step: {
        id: "root",
        target: "CONTROL_FLOW",
        operation: "FOR_EACH",
        args: { collection: "{{orders}}", item_name: "order" },
        children: [
          {
            id: "match_product",
            target: "DATA",
            operation: "MATCH",
            args: { value: "{{order.product}}", target: "KNOWN_PRODUCT" },
            failure_policy: { on_failure: "PAUSE_FOR_HUMAN" }
          },
          {
            id: "process_order",
            target: "API",
            operation: "ACT"
          }
        ]
      }
    }
  };

  const persistence = new MockPersistence();
  const caps = [new DataExecutor(), new MockProcessOrderExecutor()];
  
  const runtime = new WorkflowRuntime(plan as any, persistence, caps, {
    inputs: {
      orders: [
        { id: "ORDER_A", product: "KNOWN_PRODUCT" },
        { id: "ORDER_B", product: "UNKNOWN_PRODUCT" },
        { id: "ORDER_C", product: "KNOWN_PRODUCT" }
      ]
    },
    variables: {}, outputs: {}, artifacts: {}, scopes: [],
    executionMetadata: { runId: "r1", tenantId: "t1", workflowVersionId: "v1" }
  });

  await runtime.start();
  
  expect(persistence.runState).toBe("WAITING_FOR_HUMAN");
  expect(counters["ORDER_A"]).toBe(1);
  expect(counters["ORDER_B"]).toBeUndefined();
  expect(counters["ORDER_C"]).toBeUndefined();
  expect(persistence.hitlRequests.length).toBe(1);
  expect(persistence.hitlRequests[0].challengeType).toBe("UNMATCHED_ENTITY");

  // Unauthorized mapping attempt
  expect(() => {
    resolveChooseMappingHitl(persistence, "HACKED_PRODUCT", "KNOWN_PRODUCT", "UNKNOWN_PRODUCT");
  }).toThrow("Resolution rejected: unauthorized mapping mutation");

  // Valid mapping
  resolveChooseMappingHitl(persistence, "UNKNOWN_PRODUCT", "KNOWN_PRODUCT", "UNKNOWN_PRODUCT");
  
  // Resume
  const runtime2 = new WorkflowRuntime(plan as any, persistence, caps);
  await runtime2.start();

  expect(persistence.runState).toBe("SUCCEEDED");
  expect(counters["ORDER_A"]).toBe(1);
  expect(counters["ORDER_B"]).toBe(1);
  expect(counters["ORDER_C"]).toBe(1);
});
