import { loadConfig } from "../../api/dist/config.js";
import { createStore, type AppStore, type ExecutionStepRow } from "../../api/dist/store.js";
import { BrowserbaseExecutionProvider } from "./browserbase.js";
import { executeWorkflowWithBrowserbase } from "./executor.js";
import { logger } from "@ghost/observability";
import { validateWorkflow, type WorkflowV2 } from "@ghost/workflow-schema";
import type { AuthContext } from "@ghost/shared-types";
import { 
  WorkflowRuntime, 
  ExecutionPlanner, 
  ApiExecutor, 
  DataExecutor, 
  HumanExecutor,
  DesktopComputerExecutor,
  type ExecutionPersistence as V2ExecutionPersistence,
  type RuntimeContextState
} from "@ghost/runtime";
import { V2BrowserExecutor } from "./executors-v2.js";
import { OutputExecutor } from "./output-executor.js";

function createV2Persistence(store: AppStore, auth: AuthContext, runId: string, hitlTimeoutSeconds: number): V2ExecutionPersistence {
  return {
    async recordStepStarted(stepId) {
      await store.createExecutionStep(auth, {
        id: crypto.randomUUID(), tenantId: auth.tenantId, runId, stepId, state: "RUNNING",
        startedAt: new Date().toISOString(), metadata: {}
      });
      // Best effort update worker status to ACTIVE if it has an active version
      const run = await store.getRun(auth, runId);
      if (run && run.workerId) {
        await store.updateGhostWorker(auth, run.workerId, { status: "ACTIVE" }).catch(() => {});
      }
    },
    async recordStepCompleted(stepId, state, strategy, message, outputs) {
      const updates: Partial<ExecutionStepRow> = {
        state, finishedAt: new Date().toISOString(), metadata: { message: message ?? "", outputs }
      };
      if (strategy) updates.strategy = strategy;
      await store.updateExecutionStep(auth, runId, stepId, updates);
    },
    async recordRunState(state, sessionMetadata) {
      await store.updateRunState(auth, runId, state, sessionMetadata);
      const run = await store.getRun(auth, runId);
      if (run && run.workerId) {
        if (state === "WAITING_FOR_HUMAN") {
          await store.updateGhostWorker(auth, run.workerId, { status: "NEEDS_ATTENTION" }).catch(() => {});
        } else if (state === "SUCCEEDED" || state === "FAILED") {
          await store.updateGhostWorker(auth, run.workerId, { status: "ACTIVE" }).catch(() => {});
        }
      }
    },
    async recordHitlPause(stepId, challengeType) {
      const expiresAt = new Date(Date.now() + (hitlTimeoutSeconds * 1000)).toISOString();
      await store.createHitlRequest(auth, { runId, workflowStepId: stepId, challengeType, expiresAt });
      const { sendNotification } = await import("../../api/dist/notifications.js");
      await sendNotification(store, auth, {
        type: "EXCEPTION_CREATED",
        title: "Ghost needs your help",
        body: `Paused on step "${stepId}": ${challengeType}`,
        resourceType: "execution_run",
        resourceId: runId
      });
    },
    async saveCheckpoint(cursor: string, contextState: RuntimeContextState, iterationPath: number[]) {
      await store.saveExecutionCheckpoint(auth, {
        tenantId: auth.tenantId,
        runId: runId,
        workflowVersionId: contextState.executionMetadata.workflowVersionId,
        sequenceNumber: 1, // Will implement proper sequencing if necessary
        cursorJson: JSON.stringify(cursor),
        runtimeContextJson: contextState,
        controlFlowJson: iterationPath,
        sideEffectStateJson: {}
      });
    },
    async loadCheckpoint() {
      const checkpoint = await store.loadExecutionCheckpoint(auth, runId);
      if (checkpoint) {
        return {
          cursor: JSON.parse(checkpoint.cursorJson),
          contextState: checkpoint.runtimeContextJson,
          iterationPath: checkpoint.controlFlowJson
        };
      }
      return null;
    },
    async hasStepCompleted(stepId: string) {
      const steps = await store.listExecutionSteps(auth, runId);
      return steps.some(s => s.stepId === stepId && s.state === "SUCCEEDED");
    }
  };
}

