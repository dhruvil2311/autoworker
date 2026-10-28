/**
 * Single source of truth for execution-run state transitions, shared by every store.
 *
 * WAITING_FOR_HUMAN cannot jump to SUCCEEDED: a paused run only finishes by resuming and
 * executing its remaining steps. Every non-terminal state can be CANCELLED.
 */
export const RUN_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  QUEUED: ["STARTING", "RUNNING", "FAILED", "CANCELLED"],
  STARTING: ["RUNNING", "FAILED", "CANCELLED"],
  RUNNING: ["SUCCEEDED", "FAILED", "PAUSING", "WAITING_FOR_HUMAN", "CANCELLED"],
  PAUSING: ["WAITING_FOR_HUMAN", "FAILED", "CANCELLED"],
  // RUNNING is reachable directly only for an in-process live handoff (credentials typed into the
  // open session); persisted pauses resume through RESUMING.
  WAITING_FOR_HUMAN: ["RUNNING", "RESUMING", "HUMAN_CONTROL_ACTIVE", "FAILED", "TIMED_OUT", "CANCELLED"],
  HUMAN_CONTROL_ACTIVE: ["VERIFYING_HANDOFF", "FAILED", "TIMED_OUT", "CANCELLED"],
  VERIFYING_HANDOFF: ["RESUMING", "FAILED", "CANCELLED"],
  RESUMING: ["RUNNING", "FAILED", "CANCELLED"],
  SUCCEEDED: [],
  FAILED: [],
  TIMED_OUT: [],
  CANCELLED: []
};

export const TERMINAL_RUN_STATES: ReadonlySet<string> = new Set(["SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED"]);
export const HUMAN_WAIT_STATES: ReadonlySet<string> = new Set(["WAITING_FOR_HUMAN", "HUMAN_CONTROL_ACTIVE", "VERIFYING_HANDOFF"]);

export function isLegalRunTransition(current: string, next: string): boolean {
  return (RUN_TRANSITIONS[current] ?? []).includes(next);
}

export type HitlDecisionAction = "APPROVE" | "REJECT" | "PROVIDE_VALUE";

export interface HitlDecisionInput {
  action: HitlDecisionAction;
  value?: unknown;
  note?: string | undefined;
  /** The run and workflow version the decider was looking at; a mismatch makes the decision stale. */
  expectedRunId?: string | undefined;
  expectedWorkflowVersionId?: string | undefined;
}

export type HitlDecisionErrorCode = "NOT_FOUND" | "STALE_DECISION" | "EXPIRED" | "RUN_NOT_WAITING" | "INVALID_DECISION";

export class HitlDecisionError extends Error {
  constructor(public readonly code: HitlDecisionErrorCode, message: string) {
    super(message);
    this.name = "HitlDecisionError";
  }
}

export function validateHitlDecision(input: HitlDecisionInput): void {
  if (!["APPROVE", "REJECT", "PROVIDE_VALUE"].includes(input.action)) {
    throw new HitlDecisionError("INVALID_DECISION", `Unknown decision "${String(input.action)}". Use APPROVE, REJECT or PROVIDE_VALUE.`);
  }
  if (input.action === "PROVIDE_VALUE" && (input.value === undefined || input.value === null || input.value === "")) {
    throw new HitlDecisionError("INVALID_DECISION", "PROVIDE_VALUE requires a value.");
  }
}

/** Roles allowed to approve or reject a paused run. */
export const HITL_DECIDER_ROLES: ReadonlySet<string> = new Set(["owner", "admin", "operator"]);
