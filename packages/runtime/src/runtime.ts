import type { WorkflowV2Step } from "@ghost/workflow-schema";
import { RuntimeContext, type RuntimeContextState } from "./context.js";
import { ControlFlowEngine } from "./control-flow.js";
import type { ExecutionPlan } from "./planner.js";
import type { ExecutionCapability, ExecutionResult } from "./executors/index.js";

export interface ExecutionPersistence {
  recordStepStarted(stepId: string): Promise<void>;
  recordStepCompleted(stepId: string, state: string, strategy?: string, message?: string, outputs?: any): Promise<void>;
  recordRunState(state: string, sessionMetadata?: any): Promise<void>;
  recordHitlPause(stepId: string, challengeType: string): Promise<void>;
  saveCheckpoint(cursor: string, contextState: RuntimeContextState, iterationPath: number[]): Promise<void>;
  loadCheckpoint(): Promise<{ cursor: string; contextState: RuntimeContextState; iterationPath: number[] } | null>;
  hasStepCompleted(stepId: string): Promise<boolean>;
  /** Last recorded state of a step fingerprint (e.g. RUNNING if a crash interrupted it). */
  getStepState?(stepId: string): Promise<string | undefined>;
  /** Returns a reason when the run must stop (cancelled, superseded, timed out); checked before every step. */
  shouldStop?(): Promise<string | null>;
}

/** Thrown when the run was stopped externally; no further step may execute. */
export class RunStoppedError extends Error {
  constructor(public readonly reason: string) {
    super(`Run stopped: ${reason}`);
    this.name = "RunStoppedError";
  }
}

/** Operations that change state outside the runtime; they are never retried automatically after an interruption. */
const SIDE_EFFECT_OPERATIONS = new Set([
  "CLICK", "TYPE", "SELECT", "PRESS_KEY", "HOTKEY", "SUBMIT", "UPLOAD", "UPLOAD_FILE", "DOWNLOAD", "CALL_API", "CALL_MCP", "ACT",
  "SAVE_FILE", "PASTE", "DRAG", "DOUBLE_CLICK", "RIGHT_CLICK"
]);

function isSideEffecting(step: WorkflowV2Step): boolean {
  return Boolean(step.args?.irreversible) || SIDE_EFFECT_OPERATIONS.has(step.operation) || String(step.operation).startsWith("DESKTOP_") && !/READ|SCREENSHOT|WAIT|ASSERT|FOCUS/.test(step.operation);
}

export class WorkflowRuntime {
  private context: RuntimeContext;
  private controlFlow = new ControlFlowEngine();
  private cursor: string = "";
  private resumeIterationPath: number[] = [];
  private iterationPath: number[] = [];
  private isResuming = false;

  private initialInputs: Record<string, any>;

  constructor(
    private plan: ExecutionPlan,
    private persistence: ExecutionPersistence,
    private capabilities: ExecutionCapability[],
    initialContextState?: RuntimeContextState,
    private retryDelayMs: number = 1000
  ) {
    this.initialInputs = { ...(initialContextState?.inputs || {}) };
    this.context = new RuntimeContext(initialContextState || {
      inputs: {}, variables: {}, outputs: {}, artifacts: {}, scopes: [],
      executionMetadata: { runId: "", tenantId: "", workflowVersionId: plan.workflowVersionId }
    });
  }

  public getContext(): RuntimeContext {
    return this.context;
  }

