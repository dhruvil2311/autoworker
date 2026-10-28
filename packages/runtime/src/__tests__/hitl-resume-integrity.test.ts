/**
 * Test F (runtime layer) — HITL pause/approve/reject/resume, interrupted side effects,
 * cancellation and bounded retries.
 *
 * Uses an in-memory persistence and a counting capability instead of a browser (isolated unit
 * tests; no live application). The live-browser counterpart is apps/worker/src/live-execution.test.ts.
 */
import { describe, it, expect } from "vitest";
import { WorkflowRuntime, type ExecutionPersistence } from "../runtime.js";
import type { RuntimeContextState } from "../context.js";
import { HumanExecutor, type ExecutionCapability, type ExecutionResult } from "../executors/index.js";
import type { WorkflowV2Step } from "@ghost/workflow-schema";

class MemoryPersistence implements ExecutionPersistence {
  stepStates = new Map<string, string>();
  runStates: string[] = [];
  hitl: Array<{ stepId: string; reason: string }> = [];
  checkpoint: { cursor: string; contextState: RuntimeContextState; iterationPath: number[] } | null = null;
  stopAfter: string | null = null;

  async recordStepStarted(stepId: string) { this.stepStates.set(stepId, "RUNNING"); }
  async recordStepCompleted(stepId: string, state: string) { this.stepStates.set(stepId, state); }
  async recordRunState(state: string) { this.runStates.push(state); }
  async recordHitlPause(stepId: string, reason: string) { this.hitl.push({ stepId, reason }); }
  async saveCheckpoint(cursor: string, contextState: RuntimeContextState, iterationPath: number[]) {
    this.checkpoint = { cursor, contextState: JSON.parse(JSON.stringify(contextState)), iterationPath: [...iterationPath] };
  }
  async loadCheckpoint() { return this.checkpoint; }
  async hasStepCompleted(stepId: string) { return this.stepStates.get(stepId) === "SUCCEEDED"; }
  async getStepState(stepId: string) { return this.stepStates.get(stepId); }
  async shouldStop() {
    return this.stopAfter && this.stepStates.get(this.stopAfter) === "SUCCEEDED" ? "Run is CANCELLED" : null;
  }
}

/** Counts executions per step id; simulates application actions without a browser. */
class CountingCapability implements ExecutionCapability {
  calls = new Map<string, number>();
  failUntil = new Map<string, number>();
  canExecute(step: WorkflowV2Step) { return step.target === "BROWSER_DETERMINISTIC"; }
  async execute(step: WorkflowV2Step): Promise<ExecutionResult> {
    const n = (this.calls.get(step.id) || 0) + 1;
    this.calls.set(step.id, n);
    if ((this.failUntil.get(step.id) || 0) >= n) return { state: "FAILED", message: "transient failure" };
    return { state: "SUCCEEDED", outputs: { [`${step.id}_done`]: true } };
  }
}

const meta = { runId: "run-1", tenantId: "t1", workflowVersionId: "wv-1" };
const baseState = (inputs: Record<string, unknown> = {}): RuntimeContextState => ({
  inputs, variables: {}, outputs: {}, artifacts: {}, scopes: [], executionMetadata: { ...meta }
});

function workflow(children: WorkflowV2Step[]) {
  return {
    workflowVersionId: "wv-1",
    workflow: { root_step: { id: "root", operation: "SEQUENCE", target: "DATA", description: "root", children } }
  } as any;
}

const gatedSave: WorkflowV2Step[] = [
  { id: "step_0_navigate", operation: "NAVIGATE", target: "BROWSER_DETERMINISTIC", description: "Open orders", args: { url: "https://orders.example.test" } },
  { id: "step_1_type", operation: "TYPE", target: "BROWSER_DETERMINISTIC", description: "Enter note", args: { target: { label: "Note" }, value: "x" } },
  { id: "approve_step_2_click", operation: "REQUIRE_APPROVAL", target: "HUMAN", description: "Approve before saving", args: { gates_step_id: "step_2_click" } },
  { id: "step_2_click", operation: "CLICK", target: "BROWSER_DETERMINISTIC", description: "Save order", args: { target: { text: "Save order" }, irreversible: true } }
];

