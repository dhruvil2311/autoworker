import type { RunSummary } from "@ghost/shared-types/contracts";

/**
 * One interpretation of backend run states for every experience. The backend state and outcome
 * classification are authoritative; experiences only choose how much detail to show.
 */

export type Tone = "ok" | "warn" | "bad" | "info" | "neutral";

const ACTIVE = new Set(["QUEUED", "STARTING", "RUNNING", "RESUMING", "PAUSING"]);
const WAITING = new Set(["WAITING_FOR_HUMAN", "HUMAN_CONTROL_ACTIVE", "VERIFYING_HANDOFF"]);

export function isActive(state: string) { return ACTIVE.has(state); }
export function isWaiting(state: string) { return WAITING.has(state); }
export function isTerminal(state: string) { return ["SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED"].includes(state); }

/** Business wording: what the user needs to know, without technical detail. */
export function businessStatus(run: Pick<RunSummary, "state" | "outcome">): { label: string; tone: Tone } {
  const c = run.outcome?.classification;
  if (run.state === "QUEUED" || run.state === "STARTING") return { label: "Preparing task", tone: "info" };
  if (ACTIVE.has(run.state)) return { label: "Running", tone: "info" };
  if (WAITING.has(run.state)) return { label: "Needs your approval", tone: "warn" };
  if (run.state === "SUCCEEDED") {
    return c === "VERIFIED_SUCCESS" ? { label: "Completed and verified", tone: "ok" } : { label: "Completed — result not verified", tone: "warn" };
  }
  if (run.state === "CANCELLED") return { label: "Stopped", tone: "neutral" };
  if (c === "PARTIAL_COMPLETION") return { label: "Partly completed — needs attention", tone: "bad" };
  return { label: "Needs attention", tone: "bad" };
}

/** Technical wording: exact backend state plus outcome classification. */
export function technicalStatus(run: Pick<RunSummary, "state" | "outcome">): { label: string; tone: Tone } {
  const c = run.outcome?.classification;
  const tone: Tone = run.state === "SUCCEEDED" ? (c === "VERIFIED_SUCCESS" ? "ok" : "warn")
    : WAITING.has(run.state) ? "warn"
    : ACTIVE.has(run.state) ? "info"
    : run.state === "CANCELLED" ? "neutral" : "bad";
  return { label: c && isTerminal(run.state) ? `${run.state} · ${c}` : run.state, tone };
}

export function stepTone(state: string): Tone {
  if (state === "SUCCEEDED") return "ok";
  if (state === "FAILED") return "bad";
  if (state === "PAUSED_FOR_HUMAN" || state === "WAITING_FOR_HUMAN") return "warn";
  if (state === "RUNNING") return "info";
  return "neutral";
}

export function formatTime(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

export function shortId(id?: string | null): string {
  return id ? id.slice(0, 8) : "—";
}