  public async start(): Promise<void> {
    const checkpoint = await this.persistence.loadCheckpoint();
    if (checkpoint) {
      this.isResuming = true;
      this.cursor = checkpoint.cursor;
      this.resumeIterationPath = checkpoint.iterationPath;
      this.iterationPath = [];
      // Inputs supplied for this attempt (HITL decisions, provided values) take precedence over the
      // inputs captured when the checkpoint was written; otherwise an approval would be lost on resume.
      this.context = new RuntimeContext({
        ...checkpoint.contextState,
        inputs: { ...(checkpoint.contextState?.inputs || {}), ...this.initialInputs }
      });
    }

    await this.persistence.recordRunState("RUNNING");

    try {
      console.log(`[WorkflowRuntime] Starting execution...`);
      const result = await this.executeNode(this.plan.workflow.root_step);
      console.log(`[WorkflowRuntime] Root node execution finished with result:`, result);

      if (result.state === "PAUSED_FOR_HUMAN") {
        console.log(`[WorkflowRuntime] Paused for human, recording WAITING_FOR_HUMAN...`);
        await this.persistence.recordRunState("WAITING_FOR_HUMAN");
        console.log(`[WorkflowRuntime] Successfully recorded WAITING_FOR_HUMAN.`);
        // Pause propagated up, stop execution
        return;
      }

      console.log(`[WorkflowRuntime] Recording terminal run state:`, result.state);
      await this.persistence.recordRunState(result.state);
    } catch (e: any) {
      if (e instanceof RunStoppedError) {
        // The run was stopped externally (its state is already terminal); record nothing further.
        console.log(`[WorkflowRuntime] ${e.message}`);
        this.stopReason = e.reason;
        return;
      }
      console.error(`[WorkflowRuntime] Execution caught an error!`, e);
      await this.persistence.recordRunState("FAILED", { error: e.message });
    }
  }

  /** Set when execution ended because the run was stopped externally. */
  public stopReason: string | null = null;

  private async executeNode(step: WorkflowV2Step): Promise<ExecutionResult> {
    const fingerprint = this.getStepFingerprint(step.id);
    // If we are resuming, and this step isn't in the path, skip it or dive into it
    // For exact resumability, we check if side-effects completed.
    const alreadyCompleted = await this.persistence.hasStepCompleted(fingerprint);
    if (alreadyCompleted) {
      return { state: "SUCCEEDED" };
    }

    if (step.operation === "SEQUENCE") {
      for (const child of step.children || []) {
        const res = await this.executeNode(child);
        if (res.state !== "SUCCEEDED") return res;
      }
      return { state: "SUCCEEDED" };
    }

    if (step.operation === "FOR_EACH") {
      const items = this.controlFlow.getCollectionForLoop(step, this.context);
      const itemName = (step.args || {}).item_name || "item";

      // Determine start index from iterationPath if resuming
      let startIndex = 0;
      if (this.isResuming && this.cursor === step.id && this.resumeIterationPath.length > 0) {
        startIndex = this.resumeIterationPath[0]!;
      }

      for (let i = startIndex; i < items.length; i++) {
        this.context.pushScope({ [itemName]: items[i], [`${itemName}_index`]: i });
        this.iterationPath.push(i);

        for (const child of step.children || []) {
          const res = await this.executeNode(child);
          if (res.state === "PAUSED_FOR_HUMAN") {
            // Save checkpoint before pausing
            await this.persistence.saveCheckpoint(step.id, this.context.getState(), [...this.iterationPath]);
            return res;
          }
          if (res.state === "FAILED") {
            const policy = step.failure_policy?.on_failure || "FAIL";
            if (policy === "SKIP_ITEM") {
              break; // Skip rest of children for this item, continue loop
            } else {
              return res;
            }
          }
        }

        this.iterationPath.pop();
        this.context.popScope();

        // Periodic checkpoint after each item to prevent massive re-runs
        await this.persistence.saveCheckpoint(step.id, this.context.getState(), [i + 1]);
      }
      return { state: "SUCCEEDED" };
    }

    if (step.operation === "IF") {
      const conditionMet = this.controlFlow.evaluateCondition(step, this.context);
      if (conditionMet && step.children && step.children.length > 0) {
        // Assume first child is the IF branch (simplification for AST layout)
        return this.executeNode(step.children[0]!);
      } else if (!conditionMet && step.children && step.children.length > 1) {
        // Assume second child is the ELSE branch
        return this.executeNode(step.children[1]!);
      }
      return { state: "SUCCEEDED" };
    }

    // Standard leaf capability execution
    return this.executeLeaf(step);
  }

  private getStepFingerprint(stepId: string): string {
    if (this.iterationPath.length === 0) return stepId;
    return `${stepId}_${this.iterationPath.join("_")}`;
  }

