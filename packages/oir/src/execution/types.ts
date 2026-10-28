/**
 * Execution State Machine — Types
 * 
 * Defines the formal state machine, observation model, risk assessment,
 * and recovery strategy types that bridge Ghost's intelligence layer
 * to its execution layer.
 * 
 * INVARIANTS:
 * 1. Every ExecutionObservation must reference real OIR evidence IDs.
 * 2. Every RecoveryStrategy must cite evidence from SemanticUnderstanding.
 * 3. State transitions are typed and guarded — no illegal transitions.
 * 4. The ESM never fabricates evidence, nodes, or variables.
 */

// ─── Execution States ───────────────────────────────────────────────────────

export type ExecutionState =
  | "READY"           // Initial state, plan loaded but not started
  | "PRE_ANALYSIS"    // Running pre-execution risk assessment
  | "EXECUTING"       // Active step execution in progress
  | "OBSERVING"       // Capturing post-execution evidence
  | "ASSESSING"       // Evaluating observation against expectations
  | "DECIDING"        // Choosing next action based on assessment
  | "RECOVERING"      // Executing a recovery strategy
  | "COMPLETED"       // Terminal: all steps succeeded
  | "FAILED"          // Terminal: unrecoverable failure
  | "PAUSED";         // Waiting for human intervention

// ─── State Transition Table ─────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<ExecutionState, ExecutionState[]> = {
  READY:        ["PRE_ANALYSIS", "FAILED"],
  PRE_ANALYSIS: ["EXECUTING", "PAUSED", "FAILED"],
  EXECUTING:    ["OBSERVING", "FAILED"],
  OBSERVING:    ["ASSESSING"],
  ASSESSING:    ["DECIDING", "COMPLETED"],
  DECIDING:     ["EXECUTING", "RECOVERING", "PAUSED", "COMPLETED", "FAILED"],
  RECOVERING:   ["OBSERVING", "FAILED", "PAUSED"],
  COMPLETED:    [],  // Terminal
  FAILED:       [],  // Terminal
  PAUSED:       ["PRE_ANALYSIS", "EXECUTING", "FAILED"],  // Resumable
};

// ─── Execution Observation ──────────────────────────────────────────────────

/**
 * Structured evidence of what happened during a single step execution.
 * This is the primary feedback signal for the intelligence layer.
 */
export interface ExecutionObservation {
  /** Unique ID for this observation */
  observationId: string;
  /** The step ID from the execution plan that was executed */
  stepId: string;
  /** Timestamp of observation capture */
  timestamp: string;
  /** What the step was expected to do (from the plan) */
  expectedBehavior: string;
  /** What actually happened */
  actualBehavior: string;
  /** Whether the outcome matched expectations */
  outcomeMatch: "EXACT" | "PARTIAL" | "MISMATCH" | "UNKNOWN";
  /** Specific deviations from expected behavior */
  deviations: string[];
  /** Duration of the step execution in milliseconds */
  durationMs: number;
  /** Evidence IDs from the OIR that this step relates to */
  evidenceIds: string[];
  /** Any error information */
  error?: {
    type: string;
    message: string;
    isTransient: boolean;
    isRecoverable: boolean;
  };
  /** Outputs captured from the step */
  outputs?: Record<string, any>;
  /** Side effects detected */
  sideEffectsDetected: string[];
}

// ─── Step Risk Assessment ───────────────────────────────────────────────────

/**
 * Pre-execution risk analysis for a single step.
 * Produced by the Risk Assessor using SemanticUnderstanding.
 */
export interface StepRiskAssessment {
  /** The step being assessed */
  stepId: string;
  /** Overall risk level */
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  /** Go/No-Go recommendation */
  recommendation: "PROCEED" | "PROCEED_WITH_CAUTION" | "REQUIRES_HUMAN_APPROVAL" | "ABORT";
  /** Specific risks identified */
  risks: {
    description: string;
    likelihood: number;  // 0-1
    impact: string;
    mitigations: string[];
    evidenceIds: string[];
  }[];
  /** Constraints that apply to this step */
  applicableConstraints: string[];
  /** Unknowns that affect this step */
  applicableUnknowns: string[];
  /** Pre-conditions that must be true */
  preconditions: {
    description: string;
    satisfied: boolean;
    evidenceIds: string[];
  }[];
  /** Reasoning chain */
  reasoning: string;
  /** Confidence in this assessment */
  confidence: number;
}

// ─── Recovery Strategy ──────────────────────────────────────────────────────

export type RecoveryAction = 
  | "RETRY"               // Retry the same step
  | "RETRY_WITH_BACKOFF"  // Retry with exponential backoff
  | "SKIP"                // Skip this step and continue
  | "ALTERNATIVE_PATH"    // Execute an alternative sequence
  | "ROLLBACK"            // Undo previous steps
  | "ESCALATE_TO_HUMAN"   // Pause and wait for human
  | "ABORT";              // Terminate the workflow

/**
 * A ranked recovery option produced by the Recovery Selector.
 */
export interface RecoveryStrategy {
  /** The recommended action */
  action: RecoveryAction;
  /** Why this strategy was selected */
  reasoning: string;
  /** Confidence that this will resolve the issue */
  confidence: number;
  /** Evidence from the Semantic Understanding supporting this choice */
  evidenceIds: string[];
  /** Estimated probability of success */
  successProbability: number;
  /** Risks of executing this recovery */
  recoveryRisks: string[];
  /** Maximum retry attempts (for RETRY actions) */
  maxRetries?: number;
  /** Alternative step descriptions (for ALTERNATIVE_PATH) */
  alternativeSteps?: string[];
  /** Steps to undo (for ROLLBACK) */
  rollbackTargets?: string[];
}

/**
 * The output of the Recovery Selector engine.
 */
export interface RecoveryDecision {
  /** The failure that triggered recovery */
  failureObservation: ExecutionObservation;
  /** Ranked list of recovery strategies (best first) */
  strategies: RecoveryStrategy[];
  /** The selected strategy (highest confidence that meets threshold) */
  selectedStrategy: RecoveryStrategy;
  /** Overall reasoning for the selection */
  reasoning: string;
}

// ─── Execution Decision ─────────────────────────────────────────────────────

/**
 * A reasoned decision about how to proceed after observing a step outcome.
 */
export interface ExecutionDecision {
  /** What was decided */
  decision: "CONTINUE" | "RECOVER" | "PAUSE" | "COMPLETE" | "FAIL";
  /** Why this decision was made */
  reasoning: string;
  /** The observation that led to this decision */
  triggeringObservation: ExecutionObservation;
  /** If RECOVER, the recovery decision */
  recoveryDecision?: RecoveryDecision;
  /** Evidence IDs supporting the decision */
  evidenceIds: string[];
  /** Confidence in the decision */
  confidence: number;
}

// ─── Execution Trace ────────────────────────────────────────────────────────

/**
 * A single entry in the execution trace — records every state transition.
 */
export interface ExecutionTraceEntry {
  timestamp: string;
  fromState: ExecutionState;
  toState: ExecutionState;
  stepId?: string;
  observation?: ExecutionObservation;
  decision?: ExecutionDecision;
  riskAssessment?: StepRiskAssessment;
  durationMs: number;
}

/**
 * The complete execution trace for a workflow run.
 * This is the primary audit artifact.
 */
export interface ExecutionTrace {
  workflowId: string;
  startedAt: string;
  completedAt?: string;
  finalState: ExecutionState;
  entries: ExecutionTraceEntry[];
  totalObservations: number;
  totalRecoveries: number;
  totalHumanEscalations: number;
}
