import { loadConfig } from "../../api/dist/config.js";
import { createStore, type AppStore, type ExecutionStepRow } from "../../api/dist/store.js";
import { BrowserbaseExecutionProvider } from "./browserbase.js";
import { executeWorkflowWithBrowserbase } from "./executor.js";
import { logger } from "@ghost/observability";
import { validateWorkflow, assessExecutionReadiness, type WorkflowV2 } from "@ghost/workflow-schema";
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

/**
 * States in which no further step may execute. WAITING_FOR_HUMAN and PAUSING cover an operator's
 * manual pause: the step in progress finishes, then execution stops until a decision resumes it.
 */
const STOP_STATES = new Set(["CANCELLED", "FAILED", "TIMED_OUT", "SUCCEEDED", "WAITING_FOR_HUMAN", "PAUSING"]);

/**
 * Browser sessions of runs paused for a human, kept so a resume continues on the same page
 * (with its filled-in fields) instead of a blank browser. Bounded by the HITL timeout.
 */
const pausedSessions = new Map<string, { executor: V2BrowserExecutor; timer: NodeJS.Timeout }>();

function parkSession(runId: string, executor: V2BrowserExecutor, ttlSeconds: number): void {
  const timer = setTimeout(() => {
    pausedSessions.delete(runId);
    void executor.cleanup().catch(() => {});
  }, Math.max(60, ttlSeconds) * 1000);
  timer.unref?.();
  pausedSessions.set(runId, { executor, timer });
}

function takeParkedSession(runId: string): V2BrowserExecutor | undefined {
  const parked = pausedSessions.get(runId);
  if (!parked) return undefined;
  clearTimeout(parked.timer);
  pausedSessions.delete(runId);
  return parked.executor;
}

type V2Persistence = V2ExecutionPersistence & { terminalState?: string; terminalMetadata?: any };

/**
 * The runtime reports SUCCEEDED/FAILED through this persistence, but the final run state is
 * written once by the worker after outcome verification, so a run cannot be marked successful
 * before its result has been checked.
 */
function createV2Persistence(store: AppStore, auth: AuthContext, runId: string, hitlTimeoutSeconds: number): V2Persistence {
  const persistence: V2Persistence = {
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
      if (state === "SUCCEEDED" || state === "FAILED") {
        persistence.terminalState = state;
        persistence.terminalMetadata = sessionMetadata;
        return;
      }
      await store.updateRunState(auth, runId, state, sessionMetadata);
      const run = await store.getRun(auth, runId);
      if (run && run.workerId && state === "WAITING_FOR_HUMAN") {
        await store.updateGhostWorker(auth, run.workerId, { status: "NEEDS_ATTENTION" }).catch(() => {});
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
    },
    async getStepState(stepId: string) {
      const steps = await store.listExecutionSteps(auth, runId);
      const matching = steps.filter(s => s.stepId === stepId);
      return matching.length ? matching[matching.length - 1]!.state : undefined;
    },
    async shouldStop() {
      const run = await store.getRun(auth, runId);
      if (!run) return "Run no longer exists";
      return STOP_STATES.has(run.state) ? `Run is ${run.state}` : null;
    }
  };
  return persistence;
}

export type OutcomeClassification = "VERIFIED_SUCCESS" | "PARTIAL_COMPLETION" | "WAITING_FOR_HUMAN" | "FAILED" | "UNABLE_TO_VERIFY";

/**
 * Classifies a finished run by comparing what was expected with what was observed.
 * Executing every step is not success: success requires the workflow success criteria to have
 * been checked against the live application.
 */
