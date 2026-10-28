/**
 * Ghost Worker lifecycle state machine.
 * Maps between internal technical states and merchant-facing product states.
 */

export type GhostWorkerStatus =
  | "NEW"
  | "RECORDING"
  | "ANALYZING"
  | "NEEDS_CLARIFICATION"
  | "READY_FOR_REVIEW"
  | "TESTING"
  | "TEST_FAILED"
  | "READY_FOR_APPROVAL"
  | "ACTIVE"
  | "PAUSED"
  | "NEEDS_ATTENTION"
  | "ARCHIVED";

const ALLOWED_TRANSITIONS: Record<GhostWorkerStatus, GhostWorkerStatus[]> = {
  NEW: ["RECORDING", "ARCHIVED"],
  RECORDING: ["ANALYZING", "NEW", "ARCHIVED"],
  ANALYZING: ["NEEDS_CLARIFICATION", "READY_FOR_REVIEW", "NEW", "ARCHIVED"],
  NEEDS_CLARIFICATION: ["READY_FOR_REVIEW", "NEEDS_CLARIFICATION", "ARCHIVED"],
  READY_FOR_REVIEW: ["TESTING", "NEEDS_CLARIFICATION", "RECORDING", "ARCHIVED"],
  TESTING: ["READY_FOR_APPROVAL", "TEST_FAILED", "NEEDS_ATTENTION"],
  TEST_FAILED: ["TESTING", "NEEDS_CLARIFICATION", "RECORDING", "ARCHIVED"],
  READY_FOR_APPROVAL: ["ACTIVE", "TESTING", "NEEDS_CLARIFICATION", "RECORDING", "ARCHIVED"],
  ACTIVE: ["PAUSED", "NEEDS_ATTENTION", "ARCHIVED"],
  PAUSED: ["ACTIVE", "ARCHIVED"],
  NEEDS_ATTENTION: ["ACTIVE", "PAUSED", "ARCHIVED"],
  ARCHIVED: ["NEW"]
};

export function isValidTransition(from: GhostWorkerStatus, to: GhostWorkerStatus): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

export function validateTransition(from: GhostWorkerStatus, to: GhostWorkerStatus): void {
  if (!isValidTransition(from, to)) {
    throw new Error(`Invalid Ghost Worker transition: ${from} → ${to}`);
  }
}

/** Merchant-facing labels for each status */
export const STATUS_LABELS: Record<GhostWorkerStatus, string> = {
  NEW: "New",
  RECORDING: "Recording",
  ANALYZING: "Learning",
  NEEDS_CLARIFICATION: "Has Questions",
  READY_FOR_REVIEW: "Ready for Review",
  TESTING: "Testing",
  TEST_FAILED: "Test Failed",
  READY_FOR_APPROVAL: "Ready to Activate",
  ACTIVE: "Active",
  PAUSED: "Paused",
  NEEDS_ATTENTION: "Needs Attention",
  ARCHIVED: "Archived"
};

/** Map run states to possible worker status updates */
export function workerStatusFromRunResult(runState: string, runMode: string): GhostWorkerStatus | null {
  if (runMode === "TEST") {
    if (runState === "SUCCEEDED") return "READY_FOR_APPROVAL";
    if (runState === "FAILED") return "TEST_FAILED";
    if (runState === "WAITING_FOR_HUMAN") return "TESTING";
    return null;
  }
  // Production runs
  if (runState === "WAITING_FOR_HUMAN") return "NEEDS_ATTENTION";
  if (runState === "FAILED") return "NEEDS_ATTENTION";
  return null; // Don't change status on success
}

/** Safe status badge colors for the frontend */
export const STATUS_COLORS: Record<GhostWorkerStatus, string> = {
  NEW: "#6B7280",
  RECORDING: "#F59E0B",
  ANALYZING: "#3B82F6",
  NEEDS_CLARIFICATION: "#F97316",
  READY_FOR_REVIEW: "#8B5CF6",
  TESTING: "#3B82F6",
  TEST_FAILED: "#EF4444",
  READY_FOR_APPROVAL: "#10B981",
  ACTIVE: "#059669",
  PAUSED: "#6B7280",
  NEEDS_ATTENTION: "#EF4444",
  ARCHIVED: "#9CA3AF"
};