function createV1Persistence(store: AppStore, auth: AuthContext, runId: string, config: any): import("./executor.js").ExecutionPersistence {
  return {
    async recordStepStarted(stepId) {
      await store.createExecutionStep(auth, {
        id: crypto.randomUUID(), tenantId: auth.tenantId, runId, stepId, state: "RUNNING",
        startedAt: new Date().toISOString(), metadata: {}
      });
      const run = await store.getRun(auth, runId);
      if (run && run.workerId) {
        await store.updateGhostWorker(auth, run.workerId, { status: "ACTIVE" }).catch(() => {});
      }
    },
    async recordStepCompleted(stepId, state, strategy, message) {
      const updates: any = {
        state, finishedAt: new Date().toISOString(), metadata: { message: message ?? "" }
      };
      if (strategy) updates.strategy = strategy;
      await store.updateExecutionStep(auth, runId, stepId, updates);
    },
    async recordRunState(state, sessionMetadata) {
      await store.updateRunState(auth, runId, state, sessionMetadata);
      const run = await store.getRun(auth, runId);
      if (run && run.workerId) {
        if (state === "WAITING_FOR_HUMAN") {
          await store.updateGhostWorker(auth, run.workerId, { status: "NEEDS_ATTENTION" }).catch(() => {});
        } else if (state === "SUCCEEDED" || state === "FAILED") {
          await store.updateGhostWorker(auth, run.workerId, { status: "ACTIVE" }).catch(() => {});
        }
      }
    },
    async recordHitlPause(stepId, challengeType) {
      const expiresAt = new Date(Date.now() + (config.hitlSessionTimeoutSeconds * 1000)).toISOString();
      await store.createHitlRequest(auth, { runId, workflowStepId: stepId, challengeType, expiresAt }).catch(() => {});
      try {
        const { sendNotification } = await import("../../api/dist/notifications.js");
        await sendNotification(store, auth, {
          type: "EXCEPTION_CREATED",
          title: "Ghost needs your help",
          body: `Paused on step "${stepId}": ${challengeType}`,
          resourceType: "execution_run",
          resourceId: runId
        });
      } catch (_) {}
    }
  };
}

