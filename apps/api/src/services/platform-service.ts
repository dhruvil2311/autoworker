import { assessExecutionReadiness } from "@ghost/workflow-schema";
import type { AuthContext } from "@ghost/shared-types";
import type { AppStore, ExecutionStepRow, GhostWorkerRow, HitlRequestRow, RunRow, WorkflowVersionRow } from "../store.js";
import { TERMINAL_RUN_STATES } from "../run-state.js";
import { hasPermission } from "../authorization.js";

/** Organization policies that the platform actually enforces. */
export interface Policies {
  /** How long a run may wait for a human decision before it times out. */
  hitlTimeoutMinutes: number;
  /** Business users (role member) may approve or reject runs they launched. */
  membersMayApproveOwnRuns: boolean;
  /** Only operators/admins may retry failed runs; when false the user who launched a run may retry it. */
  retryRequiresOperator: boolean;
}

export const POLICY_LIMITS = { hitlTimeoutMinutes: { min: 5, max: 7 * 24 * 60 } } as const;

export function defaultPolicies(hitlTimeoutSeconds: number): Policies {
  return {
    hitlTimeoutMinutes: Math.min(POLICY_LIMITS.hitlTimeoutMinutes.max, Math.max(POLICY_LIMITS.hitlTimeoutMinutes.min, Math.round(hitlTimeoutSeconds / 60))),
    membersMayApproveOwnRuns: true,
    retryRequiresOperator: true
  };
}

export async function loadPolicies(store: AppStore, auth: AuthContext, hitlTimeoutSeconds: number): Promise<{ policies: Policies; updatedAt: string | null }> {
  const settings = await store.getOrgSettings(auth);
  return {
    policies: { ...defaultPolicies(hitlTimeoutSeconds), ...(settings.policies || {}) },
    updatedAt: settings.policiesUpdatedAt ?? null
  };
}

/** Validates a policy patch; returns field errors instead of silently coercing. */
export function validatePolicyPatch(patch: unknown): { value?: Partial<Policies>; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const value: Partial<Policies> = {};
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return { errors: { body: "Expected an object of policies." } };
  for (const [key, raw] of Object.entries(patch as Record<string, unknown>)) {
    if (key === "hitlTimeoutMinutes") {
      const { min, max } = POLICY_LIMITS.hitlTimeoutMinutes;
      if (typeof raw !== "number" || !Number.isInteger(raw) || raw < min || raw > max) errors[key] = `Must be a whole number of minutes between ${min} and ${max}.`;
      else value.hitlTimeoutMinutes = raw;
    } else if (key === "membersMayApproveOwnRuns" || key === "retryRequiresOperator") {
      if (typeof raw !== "boolean") errors[key] = "Must be true or false.";
      else value[key] = raw;
    } else {
      errors[key] = "Unknown or unsupported policy.";
    }
  }
  return { value, errors };
}

const SIDE_EFFECT_OPS = new Set(["CLICK", "TYPE", "SELECT", "PRESS_KEY", "SUBMIT", "CALL_API", "CALL_MCP", "UPLOAD", "UPLOAD_FILE"]);

function leaves(step: any, out: any[] = []): any[] {
  if (step?.children?.length) step.children.forEach((c: any) => leaves(c, out));
  else if (step) out.push(step);
  return out;
}

export function workflowLeaves(workflow: any): any[] {
  return workflow?.root_step ? leaves(workflow.root_step) : (workflow?.steps || []);
}

/** Inputs a run must supply: template variables referenced by steps that have no default value. */
export function requiredInputs(workflow: any): Array<{ name: string; type: string; required: boolean }> {
  const referenced = new Set<string>();
  for (const step of workflowLeaves(workflow)) {
    for (const m of JSON.stringify(step.args || {}).matchAll(/\{\{\s*([a-zA-Z0-9_]+)(?:\.[a-zA-Z0-9_.]+)?\s*\}\}/g)) {
      if (!m[1]!.startsWith("SECRET") && !m[1]!.startsWith("hitl_response")) referenced.add(m[1]!);
    }
  }
  const declared = new Map<string, any>((workflow?.variables || []).map((v: any) => [v.name, v]));
  return [...referenced].map(name => {
    const v = declared.get(name);
    return { name, type: v?.type || "string", required: v?.default_value === undefined };
  });
}

