/**
 * Execution State Machine (ESM)
 * 
 * The supervisory bridge between Ghost's intelligence layer and execution layer.
 * Wraps around the mechanical workflow executor and provides:
 * 
 * 1. Pre-execution risk assessment (intelligence → execution)
 * 2. Post-execution observation capture (execution → intelligence)
 * 3. Formal state transitions with typed guards
 * 4. Recovery strategy selection on failure
 * 5. Complete execution trace for audit
 * 
 * INVARIANTS:
 * 1. Every state transition is validated against the transition table.
 * 2. Every observation references real OIR evidence IDs.
 * 3. The ESM never fabricates evidence, nodes, or variables.
 * 4. ESCALATE_TO_HUMAN is always available as a recovery option.
 * 5. Terminal states (COMPLETED, FAILED) cannot transition further.
 */

import { OirGraph } from "../types.js";
import { OperationalUnderstanding } from "../reasoner/types.js";
import { SemanticUnderstanding } from "../semantic/types.js";
import { collectValidEvidenceIds } from "../intelligence/oir-serializer.js";
import { assessStepRisk, StepDescriptor } from "./engines/risk-assessor.js";
import { selectRecoveryStrategy } from "./engines/recovery-selector.js";
import {
  ExecutionState,
  VALID_TRANSITIONS,
  ExecutionObservation,
  ExecutionDecision,
  ExecutionTrace,
  ExecutionTraceEntry,
  StepRiskAssessment,
  RecoveryDecision
} from "./types.js";

// ─── ESM Configuration ─────────────────────────────────────────────────────

export interface ESMConfig {
  /** Maximum recovery attempts per step before escalating */
  maxRecoveryAttempts: number;
  /** Minimum confidence threshold for auto-proceeding on risk */
  riskConfidenceThreshold: number;
  /** Risk levels that require human approval */
  humanApprovalRiskLevels: ("HIGH" | "CRITICAL")[];
  /** Whether to abort on CRITICAL risk assessment */
  abortOnCriticalRisk: boolean;
}

const DEFAULT_CONFIG: ESMConfig = {
  maxRecoveryAttempts: 3,
  riskConfidenceThreshold: 0.6,
  humanApprovalRiskLevels: ["CRITICAL"],
  abortOnCriticalRisk: false
};

// ─── Step Executor Interface ────────────────────────────────────────────────

/**
 * Interface for the mechanical executor that the ESM supervises.
 * The ESM does not execute steps directly — it delegates to this interface.
 */
export interface StepExecutor {
  execute(step: StepDescriptor): Promise<{
    succeeded: boolean;
    outputs?: Record<string, any>;
    error?: { type: string; message: string; isTransient: boolean; isRecoverable: boolean };
    sideEffectsDetected?: string[];
    durationMs: number;
  }>;
}

// ─── Execution State Machine ────────────────────────────────────────────────

export class ExecutionStateMachine {
  private state: ExecutionState = "READY";
  private trace: ExecutionTraceEntry[] = [];
  private riskAssessments: Map<string, StepRiskAssessment> = new Map();
  private recoveryAttempts: Map<string, number> = new Map();
  private validIds: Set<string>;