export async function runQueuedWorkflow(runId: string) {
  const config = loadConfig();
  const store = createStore(config);

  const supabase = (store as any).supabase;
  let runOwner: { tenantId: string; userId: string } | null = null;
  if (supabase) {
    const { data: runData } = await supabase.from("execution_runs").select("tenant_id, created_by").eq("id", runId).maybeSingle();
    if (runData?.tenant_id) {
      runOwner = { tenantId: runData.tenant_id, userId: runData.created_by || "00000000-0000-0000-0000-000000000002" };
    }
  }

  if (!runOwner) {
    logger.error({ run_id: runId }, "Failed to fetch run metadata for worker execution");
    return;
  }

  const auth = { tenantId: runOwner.tenantId, userId: runOwner.userId } as AuthContext;

  logger.info({ run_id: runId, tenant_id: auth.tenantId }, "Worker claimed queued run");

  const run = await store.getRun(auth, runId);
  if (!run) throw new Error(`Run ${runId} not found`);

  // Allow RESUMING from VERIFYING_HANDOFF, RESUMING, or WAITING_FOR_HUMAN / RUNNING with hitl_resolved
  const isResuming = run.state === "VERIFYING_HANDOFF" || 
                     run.state === "RESUMING" || 
                     ((run.state === "WAITING_FOR_HUMAN" || run.state === "RUNNING") && Boolean((run.metadata as any)?.hitl_resolved));

  if (isResuming) {
    await store.updateRunState(auth, runId, "RESUMING");
    await store.updateRunState(auth, runId, "RUNNING");
  } else if (run.state !== "QUEUED" && run.state !== "STARTING") {
    return;
  } else {
    if (run.state === "QUEUED") {
      const claimed = await store.claimRun(auth, runId);
      if (!claimed) throw new Error(`Unable to claim run ${runId}`);
    } else {
      await store.updateRunState(auth, runId, "RUNNING");
    }
  }

  const workflowVersion = await store.getWorkflowVersion(auth, run.workflowVersionId);
  if (!workflowVersion) {
    await store.updateRunState(auth, runId, "FAILED");
    throw new Error(`Workflow version ${run.workflowVersionId} not found`);
  }

  // Check version to route to V2 or V1
  if ((workflowVersion.workflow as any).workflow_version === "2.0") {
    // V2 RUNTIME ENGINE
    try {
      const workflow = workflowVersion.workflow as unknown as WorkflowV2;
      const stepCount = workflow.root_step?.children?.length ?? (workflow as any)?.steps?.length ?? 0;
      
      logger.info({
        run_id: runId,
        workflow_version_id: workflowVersion.id,
        step_count: stepCount
      }, "EXECUTION_STARTING_CHECK");

      if (stepCount === 0) {
        logger.error({ run_id: runId, workflow_version_id: workflowVersion.id }, "WORKFLOW_EMPTY: Workflow contains zero executable steps");
        await store.updateRunState(auth, runId, "FAILED", {
          error: "WORKFLOW_EMPTY: Workflow contains no executable steps. Please provide an SOP or instructions with actionable steps."
        });
        if (run.workerId) {
          await store.updateGhostWorker(auth, run.workerId, { status: "NEEDS_ATTENTION" }).catch(() => {});
        }
        return;
      }

      const planner = new ExecutionPlanner();
      const plan = planner.createPlan(workflowVersion.id, workflow);
      
      const persistence = createV2Persistence(store, auth, runId, config.hitlSessionTimeoutSeconds);
      
      const bbProvider = new BrowserbaseExecutionProvider({
        browserbaseApiKey: config.browserbaseApiKey,
        browserbaseProjectId: config.browserbaseProjectId,
      });
      const browserExecutor = new V2BrowserExecutor(bbProvider, async (session) => {
        logger.info({ run_id: runId, local: session.local, has_debugger_url: Boolean(session.debuggerUrl) }, "Browser session ready");
        if (session.local) {
          // No real Browserbase session to link to — the fix here is that the local
          // browser now launches headed (visible) by default, so there's a real window
          // to look at on the worker machine instead of a session URL to click.
          return;
        }
        // This populates `execution_runs.provider_session_id`, which the API's
        // take-control route already turns into a working Browserbase live-view URL —
        // it just never had a session ID to work with before now.
        await store.updateRunState(auth, runId, "RUNNING", {
          providerSessionId: session.id,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt
        });
      }, persistence);

      const hitlRequests = await store.listHitlRequests(auth);
      const runHitls = hitlRequests.filter(h => h.runId === runId && h.state === "RESOLVED");
      
      const inputs: any = { ...((run.metadata as any)?.inputs ?? {}) };
      for (const h of runHitls) {
        const hitl = h as any;
        if (hitl.metadata?.response) {
           inputs[`hitl_response_${hitl.workflowStepId}`] = hitl.metadata.response;
        }
      }

      const humanExec = new HumanExecutor();
      console.log("[WORKER] HumanExecutor canExecute test:", humanExec.canExecute({ target: "DATA", operation: "REQUIRE_APPROVAL" } as any));
      const runtime = new WorkflowRuntime(plan, persistence, [
        humanExec,
        new DataExecutor(),
        new ApiExecutor(),
        new OutputExecutor(),
        new DesktopComputerExecutor(),
        browserExecutor
      ], {
        inputs,
        variables: {},
        outputs: {},
        artifacts: {},
        scopes: [],
        executionMetadata: {
          runId,
          tenantId: run.tenantId,
          workflowVersionId: run.workflowVersionId,
          ...(run.workerId ? { workerId: run.workerId } : {}),
          ...(run.runMode ? { runMode: run.runMode } : {})
        }
      });
      
      await runtime.start();
      
      const runtimeState = runtime.getContext().getState();
      const universalResult = runtimeState.outputs.universal_execution_result;
      const contract = workflow.output_contract;

      let finalRun = await store.getRun(auth, runId);
      let targetState = finalRun?.state || "FAILED";

      // SEPARATION OF ACTION_SUCCESS VS TASK_SUCCESS:
      // If the contract requires an output deliverable, the task can ONLY succeed
      // if the deliverable was actually generated, verified, and delivered!
      if (contract && contract.output_required) {
        if (!universalResult) {
          logger.warn({ run_id: runId }, "TASK FAILED: Operational steps completed but universal_execution_result was missing.");
          targetState = "FAILED";
        } else if (universalResult.status === "OUTPUT_GENERATION_FAILED" || universalResult.status === "OUTPUT_VERIFICATION_FAILED") {
          logger.warn({ run_id: runId, output_status: universalResult.status }, "TASK FAILED: Output deliverable verification failed.");
          targetState = "FAILED";
        } else if (universalResult.status === "COMPLETED" && (targetState === "RUNNING" || targetState === "SUCCEEDED")) {
          targetState = "SUCCEEDED";
        }
      }

      const resultSummary = universalResult || {
        outputs: runtimeState.outputs,
        status: targetState
      };

      logger.info({ run_id: runId, final_state: targetState, has_universal_result: Boolean(universalResult) }, "V2 Execution completed with outcome");

      if (targetState !== "WAITING_FOR_HUMAN") {
        await store.updateRunState(auth, runId, targetState, { 
          resultSummary,
          metadata: { resultSummary }
        });
      } else {
        logger.info({ run_id: runId }, "V2 Execution skipping update since state is WAITING_FOR_HUMAN");
      }
      
      if (targetState === "FAILED" || targetState === "SUCCEEDED") {
        const notifType = run.runMode === "TEST"
          ? "TEST_COMPLETED"
          : (targetState === "SUCCEEDED" ? "RUN_COMPLETED" : "RUN_FAILED");
        const { sendNotification } = await import("../../api/dist/notifications.js");
        await sendNotification(store, auth, {
          type: notifType,
          title: `Ghost ${run.runMode === "TEST" ? "test run" : "execution"} ${targetState.toLowerCase()}`,
          body: `Your ghost has completed its task with status: ${targetState}.`,
          resourceType: "execution_run",
          resourceId: runId
        });
        logger.info({ runId }, `Sent notification for state ${targetState}`);
      }

      await browserExecutor.cleanup();
      return;
    } catch (err: any) {
      logger.error({ err, run_id: runId }, "V2 Execution failed (caught in worker)");
      await store.updateRunState(auth, runId, "FAILED", { error: err.message });
      const { sendNotification } = await import("../../api/dist/notifications.js");
      await sendNotification(store, auth, {
        type: run.runMode === "TEST" ? "TEST_COMPLETED" : "RUN_FAILED",
        title: `Ghost ${run.runMode === "TEST" ? "test run" : "execution"} FAILED`,
        body: `Execution ${runId.substring(0, 8)} threw an error: ${err.message}`,
        resourceType: "execution_run",
        resourceId: runId
      });
    }
    
    // Add debug log to see if it even reaches here and what finalRun actually is!
    const testGetRun = await store.getRun(auth, runId);
    logger.info({ run_id: runId, current_db_state: testGetRun?.state }, "V2 execution end of block check");
    
    return;
  }

  // V1 RUNTIME ENGINE (Legacy)
  const workflow = validateWorkflow(workflowVersion.workflow) as import("@ghost/workflow-schema").Workflow;
  const existingSteps = await store.listExecutionSteps(auth, runId);
  const completedStepIds = new Set(existingSteps.filter(s => s.state === "SUCCEEDED").map(s => s.stepId));
  const remainingSteps = workflow.steps.filter(s => !completedStepIds.has(s.id));

  if (remainingSteps.length === 0) {
    await store.updateRunState(auth, runId, "SUCCEEDED");
    logger.info({ run_id: runId }, "All steps already completed on resume");
    return;
  }

  const provider = new BrowserbaseExecutionProvider(config as any);
  const persistence = createV1Persistence(store, auth, runId, config);

  try {
    const resumeWorkflow = { ...workflow, steps: remainingSteps };
    const results = await executeWorkflowWithBrowserbase(provider, resumeWorkflow, persistence);
    const finalState = results.some(e => e.state === "WAITING_FOR_HUMAN") ? "WAITING_FOR_HUMAN"
      : results.every(e => e.state === "SUCCEEDED") ? "SUCCEEDED" : "FAILED";
    await store.updateRunState(auth, runId, finalState);
    logger.info({ run_id: runId, final_state: finalState }, "V1 Execution completed");
  } catch (err) {
    logger.error({ err, run_id: runId }, "V1 Execution failed");
    await store.updateRunState(auth, runId, "FAILED");
  }
}