export function versionSummary(version: WorkflowVersionRow, worker?: GhostWorkerRow) {
  const wf: any = version.workflow || {};
  const readiness = assessExecutionReadiness(wf);
  const compiler = wf.compiler || {};
  return {
    id: version.id,
    name: String(wf.name || "Untitled workflow"),
    createdAt: version.createdAt,
    status: String(wf.status || "DRAFT"),
    isActive: worker?.activeVersionId === version.id,
    isPublished: worker?.publishedVersionId === version.id,
    ...(compiler.source_type ? { sourceType: String(compiler.source_type) } : {}),
    ...(compiler.source_recording_id ? { sourceRecordingId: String(compiler.source_recording_id) } : {}),
    stepCount: workflowLeaves(wf).length,
    executable: readiness.executable,
    blockingIssues: readiness.issues.filter(i => i.severity === "BLOCKING").map(i => i.message),
    ...(compiler.grounding?.coverage?.fidelity ? { fidelity: String(compiler.grounding.coverage.fidelity) } : {})
  };
}

/** Run as returned to clients: persisted record plus its outcome classification, if any. */
export function runSummary(run: RunRow, workerName?: string) {
  const summary: any = run.resultSummary ?? (run.metadata as any)?.resultSummary;
  const outcome = summary?.outcome && typeof summary.outcome === "object"
    ? summary.outcome
    : typeof summary?.outcome === "string" ? { reason: summary.outcome } : null;
  return { ...run, ...(workerName ? { workerName } : {}), outcome };
}

/**
 * What may be done to a run now, decided from persisted state only. A retry starts a new run from
 * the beginning, so it is refused when the failed run already completed a side-effecting step.
 */
export function computeRunControls(
  run: RunRow,
  steps: ExecutionStepRow[],
  hitls: HitlRequestRow[],
  workflow: any,
  auth: AuthContext,
  policies: Policies
) {
  const reasons: Record<string, string> = {};
  const terminal = TERMINAL_RUN_STATES.has(run.state);
  const pending = hitls.filter(h => h.runId === run.id && (h.state === "PENDING" || h.state === "CONTROL_ACTIVE"));
  const own = Boolean(run.createdBy) && run.createdBy === auth.userId;
  const operator = hasPermission(auth, "runs.control");

  const canCancel = !terminal && (operator || (own && hasPermission(auth, "tasks.run")));
  if (terminal) reasons.cancel = `The run already ended (${run.state}).`;
  else if (!canCancel) reasons.cancel = "Only operators or the person who launched the run can cancel it.";

  const canPause = run.state === "RUNNING" && operator;
  if (run.state !== "RUNNING") reasons.pause = "Only a running execution can be paused.";
  else if (!operator) reasons.pause = "Pausing requires the operator role.";

  const waiting = run.state === "WAITING_FOR_HUMAN" || run.state === "VERIFYING_HANDOFF";
  const canResume = waiting && pending.length === 0 && operator;
  if (!waiting) reasons.resume = "Only a paused execution can be resumed.";
  else if (pending.length) reasons.resume = "A pending approval must be decided first.";
  else if (!operator) reasons.resume = "Resuming requires the operator role.";

  const decider = hasPermission(auth, "hitl.decide") || (own && policies.membersMayApproveOwnRuns && hasPermission(auth, "hitl.decide_own"));
  const canDecide = pending.length > 0 && decider;
  if (!pending.length) reasons.decide = "No decision is pending.";
  else if (!decider) reasons.decide = "You are not allowed to decide this request.";

  const retryable = ["FAILED", "CANCELLED", "TIMED_OUT"].includes(run.state);
  const sideEffectIds = new Set(workflowLeaves(workflow).filter((s: any) => SIDE_EFFECT_OPS.has(s.operation) || s.args?.irreversible).map((s: any) => s.id));
  const completedSideEffect = steps.find(s => s.state === "SUCCEEDED" && [...sideEffectIds].some(id => s.stepId === id || s.stepId.startsWith(`${id}_`)));
  const retryAllowedByRole = operator || (!policies.retryRequiresOperator && own && hasPermission(auth, "tasks.run"));
  const readiness = workflow ? assessExecutionReadiness(workflow) : { executable: false };
  let canRetry = retryable && !completedSideEffect && retryAllowedByRole && readiness.executable;
  if (!retryable) reasons.retry = "Only failed, cancelled or timed-out runs can be retried.";
  else if (completedSideEffect) reasons.retry = `Step ${completedSideEffect.stepId} already changed the application; retrying from the start would repeat it.`;
  else if (!retryAllowedByRole) reasons.retry = "Retrying requires the operator role.";
  else if (!readiness.executable) reasons.retry = "The workflow version is no longer executable.";
  if (!workflow) canRetry = false;

  return { canPause, canResume, canCancel, canRetry, canDecide, reasons };
}
