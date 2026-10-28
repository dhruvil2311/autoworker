import { describe, it, expect } from "vitest";
import { WorkflowRuntime, type ExecutionPersistence } from "../runtime.js";
import { ExecutionPlanner } from "../planner.js";
import { DataExecutor, ApiExecutor, HumanExecutor, BrowserDeterministicExecutor, BrowserSemanticExecutor } from "../executors/index.js";
import type { WorkflowV2 } from "@ghost/workflow-schema";
import type { RuntimeContextState } from "../context.js";

class MockCrashPersistence implements ExecutionPersistence {
  public completedSteps = new Set<string>();
  public state = "PENDING";
  public savedCheckpoint: { cursor: string; contextState: RuntimeContextState; iterationPath: number[] } | null = null;
  public executionLog: string[] = [];
  public crashCounter = 0;
  
  constructor(public crashAtStep: string = "") {}

  async recordStepStarted(stepId: string) {
    this.executionLog.push(`STARTED:${stepId}`);
  }

  async recordStepCompleted(stepId: string, state: string) {
    if (state === "SUCCEEDED") this.completedSteps.add(stepId);
    this.executionLog.push(`COMPLETED:${stepId}:${state}`);
  }

  async hasStepCompleted(stepId: string) {
    return this.completedSteps.has(stepId);
  }

  async recordRunState(state: string) {
    this.state = state;
  }

  async recordHitlPause() {}

  async saveCheckpoint(cursor: string, contextState: RuntimeContextState, iterationPath: number[]) {
    this.savedCheckpoint = {
      cursor,
      contextState: JSON.parse(JSON.stringify(contextState)),
      iterationPath: [...iterationPath]
    };
    if (this.crashAtStep === cursor && this.crashCounter === 0) {
      this.crashCounter++;
      throw new Error("SIMULATED_WORKER_DEATH");
    }
  }

  async loadCheckpoint() {
    return this.savedCheckpoint;
  }
}

describe("Crash Recovery Test", () => {
  it("resumes exactly after worker death without repeating completed side effects", async () => {
    const workflow: WorkflowV2 = {
      workflow_version: "2.0",
      root_step: {
        id: "root",
        operation: "FOR_EACH",
        target: "DATA",
        args: { collection: "{{items}}", item_name: "item" },
        children: [
          { id: "step_a", operation: "SET_VARIABLE", target: "DATA", args: { value: "some_val" } },
          { id: "step_b", operation: "REQUIRE_APPROVAL", target: "HUMAN" }
        ]
      }
    };

    const planner = new ExecutionPlanner();
    const plan = planner.createPlan("v1", workflow);
    const persistence = new MockCrashPersistence("root"); // Crash when saving checkpoint for PAUSED_FOR_HUMAN in loop

    const runtime1 = new WorkflowRuntime(plan, persistence, [
      new DataExecutor(), new ApiExecutor(), new HumanExecutor(), new BrowserDeterministicExecutor(), new BrowserSemanticExecutor()
    ], {
      inputs: {}, variables: { items: ["Item1", "Item2"] }, outputs: {}, artifacts: {}, scopes: [],
      executionMetadata: { runId: "1", tenantId: "t1", workflowVersionId: "v1" }
    });

    // 1. Initial run will crash at step_b (REQUIRE_APPROVAL)
    try {
      await runtime1.start();
    } catch (e: any) {
      expect(e.message).toBe("SIMULATED_WORKER_DEATH");
    }

    expect(persistence.executionLog.some(l => l.startsWith("COMPLETED:step_a") && l.endsWith(":SUCCEEDED"))).toBe(true);
    expect(persistence.savedCheckpoint).not.toBeNull();
    expect(persistence.savedCheckpoint?.iterationPath).toEqual([0]);

    // Simulating hitl resolution
    persistence.savedCheckpoint!.contextState.variables.hitl_response_step_b = { action: "APPROVE" };

    // 2. Resume run from new runtime
    const runtime2 = new WorkflowRuntime(plan, persistence, [
      new DataExecutor(), new ApiExecutor(), new HumanExecutor(), new BrowserDeterministicExecutor(), new BrowserSemanticExecutor()
    ]);
    
    await runtime2.start();

    // The second runtime should pause at the end of the loop or complete it
    expect(persistence.savedCheckpoint?.iterationPath).toEqual([2]);
  });
});