describe("Test F — HITL lifecycle in the runtime", () => {
  it("pauses before an irreversible step, persists a checkpoint, and does not execute the step", async () => {
    const persistence = new MemoryPersistence();
    const app = new CountingCapability();
    const runtime = new WorkflowRuntime(workflow(gatedSave), persistence, [new HumanExecutor(), app], baseState());
    await runtime.start();

    expect(persistence.runStates.at(-1)).toBe("WAITING_FOR_HUMAN");
    expect(persistence.hitl).toEqual([{ stepId: "approve_step_2_click", reason: "MANUAL_APPROVAL" }]);
    expect(persistence.checkpoint?.cursor).toBe("approve_step_2_click");
    expect(app.calls.get("step_2_click")).toBeUndefined();
  });

  it("approval resumes from the checkpoint: completed steps are not repeated and the gated step runs once", async () => {
    const persistence = new MemoryPersistence();
    const app = new CountingCapability();
    await new WorkflowRuntime(workflow(gatedSave), persistence, [new HumanExecutor(), app], baseState()).start();

    // The worker passes the recorded decision as an input; the checkpoint holds the older inputs.
    const resumed = new WorkflowRuntime(workflow(gatedSave), persistence, [new HumanExecutor(), app],
      baseState({ hitl_response_approve_step_2_click: { action: "APPROVE" } }));
    await resumed.start();

    expect(persistence.runStates.at(-1)).toBe("SUCCEEDED");
    expect(app.calls.get("step_0_navigate")).toBe(1);
    expect(app.calls.get("step_1_type")).toBe(1);
    expect(app.calls.get("step_2_click")).toBe(1);
    expect(persistence.hitl).toHaveLength(1);
  });

  it("a rejection fails the gate and the irreversible step never executes", async () => {
    const persistence = new MemoryPersistence();
    const app = new CountingCapability();
    await new WorkflowRuntime(workflow(gatedSave), persistence, [new HumanExecutor(), app], baseState()).start();
    await new WorkflowRuntime(workflow(gatedSave), persistence, [new HumanExecutor(), app],
      baseState({ hitl_response_approve_step_2_click: { action: "REJECT" } })).start();

    expect(persistence.runStates.at(-1)).toBe("FAILED");
    expect(app.calls.get("step_2_click")).toBeUndefined();
  });

  it("an interrupted side-effecting step is not re-executed blindly after a restart", async () => {
    const steps: WorkflowV2Step[] = [
      { id: "step_0_click", operation: "CLICK", target: "BROWSER_DETERMINISTIC", description: "Submit payment", args: { target: { text: "Pay" }, irreversible: true } }
    ];
    const persistence = new MemoryPersistence();
    persistence.stepStates.set("step_0_click", "RUNNING"); // crashed after starting, before recording an outcome
    const app = new CountingCapability();

    await new WorkflowRuntime(workflow(steps), persistence, [app], baseState()).start();
    expect(app.calls.get("step_0_click")).toBeUndefined();
    expect(persistence.hitl).toEqual([{ stepId: "step_0_click", reason: "INTERRUPTED_SIDE_EFFECT_UNVERIFIED" }]);
    expect(persistence.runStates.at(-1)).toBe("WAITING_FOR_HUMAN");

    // Human confirms it already happened: the step is recorded complete without executing again.
    await new WorkflowRuntime(workflow(steps), persistence, [app],
      baseState({ hitl_response_step_0_click: { action: "PROVIDE_VALUE", value: "ALREADY_DONE" } })).start();
    expect(app.calls.get("step_0_click")).toBeUndefined();
    expect(persistence.stepStates.get("step_0_click")).toBe("SUCCEEDED");
    expect(persistence.runStates.at(-1)).toBe("SUCCEEDED");
  });

  it("cancellation stops execution before the next step and records no terminal state", async () => {
    const steps: WorkflowV2Step[] = [
      { id: "a", operation: "CLICK", target: "BROWSER_DETERMINISTIC", description: "A", args: { target: { text: "A" } } },
      { id: "b", operation: "CLICK", target: "BROWSER_DETERMINISTIC", description: "B", args: { target: { text: "B" } } }
    ];
    const persistence = new MemoryPersistence();
    persistence.stopAfter = "a";
    const app = new CountingCapability();
    const runtime = new WorkflowRuntime(workflow(steps), persistence, [app], baseState());
    await runtime.start();

    expect(app.calls.get("a")).toBe(1);
    expect(app.calls.get("b")).toBeUndefined();
    expect(runtime.stopReason).toBe("Run is CANCELLED");
    expect(persistence.runStates).toEqual(["RUNNING"]);
  });

  it("retries are bounded by retry_limit and never applied to irreversible steps", async () => {
    const steps: WorkflowV2Step[] = [
      { id: "read", operation: "EXTRACT", target: "BROWSER_DETERMINISTIC", description: "Read", args: {}, failure_policy: { retry_limit: 2 } },
    ];
    const persistence = new MemoryPersistence();
    const app = new CountingCapability();
    app.failUntil.set("read", 10);
    await new WorkflowRuntime(workflow(steps), persistence, [app], baseState(), 1).start();
    expect(app.calls.get("read")).toBe(3);
    expect(persistence.runStates.at(-1)).toBe("FAILED");

    const irreversible: WorkflowV2Step[] = [
      { id: "pay", operation: "CLICK", target: "BROWSER_DETERMINISTIC", description: "Pay", args: { irreversible: true }, failure_policy: { retry_limit: 3 } }
    ];
    const p2 = new MemoryPersistence();
    const app2 = new CountingCapability();
    app2.failUntil.set("pay", 10);
    await new WorkflowRuntime(workflow(irreversible), p2, [app2], baseState(), 1).start();
    expect(app2.calls.get("pay")).toBe(1);
  });
});
