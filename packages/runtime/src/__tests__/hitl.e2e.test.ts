import { describe, it, expect } from "vitest";
import { WorkflowRuntime, type ExecutionPersistence } from "../runtime.js";
import { ExecutionPlanner } from "../planner.js";
import { HumanExecutor } from "../executors/index.js";
import type { WorkflowV2 } from "@ghost/workflow-schema";
import type { RuntimeContextState } from "../context.js";

class MockHitlPersistence implements ExecutionPersistence {
  public executionLog: string[] = [];
  public hitlPauses: string[] = [];
  
  async recordStepStarted(stepId: string) {
    this.executionLog.push(`STARTED:${stepId}`);
  }

  async recordStepCompleted(stepId: string, state: string, target?: string, message?: string, outputs?: any) {
    this.executionLog.push(`COMPLETED:${stepId}:${state}`);
  }

  async hasStepCompleted(stepId: string) {
    return this.executionLog.includes(`COMPLETED:${stepId}:SUCCEEDED`);
  }

  async recordRunState(state: string) {}

  async recordHitlPause(stepId: string, challengeType: string) {
    this.hitlPauses.push(`${stepId}:${challengeType}`);
  }

  async saveCheckpoint(cursor: string, contextState: RuntimeContextState, iterationPath: number[]) {}
  async loadCheckpoint() { return null; }
}

describe("Generalized HITL Verification", () => {
  it("pauses on REQUIRE_APPROVAL and resumes upon APPROVE", async () => {
    const workflow: WorkflowV2 = {
      workflow_version: "2.0",
      root_step: {
        id: "root", operation: "REQUIRE_APPROVAL", target: "HUMAN", description: "Please approve this"
      }
    };

    const planner = new ExecutionPlanner();
    const plan = planner.createPlan("v1", workflow);
    const persistence = new MockHitlPersistence();
    const runtime = new WorkflowRuntime(plan, persistence, [new HumanExecutor()]);

    await runtime.start();
    expect(persistence.executionLog).toContain("COMPLETED:root:PAUSED_FOR_HUMAN");
    expect(persistence.hitlPauses).toContain("root:MANUAL_APPROVAL");

    // Resume with approval
    runtime.getContext().set("hitl_response_root", { action: "APPROVE" });
    await runtime.start();
    
    expect(persistence.executionLog).toContain("COMPLETED:root:SUCCEEDED");
  });

  it("fails on REQUIRE_APPROVAL upon REJECT", async () => {
    const workflow: WorkflowV2 = {
      workflow_version: "2.0",
      root_step: {
        id: "root", operation: "REQUIRE_APPROVAL", target: "HUMAN"
      }
    };
    const planner = new ExecutionPlanner();
    const plan = planner.createPlan("v1", workflow);
    const persistence = new MockHitlPersistence();
    const runtime = new WorkflowRuntime(plan, persistence, [new HumanExecutor()]);

    await runtime.start();
    
    // Resume with rejection
    runtime.getContext().set("hitl_response_root", { action: "REJECT" });
    await runtime.start();
    
    expect(persistence.executionLog).toContain("COMPLETED:root:FAILED");
  });

  it("pauses for CHOOSE_MAPPING and binds selected value", async () => {
    const workflow: WorkflowV2 = {
      workflow_version: "2.0",
      root_step: {
        id: "root", operation: "CHOOSE_MAPPING", target: "HUMAN", bind_result_to: "selected_user"
      }
    };

    const planner = new ExecutionPlanner();
    const plan = planner.createPlan("v1", workflow);
    const persistence = new MockHitlPersistence();
    const runtime = new WorkflowRuntime(plan, persistence, [new HumanExecutor()]);

    await runtime.start();
    expect(persistence.executionLog).toContain("COMPLETED:root:PAUSED_FOR_HUMAN");

    // Resume with choice
    runtime.getContext().set("hitl_response_root", { action: "CHOOSE_MAPPING", value: "user_123" });
    await runtime.start();
    
    expect(persistence.executionLog).toContain("COMPLETED:root:SUCCEEDED");
    expect(runtime.getContext().get("selected_user")).toBe("user_123");
  });

  it("pauses for PROVIDE_VALUE and binds input value", async () => {
    const workflow: WorkflowV2 = {
      workflow_version: "2.0",
      root_step: {
        id: "root", operation: "PROVIDE_VALUE", target: "HUMAN", bind_result_to: "mfa_token"
      }
    };

    const planner = new ExecutionPlanner();
    const plan = planner.createPlan("v1", workflow);
    const persistence = new MockHitlPersistence();
    const runtime = new WorkflowRuntime(plan, persistence, [new HumanExecutor()]);

    await runtime.start();

    // Resume with value
    runtime.getContext().set("hitl_response_root", { action: "PROVIDE_VALUE", value: "123456" });
    await runtime.start();
    
    expect(persistence.executionLog).toContain("COMPLETED:root:SUCCEEDED");
    expect(runtime.getContext().get("mfa_token")).toBe("123456");
  });
});