export function classifyOutcome(input: {
  runtimeState: string | undefined;
  workflow: WorkflowV2;
  outputs: Record<string, any>;
  stepStates: Array<{ stepId: string; state: string }>;
  outputContractFailed?: string | undefined;
}): { classification: OutcomeClassification; runState: "SUCCEEDED" | "FAILED" | "WAITING_FOR_HUMAN"; reason: string } {
  const criteria = Array.isArray((input.workflow as any).success_criteria) ? (input.workflow as any).success_criteria : [];
  const verification = input.outputs?.outcome_verification;
  const actionOps = new Set(["CLICK", "TYPE", "SELECT", "PRESS_KEY", "SUBMIT", "CALL_API", "CALL_MCP"]);
  const actionStepIds: string[] = [];
  const walk = (step: any) => {
    if (step?.children?.length) step.children.forEach(walk);
    else if (step && (actionOps.has(step.operation) || String(step.operation).startsWith("DESKTOP_"))) actionStepIds.push(step.id);
  };
  walk(input.workflow.root_step);
  const completedActions = input.stepStates.filter(s => s.state === "SUCCEEDED" && actionStepIds.some(id => s.stepId === id || s.stepId.startsWith(`${id}_`))).length;

  if (input.runtimeState === "WAITING_FOR_HUMAN") {
    return { classification: "WAITING_FOR_HUMAN", runState: "WAITING_FOR_HUMAN", reason: "Execution is paused for a human decision." };
  }
  if (input.runtimeState !== "SUCCEEDED") {
    if (verification && verification.verified === false) {
      return { classification: "FAILED", runState: "FAILED", reason: "The application did not reach the expected end state." };
    }
    return completedActions > 0
      ? { classification: "PARTIAL_COMPLETION", runState: "FAILED", reason: `${completedActions} action step(s) took effect before the run stopped.` }
      : { classification: "FAILED", runState: "FAILED", reason: "The run failed before any action took effect." };
  }
  if (input.outputContractFailed) {
    return { classification: "FAILED", runState: "FAILED", reason: input.outputContractFailed };
  }
  if (criteria.length) {
    if (verification?.verified === true) {
      return { classification: "VERIFIED_SUCCESS", runState: "SUCCEEDED", reason: "All success criteria were observed in the application." };
    }
    return { classification: "UNABLE_TO_VERIFY", runState: "SUCCEEDED", reason: "Success criteria exist but were not checked during execution." };
  }
  return { classification: "UNABLE_TO_VERIFY", runState: "SUCCEEDED", reason: "All steps executed, but the workflow defines no observable success condition, so the outcome is unverified." };
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

export interface RunDependencies {
  /** Store to use instead of the configured one (in-process execution, tests). */
  store?: AppStore;
  /** Tenant and user owning the run when it cannot be looked up from Supabase. */
  owner?: { tenantId: string; userId: string };
  /** Browser provider to use instead of the configured Browserbase/local provider. */
  browserProvider?: BrowserbaseExecutionProvider;
}

export async function runQueuedWorkflow(runId: string, deps: RunDependencies = {}) {
  const config = loadConfig();
  const store = deps.store ?? createStore(config);

  const supabase = (store as any).supabase;
  let runOwner: { tenantId: string; userId: string } | null = deps.owner ?? null;
  if (!runOwner && supabase) {
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

      const runInputs: Record<string, any> = { ...((run.metadata as any)?.inputs ?? {}) };
      const readiness = assessExecutionReadiness(workflow, { inputs: runInputs });
      if (!readiness.executable) {
        const blocking = readiness.issues.filter(i => i.severity === "BLOCKING");
        logger.error({ run_id: runId, workflow_version_id: workflowVersion.id, issues: blocking }, "WORKFLOW_NOT_EXECUTABLE");
        await store.updateRunState(auth, runId, "FAILED", {
          resultSummary: { outcome: { classification: "FAILED", reason: "Workflow is not executable", issues: blocking } }
        });
        return;
      }

      const planner = new ExecutionPlanner();
      const plan = planner.createPlan(workflowVersion.id, workflow);
      
      // The organisation's approval-timeout policy, when set, overrides the deployment default.
      const orgSettings = await store.getOrgSettings(auth).catch(() => ({} as Record<string, any>));
      const policyMinutes = Number(orgSettings?.policies?.hitlTimeoutMinutes);
      const hitlTimeoutSeconds = Number.isFinite(policyMinutes) && policyMinutes > 0 ? policyMinutes * 60 : config.hitlSessionTimeoutSeconds;
      const persistence = createV2Persistence(store, auth, runId, hitlTimeoutSeconds);
      
      const bbProvider = deps.browserProvider ?? new BrowserbaseExecutionProvider({
        browserbaseApiKey: config.browserbaseApiKey,
        browserbaseProjectId: config.browserbaseProjectId,
      });
      const browserExecutor = takeParkedSession(runId) ?? new V2BrowserExecutor(bbProvider, async (session) => {
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

      // Recorded human decisions for this run are handed to the paused steps on resume.
      const hitlRequests = await store.listHitlRequests(auth);
      const inputs: any = { ...runInputs };
      for (const hitl of hitlRequests.filter(h => h.runId === runId && h.state === "RESOLVED" && h.decision && h.workflowStepId)) {
        inputs[`hitl_response_${hitl.workflowStepId}`] = { action: hitl.decision, value: hitl.decisionPayload?.value, decidedAt: hitl.decidedAt };
      }

      const humanExec = new HumanExecutor();
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
      const pausedNow = (await store.getRun(auth, runId))?.state === "WAITING_FOR_HUMAN";
      if (pausedNow) parkSession(runId, browserExecutor, hitlTimeoutSeconds);
      else await browserExecutor.cleanup().catch(() => {});

      if (runtime.stopReason) {
        logger.info({ run_id: runId, reason: runtime.stopReason }, "V2 execution stopped externally; no further steps executed");
        return;
      }

      const runtimeState = runtime.getContext().getState();
      const universalResult = runtimeState.outputs.universal_execution_result;
      const contract = workflow.output_contract;
      const current = await store.getRun(auth, runId);
      const reportedState = current?.state === "WAITING_FOR_HUMAN" ? "WAITING_FOR_HUMAN" : persistence.terminalState;

      let outputContractFailed: string | undefined;
      if (contract?.output_required && reportedState === "SUCCEEDED") {
        if (!universalResult) outputContractFailed = "The required output deliverable was not produced.";
        else if (universalResult.status !== "COMPLETED") outputContractFailed = `Output deliverable status: ${universalResult.status}`;
      }

      const stepStates = (await store.listExecutionSteps(auth, runId)).map(s => ({ stepId: s.stepId, state: s.state }));
      const outcome = classifyOutcome({
        runtimeState: reportedState,
        workflow,
        outputs: { ...runtimeState.variables, ...runtimeState.outputs },
        stepStates,
        outputContractFailed
      });

      const resultSummary = {
        ...(universalResult || {}),
        outcome: {
          classification: outcome.classification,
          reason: outcome.reason,
          expected: (workflow as any).success_criteria || [],
          observed: runtimeState.variables?.outcome_verification || runtimeState.outputs?.outcome_verification || null,
          failure: persistence.terminalMetadata?.error
        },
        workflow_version_id: workflowVersion.id
      };

      logger.info({ run_id: runId, classification: outcome.classification, final_state: outcome.runState }, "V2 execution finished");

      if (outcome.runState === "WAITING_FOR_HUMAN") {
        return;
      }
      await store.updateRunState(auth, runId, outcome.runState, { resultSummary, metadata: { resultSummary } });
      if (run.workerId) {
        await store.updateGhostWorker(auth, run.workerId, { status: "ACTIVE" }).catch(() => {});
      }

      const notifType = run.runMode === "TEST"
        ? "TEST_COMPLETED"
        : (outcome.runState === "SUCCEEDED" ? "RUN_COMPLETED" : "RUN_FAILED");
      const { sendNotification } = await import("../../api/dist/notifications.js");
      await sendNotification(store, auth, {
        type: notifType,
        title: `Ghost ${run.runMode === "TEST" ? "test run" : "execution"} ${outcome.runState.toLowerCase()}`,
        body: `Outcome: ${outcome.classification.replace(/_/g, " ").toLowerCase()}. ${outcome.reason}`,
        resourceType: "execution_run",
        resourceId: runId
      });
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
