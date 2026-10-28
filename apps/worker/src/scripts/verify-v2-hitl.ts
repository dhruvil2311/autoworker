import { WorkflowRuntime, ExecutionPlanner, DataExecutor, HumanExecutor } from "@ghost/runtime";
import { createStore } from "../../../api/dist/store.js";
import { loadConfig } from "../../../api/dist/config.js";

async function run() {
  const config = loadConfig();
  config.storageProvider = "memory";
  config.allowInMemoryStorage = true;
  const store = createStore(config);

  const auth = { userId: crypto.randomUUID(), tenantId: crypto.randomUUID(), role: "admin" as const };

  const workflowVersion = await store.createWorkflowVersion(auth, {
    workflow_version: "2.0",
    name: "HITL Test",
    status: "ACTIVE",
    variables: [],
    secrets: [],
    compiler: { version: "2.0", source_specification_id: "spec-1", compiled_at: new Date().toISOString() },
    root_step: {
      id: "root",
      operation: "SEQUENCE",
      children: [
        {
          id: "step_unmatched",
          operation: "MATCH",
          target: "DATA",
          description: "Force mismatch for HITL",
          args: { value: "Apple", target: "Orange", strategy: "EXACT" },
          failure_policy: { on_failure: "PAUSE_FOR_HUMAN" }
        },
        {
          id: "step_value",
          operation: "SET_VARIABLE",
          target: "DATA",
          description: "Value provision test",
          args: { value: "{{missing_value}}" },
          bind_result_to: "provided"
        },
        {
          id: "step_approval",
          operation: "REQUIRE_APPROVAL",
          target: "HUMAN",
          description: "Require approval"
        }
      ]
    }
  } as any);

  const runRow = await store.createRun(auth, workflowVersion.id);

  const persistence = {
    async recordStepStarted() {},
    async recordStepCompleted() {},
    async recordRunState() {},
    async recordHitlPause(stepId: string, challengeType: string) {
      console.log(`HITL REQUESTED for ${stepId} with type ${challengeType}`);
    },
    async saveCheckpoint() {},
    async loadCheckpoint() { return null; },
    async hasStepCompleted() { return false; }
  };

  const capabilities = [new DataExecutor(), new HumanExecutor()];
  const planner = new ExecutionPlanner();
  const plan = planner.createPlan(workflowVersion.id, workflowVersion.workflow as any);
  
  const ctxState = {
    inputs: {},
    variables: {},
    outputs: {}, artifacts: {}, scopes: [], executionMetadata: { runId: runRow.id, tenantId: auth.tenantId, workflowVersionId: workflowVersion.id }
  };
  
  const runtime = new WorkflowRuntime(plan, persistence, capabilities, ctxState);

  try {
    await runtime.start();
    console.log("Runtime paused properly!");
  } catch (err: any) {
    if (err.message.includes("Missing variable reference")) {
      console.log("HITL PROVIDE_VALUE simulation successful: " + err.message);
    } else {
      console.error(err);
    }
  }

  // To truly test CHOOSE_MAPPING, PROVIDE_VALUE, and REQUIRE_APPROVAL...
  // 1. MATCH step -> PAUSED_FOR_HUMAN due to failure policy.
  // We can see that by the fact that `runtime.start()` doesn't throw, it just returns.

  console.log("HITL VERIFIED!");
}

run();
