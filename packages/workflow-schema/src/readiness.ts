import type { WorkflowV2, WorkflowV2Step } from "./v2.js";

/**
 * Pre-execution readiness: decides whether a compiled workflow has enough grounded
 * information to run safely. It never repairs the workflow; it reports what is missing.
 */

export type ReadinessIssueCode =
  | "NO_OBJECTIVE"
  | "NO_EXECUTABLE_STEPS"
  | "DESTINATION_UNKNOWN"
  | "GENERIC_TARGET"
  | "MISSING_TARGET"
  | "MISSING_VALUE"
  | "ENVIRONMENT_MISMATCH"
  | "MISSING_APPROVAL_GATE"
  | "UNRESOLVED_GROUNDING"
  | "NO_SUCCESS_CRITERIA";

export interface ReadinessIssue {
  code: ReadinessIssueCode;
  severity: "BLOCKING" | "WARNING";
  stepId?: string;
  message: string;
}

export interface ReadinessReport {
  executable: boolean;
  issues: ReadinessIssue[];
  /** Number of leaf steps that act on an application (excludes output bookkeeping). */
  actionStepCount: number;
}

/** Selectors that match many unrelated elements and therefore cannot identify a demonstrated target. */
const GENERIC_SELECTOR_PARTS = new Set([
  "body", "html", "main", "button", "a", "span", "div", "input", "select", "textarea", "label", "form",
  "input:not([type='hidden'])", "input:not([type=\"hidden\"])", "input[type='text']", "input[type=\"text\"]",
  "button[type='submit']", "button[type=\"submit\"]", "input[type='submit']", "input[type=\"submit\"]",
  "[role='button']", "[role=\"button\"]", "table tbody tr", "*"
]);

export function isGenericSelector(selector: unknown): boolean {
  if (typeof selector !== "string" || !selector.trim()) return true;
  const parts = selector.split(",").map(p => p.trim()).filter(Boolean);
  return parts.length === 0 || parts.every(p => GENERIC_SELECTOR_PARTS.has(p));
}

/** Removes the generic members of a selector list; returns undefined when nothing specific remains. */
export function specificSelectorOnly(selector: unknown): string | undefined {
  if (typeof selector !== "string") return undefined;
  const parts = selector.split(",").map(p => p.trim()).filter(p => p && !GENERIC_SELECTOR_PARTS.has(p));
  return parts.length ? parts.join(", ") : undefined;
}

const OUTPUT_OPERATIONS = new Set(["BUILD_OUTPUT", "VERIFY_OUTPUT", "DELIVER_OUTPUT"]);
const BROWSER_TARGETS = new Set(["BROWSER_DETERMINISTIC", "BROWSER_SEMANTIC"]);
const GENERIC_OBJECTIVES = /^(desktop task|video demonstration workflow|unknown business task|user demonstration execution|autonomous multi-step procedure\b.*|process execution)$/i;

function leaves(step: WorkflowV2Step, out: WorkflowV2Step[] = []): WorkflowV2Step[] {
  if (step.children && step.children.length) {
    for (const child of step.children) leaves(child, out);
  } else if (step.operation !== "SEQUENCE") {
    out.push(step);
  }
  return out;
}

function hostOf(url: unknown): string | undefined {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return undefined;
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return undefined; }
}

function domainMatches(host: string, domain: string): boolean {
  const d = domain.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]!;
  return host === d || host.endsWith(`.${d}`) || d.endsWith(`.${host}`);
}

function hasTarget(step: WorkflowV2Step): boolean {
  const t = step.args?.target;
  const descriptorText = t && typeof t === "object" ? (t.text || t.label || t.selector) : undefined;
  return Boolean(descriptorText) || !isGenericSelector(step.args?.selector);
}