  constructor(
    private graph: OirGraph,
    private operationalUnderstanding: OperationalUnderstanding,
    private semanticUnderstanding: SemanticUnderstanding,
    private executor: StepExecutor,
    private config: ESMConfig = DEFAULT_CONFIG
  ) {
    this.validIds = collectValidEvidenceIds(graph);
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  /**
   * Get the current state of the ESM.
   */
  public getState(): ExecutionState {
    return this.state;
  }

  /**
   * Get the complete execution trace.
   */
  public getTrace(): ExecutionTrace {
    const completedAt = this.isTerminal() ? new Date().toISOString() : undefined;
    return {
      workflowId: this.graph.rootNodeId || "unknown",
      startedAt: this.trace.length > 0 ? this.trace[0]!.timestamp : new Date().toISOString(),
      ...(completedAt ? { completedAt } : {}),
      finalState: this.state,
      entries: [...this.trace],
      totalObservations: this.trace.filter(e => e.observation).length,
      totalRecoveries: this.trace.filter(e => e.decision?.decision === "RECOVER").length,
      totalHumanEscalations: this.trace.filter(e => e.toState === "PAUSED").length
    };
  }

  /**
   * Check if the ESM is in a terminal state.
   */
  public isTerminal(): boolean {
    return this.state === "COMPLETED" || this.state === "FAILED";
  }

  /**
   * Execute a single step through the full ESM lifecycle:
   * PRE_ANALYSIS → EXECUTING → OBSERVING → ASSESSING → DECIDING → (RECOVERING?) → next state
   */
  public async executeStep(step: StepDescriptor): Promise<ExecutionDecision> {
    // ── Phase 1: Pre-Analysis ───────────────────────────────────────
    this.transition("PRE_ANALYSIS", step.stepId);

    const riskAssessment = await this.preAnalyze(step);
    this.riskAssessments.set(step.stepId, riskAssessment);

    // Check if risk level requires human approval or abort
    if (this.config.abortOnCriticalRisk && riskAssessment.riskLevel === "CRITICAL") {
      this.transition("FAILED", step.stepId, undefined, undefined, riskAssessment);
      return {
        decision: "FAIL",
        reasoning: `Pre-analysis flagged CRITICAL risk for step ${step.stepId}. Aborting.`,
        triggeringObservation: this.createEmptyObservation(step, "Aborted before execution due to CRITICAL risk."),
        evidenceIds: riskAssessment.risks.flatMap(r => r.evidenceIds),
        confidence: riskAssessment.confidence
      };
    }

    if (
      this.config.humanApprovalRiskLevels.includes(riskAssessment.riskLevel as any) &&
      riskAssessment.recommendation === "REQUIRES_HUMAN_APPROVAL"
    ) {
      this.transition("PAUSED", step.stepId, undefined, undefined, riskAssessment);
      return {
        decision: "PAUSE",
        reasoning: `Step ${step.stepId} requires human approval due to ${riskAssessment.riskLevel} risk.`,
        triggeringObservation: this.createEmptyObservation(step, "Paused for human approval."),
        evidenceIds: riskAssessment.risks.flatMap(r => r.evidenceIds),
        confidence: riskAssessment.confidence
      };
    }

    // ── Phase 2: Execution ──────────────────────────────────────────
    this.transition("EXECUTING", step.stepId);

    const executionResult = await this.executor.execute(step);

    // ── Phase 3: Observation ────────────────────────────────────────
    this.transition("OBSERVING", step.stepId);

    const observation = this.captureObservation(step, executionResult, riskAssessment);

    // ── Phase 4: Assessment ─────────────────────────────────────────
    this.transition("ASSESSING", step.stepId, observation);

    // ── Phase 5: Decision ───────────────────────────────────────────
    const decision = await this.decide(step, observation, riskAssessment);

    return decision;
  }

  /**
   * Resume from PAUSED state (after human intervention).
   */
  public resume(): void {
    if (this.state !== "PAUSED") {
      throw new Error(`Cannot resume from state ${this.state}. Must be PAUSED.`);
    }
    // Transition back to PRE_ANALYSIS for the next step
    this.transition("PRE_ANALYSIS");
  }

  /**
   * Mark execution as complete.
   */
  public complete(): void {
    this.transition("COMPLETED");
  }

  // ─── Internal Methods ───────────────────────────────────────────────────

  private transition(
    to: ExecutionState,
    stepId?: string,
    observation?: ExecutionObservation,
    decision?: ExecutionDecision,
    riskAssessment?: StepRiskAssessment
  ): void {
    const validTargets = VALID_TRANSITIONS[this.state];
    if (!validTargets.includes(to)) {
      throw new Error(
        `ILLEGAL STATE TRANSITION: ${this.state} → ${to}. ` +
        `Valid transitions from ${this.state}: [${validTargets.join(", ")}]`
      );
    }

    const entry: ExecutionTraceEntry = {
      timestamp: new Date().toISOString(),
      fromState: this.state,
      toState: to,
      ...(stepId ? { stepId } : {}),
      ...(observation ? { observation } : {}),
      ...(decision ? { decision } : {}),
      ...(riskAssessment ? { riskAssessment } : {}),
      durationMs: 0  // Will be computed by callers if needed
    };

    this.trace.push(entry);
    this.state = to;
  }

  private async preAnalyze(step: StepDescriptor): Promise<StepRiskAssessment> {
    return assessStepRisk(
      step,
      this.graph,
      this.operationalUnderstanding,
      this.semanticUnderstanding
    );
  }

  private captureObservation(
    step: StepDescriptor,
    result: Awaited<ReturnType<StepExecutor["execute"]>>,
    riskAssessment: StepRiskAssessment
  ): ExecutionObservation {
    const relatedNodeIds = this.graph.nodes
      .filter(n => n.name.toLowerCase().includes(step.stepName.toLowerCase().split(" ")[0] || ""))
      .map(n => n.id)
      .filter(id => this.validIds.has(id));

    return {
      observationId: `obs_${step.stepId}_${Date.now()}`,
      stepId: step.stepId,
      timestamp: new Date().toISOString(),
      expectedBehavior: `Execute ${step.operation} on ${step.target}`,
      actualBehavior: result.succeeded
        ? `Step completed successfully in ${result.durationMs}ms`
        : `Step failed: ${result.error?.message || "unknown error"}`,
      outcomeMatch: result.succeeded ? "EXACT" : "MISMATCH",
      deviations: result.succeeded ? [] : [`Expected success, got failure: ${result.error?.message}`],
      durationMs: result.durationMs,
      evidenceIds: relatedNodeIds,
      ...(result.error ? { error: {
        type: result.error.type,
        message: result.error.message,
        isTransient: result.error.isTransient,
        isRecoverable: result.error.isRecoverable
      } } : {}),
      ...(result.outputs ? { outputs: result.outputs } : {}),
      sideEffectsDetected: result.sideEffectsDetected || []
    };
  }

  private createEmptyObservation(step: StepDescriptor, reason: string): ExecutionObservation {
    return {
      observationId: `obs_${step.stepId}_${Date.now()}`,
      stepId: step.stepId,
      timestamp: new Date().toISOString(),
      expectedBehavior: `Execute ${step.operation} on ${step.target}`,
      actualBehavior: reason,
      outcomeMatch: "UNKNOWN",
      deviations: [reason],
      durationMs: 0,
      evidenceIds: [],
      sideEffectsDetected: []
    };
  }

  private async decide(
    step: StepDescriptor,
    observation: ExecutionObservation,
    riskAssessment: StepRiskAssessment
  ): Promise<ExecutionDecision> {
    // SUCCESS path
    if (observation.outcomeMatch === "EXACT" || observation.outcomeMatch === "PARTIAL") {
      this.transition("DECIDING", step.stepId, observation);
      const decision: ExecutionDecision = {
        decision: "CONTINUE",
        reasoning: `Step ${step.stepId} succeeded. Proceeding.`,
        triggeringObservation: observation,
        evidenceIds: observation.evidenceIds,
        confidence: 0.95
      };
      // Don't transition to COMPLETED here — that's the caller's job for the whole workflow
      return decision;
    }

    // FAILURE path — attempt recovery
    this.transition("DECIDING", step.stepId, observation);

    const currentAttempts = this.recoveryAttempts.get(step.stepId) || 0;
    if (currentAttempts >= this.config.maxRecoveryAttempts) {
      this.transition("FAILED", step.stepId);
      return {
        decision: "FAIL",
        reasoning: `Step ${step.stepId} exceeded max recovery attempts (${this.config.maxRecoveryAttempts}).`,
        triggeringObservation: observation,
        evidenceIds: observation.evidenceIds,
        confidence: 0.95
      };
    }

    // Select recovery strategy
    const recoveryDecision = await selectRecoveryStrategy(
      observation,
      riskAssessment,
      this.graph,
      this.semanticUnderstanding
    );

    const selected = recoveryDecision.selectedStrategy;

    // Handle based on selected action
    if (selected.action === "ESCALATE_TO_HUMAN") {
      this.transition("PAUSED", step.stepId);
      return {
        decision: "PAUSE",
        reasoning: selected.reasoning,
        triggeringObservation: observation,
        recoveryDecision,
        evidenceIds: selected.evidenceIds,
        confidence: selected.confidence
      };
    }

    if (selected.action === "ABORT") {
      this.transition("FAILED", step.stepId);
      return {
        decision: "FAIL",
        reasoning: selected.reasoning,
        triggeringObservation: observation,
        recoveryDecision,
        evidenceIds: selected.evidenceIds,
        confidence: selected.confidence
      };
    }

    // For RETRY, RETRY_WITH_BACKOFF, SKIP, ALTERNATIVE_PATH, ROLLBACK
    this.transition("RECOVERING", step.stepId);
    this.recoveryAttempts.set(step.stepId, currentAttempts + 1);

    if (selected.action === "RETRY" || selected.action === "RETRY_WITH_BACKOFF") {
      // Apply backoff if needed
      if (selected.action === "RETRY_WITH_BACKOFF") {
        const backoffMs = 1000 * Math.pow(2, currentAttempts);
        await new Promise(r => setTimeout(r, backoffMs));
      }

      // Re-execute the step
      const retryResult = await this.executor.execute(step);
      const retryObservation = this.captureObservation(step, retryResult, riskAssessment);

      // Observe the retry
      this.transition("OBSERVING", step.stepId, retryObservation);
      this.transition("ASSESSING", step.stepId, retryObservation);

      if (retryObservation.outcomeMatch === "EXACT" || retryObservation.outcomeMatch === "PARTIAL") {
        this.transition("DECIDING", step.stepId, retryObservation);
        return {
          decision: "CONTINUE",
          reasoning: `Step ${step.stepId} succeeded after retry attempt ${currentAttempts + 1}.`,
          triggeringObservation: retryObservation,
          recoveryDecision,
          evidenceIds: retryObservation.evidenceIds,
          confidence: 0.85
        };
      }

      // Retry also failed — recurse through decide again
      return this.decide(step, retryObservation, riskAssessment);
    }

    if (selected.action === "SKIP") {
      // Observe the skip
      const skipObservation = this.createEmptyObservation(step, `Skipped step ${step.stepId} per recovery strategy.`);
      this.transition("OBSERVING", step.stepId, skipObservation);
      this.transition("ASSESSING", step.stepId, skipObservation);
      this.transition("DECIDING", step.stepId, skipObservation);

      return {
        decision: "CONTINUE",
        reasoning: `Skipped step ${step.stepId} per recovery strategy: ${selected.reasoning}`,
        triggeringObservation: observation,
        recoveryDecision,
        evidenceIds: selected.evidenceIds,
        confidence: selected.confidence
      };
    }

    // ALTERNATIVE_PATH and ROLLBACK are more complex — for now, escalate
    const escalateObservation = this.createEmptyObservation(step, `Recovery action ${selected.action} requires implementation — escalating to human.`);
    this.transition("OBSERVING", step.stepId, escalateObservation);
    this.transition("ASSESSING", step.stepId, escalateObservation);
    this.transition("DECIDING", step.stepId, escalateObservation);
    this.transition("PAUSED", step.stepId);

    return {
      decision: "PAUSE",
      reasoning: `Recovery action ${selected.action} escalated to human: ${selected.reasoning}`,
      triggeringObservation: observation,
      recoveryDecision,
      evidenceIds: selected.evidenceIds,
      confidence: selected.confidence
    };
  }
}