  private async executeLeaf(step: WorkflowV2Step): Promise<ExecutionResult> {
    if (this.persistence.shouldStop) {
      const reason = await this.persistence.shouldStop();
      if (reason) throw new RunStoppedError(reason);
    }

    const capability = this.capabilities.find(c => c.canExecute(step, this.context));

    if (!capability) {
      return { state: "FAILED", message: `No capability registered for target ${step.target} / ${step.operation}` };
    }

    const fingerprint = this.getStepFingerprint(step.id);
    const decision = this.context.get(`hitl_response_${step.id}`);

    // A human confirmed this step already happened (e.g. performed manually during takeover).
    if (decision?.action === "PROVIDE_VALUE" && decision.value === "ALREADY_DONE") {
      await this.persistence.recordStepCompleted(fingerprint, "SUCCEEDED", "HUMAN_CONFIRMED", "Confirmed complete by a human operator");
      return { state: "SUCCEEDED" };
    }

    // A side-effecting step that started but never recorded an outcome may already have taken
    // effect. Repeating it blindly could duplicate the change, so a human must confirm first.
    if (!decision && isSideEffecting(step) && this.persistence.getStepState) {
      const prior = await this.persistence.getStepState(fingerprint);
      if (prior === "RUNNING") {
        const message = `Step "${step.description}" was interrupted before its outcome was recorded. Confirm whether it took effect (ALREADY_DONE) or approve a retry.`;
        await this.persistence.recordStepCompleted(fingerprint, "PAUSED_FOR_HUMAN", step.target, message);
        await this.persistence.recordHitlPause(step.id, "INTERRUPTED_SIDE_EFFECT_UNVERIFIED");
        await this.persistence.saveCheckpoint(step.id, this.context.getState(), [...this.iterationPath]);
        return { state: "PAUSED_FOR_HUMAN", hitlReason: "INTERRUPTED_SIDE_EFFECT_UNVERIFIED", message };
      }
    }

    await this.persistence.recordStepStarted(fingerprint);

    // Bounded automatic retries for failures of steps that are safe to repeat.
    const retryLimit = step.args?.irreversible ? 0 : Math.max(0, Math.min(step.failure_policy?.retry_limit ?? 0, 5));
    let result: ExecutionResult = { state: "FAILED", message: "Step did not run" };
    for (let attempt = 0; attempt <= retryLimit; attempt++) {
      try {
        result = await capability.execute(step, this.context);
      } catch (e: any) {
        if (e.name === "MissingVariableError") {
          result = {
            state: "PAUSED_FOR_HUMAN",
            hitlReason: "MISSING_RUNTIME_VALUE",
            message: e.message
          };
        } else {
          result = { state: "FAILED", message: e.message };
        }
      }
      if (result.state !== "FAILED" || attempt === retryLimit) break;
      await new Promise(r => setTimeout(r, this.retryDelayMs * Math.pow(2, attempt)));
    }

    if (result.state === "SUCCEEDED") {
      if (step.bind_result_to && result.outputs) {
        this.context.set(step.bind_result_to, result.outputs);
      }
      if (result.outputs) {
        for (const [k, v] of Object.entries(result.outputs)) {
          this.context.set(k, v);
        }
      }
      await this.persistence.recordStepCompleted(fingerprint, "SUCCEEDED", step.target, result.message, result.outputs);

      if (step.operation === "CHECKPOINT") {
        await this.persistence.saveCheckpoint(step.id, this.context.getState(), [...this.iterationPath]);
      }
    } else if (result.state === "PAUSED_FOR_HUMAN" || step.failure_policy?.on_failure === "PAUSE_FOR_HUMAN") {
      result.state = "PAUSED_FOR_HUMAN";
      await this.persistence.recordStepCompleted(fingerprint, "PAUSED_FOR_HUMAN", step.target, result.message);
      await this.persistence.recordHitlPause(step.id, result.hitlReason || "STEP_FAILURE_POLICY_PAUSE");
      await this.persistence.saveCheckpoint(step.id, this.context.getState(), [...this.iterationPath]);
    } else {
      // Failure evidence (e.g. which success criteria were not met) stays available to the caller.
      if (result.outputs) {
        for (const [k, v] of Object.entries(result.outputs)) this.context.set(k, v);
      }
      await this.persistence.recordStepCompleted(fingerprint, "FAILED", step.target, result.message, result.outputs);
    }

    return result;
  }
}