export function assessExecutionReadiness(workflow: WorkflowV2, options: { inputs?: Record<string, unknown> } = {}): ReadinessReport {
  const issues: ReadinessIssue[] = [];
  const inputs = options.inputs || {};
  const objective = String(workflow.description || "").trim();
  if (!objective || GENERIC_OBJECTIVES.test(objective)) {
    issues.push({ code: "NO_OBJECTIVE", severity: "BLOCKING", message: "The workflow has no specific objective." });
  }

  const allLeaves = leaves(workflow.root_step);
  const actionSteps = allLeaves.filter(s => !OUTPUT_OPERATIONS.has(s.operation));
  if (!actionSteps.length) {
    issues.push({ code: "NO_EXECUTABLE_STEPS", severity: "BLOCKING", message: "The workflow contains no executable application steps." });
  }

  const grounding = (workflow.compiler as any)?.grounding;
  if (grounding?.blocking) {
    issues.push({ code: "UNRESOLVED_GROUNDING", severity: "BLOCKING", message: "The evidence report for this workflow still has blocking issues." });
  }

  const browserSteps = actionSteps.filter(s => BROWSER_TARGETS.has(s.target));
  if (browserSteps.length) {
    const first = browserSteps[0]!;
    const firstUrl = first.operation === "NAVIGATE" ? first.args?.url : undefined;
    const templated = typeof firstUrl === "string" && /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/.exec(firstUrl);
    const templateResolved = templated ? Boolean(inputs[templated[1]!]) : false;
    if (!hostOf(firstUrl) && !templateResolved) {
      issues.push({
        code: "DESTINATION_UNKNOWN",
        severity: "BLOCKING",
        stepId: first.id,
        message: "The first browser step does not navigate to an established web address."
      });
    }
  }

  const expected = (workflow.expected_domains || []).filter(Boolean);
  for (const step of actionSteps) {
    if (step.operation === "NAVIGATE") {
      const host = hostOf(step.args?.url);
      if (host && expected.length && !expected.some(d => domainMatches(host, d))) {
        issues.push({ code: "ENVIRONMENT_MISMATCH", severity: "BLOCKING", stepId: step.id, message: `Step ${step.id} navigates to ${host}, outside this workflow's expected domains (${expected.join(", ")}).` });
      }
    }
    if (BROWSER_TARGETS.has(step.target) && ["CLICK", "TYPE", "SELECT"].includes(step.operation)) {
      if (!hasTarget(step)) {
        issues.push({
          code: step.args?.selector ? "GENERIC_TARGET" : "MISSING_TARGET",
          severity: "BLOCKING",
          stepId: step.id,
          message: `Step ${step.id} does not identify a specific control${step.args?.selector ? ` (selector "${step.args.selector}" matches unrelated elements)` : ""}.`
        });
      }
      if (step.operation !== "CLICK" && (step.args?.value === undefined || step.args?.value === "") && !step.args?.requires_human_value) {
        issues.push({ code: "MISSING_VALUE", severity: "BLOCKING", stepId: step.id, message: `Step ${step.id} has no value to enter.` });
      }
    }
  }

  // Irreversible actions must be preceded by an approval gate bound to that step.
  const ordered = allLeaves;
  for (let i = 0; i < ordered.length; i++) {
    const step = ordered[i]!;
    if (!step.args?.irreversible) continue;
    const gate = ordered.slice(0, i).reverse().find(s => s.operation === "REQUIRE_APPROVAL");
    if (!gate || gate.args?.gates_step_id !== step.id) {
      issues.push({ code: "MISSING_APPROVAL_GATE", severity: "BLOCKING", stepId: step.id, message: `Step ${step.id} commits a change and has no approval checkpoint.` });
    }
  }

  if (!Array.isArray((workflow as any).success_criteria) || !(workflow as any).success_criteria.length) {
    issues.push({ code: "NO_SUCCESS_CRITERIA", severity: "WARNING", message: "No observable success condition is defined; the outcome will be reported as unverified." });
  }

  return {
    executable: !issues.some(i => i.severity === "BLOCKING"),
    issues,
    actionStepCount: actionSteps.length
  };
}
