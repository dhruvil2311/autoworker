import { WorkflowRuntime, ExecutionPlanner, ApiExecutor, DataExecutor } from "@ghost/runtime";
import { createStore } from "../../../api/dist/store.js";
import { loadConfig } from "../../../api/dist/config.js";
import { runQueuedWorkflow } from "../worker.js";

async function run() {
  const config = loadConfig();
  // Force memory store for this local test to avoid polluting the DB
  config.storageProvider = "memory";
  config.allowInMemoryStorage = true;
  const store = createStore(config);

  const auth = { userId: crypto.randomUUID(), tenantId: crypto.randomUUID(), role: "admin" as const };

  const workflowVersion = await store.createWorkflowVersion(auth, {
    workflow_version: "2.0",
    name: "Durability Test",
    status: "ACTIVE",
    variables: [],
    secrets: [],
    compiler: { version: "2.0", source_specification_id: "spec-1", compiled_at: new Date().toISOString() },
    root_step: {
      id: "root",
      operation: "SEQUENCE",
      children: [
        {
          id: "step_setup",
          operation: "TRANSFORM",
          target: "DATA",
          args: { formula: { op: "ADD", left: 0, right: 0 }, variables: {} },
          bind_result_to: "init"
        },
        {
          id: "loop_1",
          operation: "FOR_EACH",
          args: { collection: "{{products}}", item_name: "product" },
          children: [
            {
              id: "side_effect_b",
              operation: "TRANSFORM",
              target: "DATA",
              description: "Simulating a side effect",
              args: { formula: { op: "ADD", left: 1, right: 1 }, variables: {} },
              bind_result_to: "res_b"
            },
            {
              id: "step_c",
              operation: "TRANSFORM",
              target: "DATA",
              args: { formula: { op: "ADD", left: 1, right: 2 }, variables: {} },
              bind_result_to: "res_c"
            }
          ]
        }
      ]
    }
  } as any);

  const runRow = await store.createRun(auth, workflowVersion.id);

  // We need to provide the "products" array in the run somehow. But since run input is not exposed via AppStore easily yet, 
  // wait, runQueuedWorkflow uses the context. How do we pass inputs? 
  // Let's create a custom persistence to mock the crash.
  
  const executionSteps: any[] = [];
  let checkpointStore: any = null;
  let hasCrashed = false;
  let executedSideEffects: string[] = [];

  const persistence = {
    async recordStepStarted(stepId: string) {
      executionSteps.push(stepId);
    },
    async recordStepCompleted(stepId: string, state: string, strategy?: string, message?: string, outputs?: any) {
      console.log("COMPLETED STEP:", stepId, state, message);
      if (stepId.includes("side_effect_b") && state === "SUCCEEDED") {
        executedSideEffects.push(stepId);
      }
      executionSteps.push(`${stepId}_${state}`);
    },
    async recordRunState(state: string) {},
    async recordHitlPause() {},
    async saveCheckpoint(cursor: string, contextState: any, iterationPath: number[]) {
      checkpointStore = { cursorJson: JSON.stringify(cursor), runtimeContextJson: contextState, controlFlowJson: iterationPath };
      
      // CRASH SIMULATION!
      // The FOR_EACH loop automatically checkpoints after each item with iterationPath = [i + 1]
      if (!hasCrashed && cursor === "loop_1" && iterationPath[0] === 1) { // Crash after product 1 completes, before product 2
        hasCrashed = true;
        throw new Error("SIMULATED_CRASH");
      }
    },
    async loadCheckpoint() {
      if (checkpointStore) {
        return {
          cursor: JSON.parse(checkpointStore.cursorJson),
          contextState: checkpointStore.runtimeContextJson,
          iterationPath: checkpointStore.controlFlowJson
        };
      }
      return null;
    },
    async hasStepCompleted(stepId: string) {
      return executionSteps.includes(`${stepId}_SUCCEEDED`);
    }
  };

  const capabilities = [new DataExecutor()];
  
  const planner = new ExecutionPlanner();
  const plan1 = planner.createPlan(workflowVersion.id, workflowVersion.workflow as any);
  const runtime1 = new WorkflowRuntime(plan1, persistence, capabilities, {
    inputs: {},
    variables: { products: [{ id: 1 }, { id: 2 }, { id: 3 }] },
    outputs: {}, artifacts: {}, scopes: [], executionMetadata: { runId: runRow.id, tenantId: auth.tenantId, workflowVersionId: workflowVersion.id }
  });

  try {
    await runtime1.start();
  } catch (e: any) {
    if (e.message !== "SIMULATED_CRASH") throw e;
    console.log("Crash successfully simulated at Product 2.");
  }
  
  console.log("State before resume:", executionSteps);

  // Instance 2: Recover
  console.log("Creating new runtime instance from checkpoint...");
  const plan2 = planner.createPlan(workflowVersion.id, workflowVersion.workflow as any);
  const runtime2 = new WorkflowRuntime(plan2, persistence, capabilities, {
    inputs: {},
    variables: { products: [{ id: 1 }, { id: 2 }, { id: 3 }] },
    outputs: {}, artifacts: {}, scopes: [], executionMetadata: { runId: runRow.id, tenantId: auth.tenantId, workflowVersionId: workflowVersion.id }
  });

  await runtime2.start();

  console.log("Executed Side Effects:", executedSideEffects);
  
  if (executedSideEffects.filter(s => s === "side_effect_b_0").length > 1) {
    throw new Error("Product 1 side effect ran twice!");
  }
  if (executedSideEffects.filter(s => s === "side_effect_b_1").length > 1) {
    throw new Error("Product 2 side effect ran twice!");
  }
  if (executedSideEffects.filter(s => s === "side_effect_b_2").length === 0) {
    throw new Error("Product 3 side effect did not run!");
  }

  console.log("DURABILITY AND CRASH RECOVERY VERIFIED!");
}

run().catch(console.error);
