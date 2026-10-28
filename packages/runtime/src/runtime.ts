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
}

export class WorkflowRuntime {
  private context: RuntimeContext;
  private controlFlow = new ControlFlowEngine();
  private cursor: string = "";
  private resumeIterationPath: number[] = [];
  private iterationPath: number[] = [];
  private isResuming = false;

  constructor(
    private plan: ExecutionPlan,
    private persistence: ExecutionPersistence,
    private capabilities: ExecutionCapability[],
    initialContextState?: RuntimeContextState
  ) {
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
      this.context = new RuntimeContext(checkpoint.contextState);
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
      console.error(`[WorkflowRuntime] Execution caught an error!`, e);
      await this.persistence.recordRunState("FAILED", { error: e.message });
    }
  }

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
    const capability = this.capabilities.find(c => c.canExecute(step, this.context));

    if (!capability) {
      return { state: "FAILED", message: `No capability registered for target ${step.target} / ${step.operation}` };
    }

    const fingerprint = this.getStepFingerprint(step.id);
    await this.persistence.recordStepStarted(fingerprint);

    let result: ExecutionResult;
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
      await this.persistence.recordStepCompleted(fingerprint, "FAILED", step.target, result.message);
    }

    return result;
  }
}
