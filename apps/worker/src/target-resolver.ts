import type { WorkflowV2Step } from "@ghost/workflow-schema";
import { specificSelectorOnly } from "@ghost/workflow-schema";

/**
 * Resolves the control a step was demonstrated on, using the evidence the step carries
 * (accessible name, label, visible text, or an evidence-derived selector).
 *
 * A target is accepted only when exactly one visible element matches. Ambiguity or absence is
 * returned as a failure for the caller to escalate; nothing falls back to "the first button".
 */

export type TargetKind = "click" | "fill" | "select" | "read";

export interface ResolvedTarget {
  ok: true;
  locator: any;
  strategy: string;
}

export interface UnresolvedTarget {
  ok: false;
  reason: "NO_TARGET" | "NOT_FOUND" | "AMBIGUOUS";
  detail: string;
  tried: string[];
}

export type TargetResolution = ResolvedTarget | UnresolvedTarget;

const CLICK_ROLES = ["button", "link", "menuitem", "tab", "checkbox", "radio", "option", "switch", "treeitem"];
const FILL_ROLES = ["textbox", "searchbox", "combobox", "spinbutton"];

export function describeTarget(step: WorkflowV2Step): { text?: string; label?: string; role?: string; selector?: string } {
  const t = step.args?.target;
  const descriptor = t && typeof t === "object" ? t : {};
  const out: { text?: string; label?: string; role?: string; selector?: string } = {};
  if (typeof descriptor.text === "string" && descriptor.text.trim()) out.text = descriptor.text.trim();
  if (typeof descriptor.label === "string" && descriptor.label.trim()) out.label = descriptor.label.trim();
  if (typeof descriptor.role === "string" && descriptor.role.trim()) out.role = descriptor.role.trim();
  const selector = specificSelectorOnly(descriptor.selector) || specificSelectorOnly(step.args?.selector);
  if (selector) out.selector = selector;
  return out;
}

async function visibleCount(locator: any): Promise<number> {
  try {
    return await locator.filter({ visible: true }).count();
  } catch {
    return 0;
  }
}

/** Candidate locators in decreasing order of specificity. */
function candidates(page: any, kind: TargetKind, target: ReturnType<typeof describeTarget>): Array<{ name: string; locator: any }> {
  const list: Array<{ name: string; locator: any }> = [];
  if (target.selector) {
    for (const part of target.selector.split(",").map(p => p.trim()).filter(Boolean)) {
      list.push({ name: `selector ${part}`, locator: page.locator(part) });
    }
  }
  const name = kind === "click" || kind === "read" ? (target.text || target.label) : (target.label || target.text);
  if (!name) return list;

  if (kind === "click") {
    const roles = target.role && CLICK_ROLES.includes(target.role) ? [target.role] : CLICK_ROLES;
    for (const role of roles) list.push({ name: `role=${role} name="${name}" (exact)`, locator: page.getByRole(role, { name, exact: true }) });
    list.push({ name: `text="${name}" (exact)`, locator: page.getByText(name, { exact: true }) });
    for (const role of roles) list.push({ name: `role=${role} name~"${name}"`, locator: page.getByRole(role, { name }) });
  } else if (kind === "fill") {
    list.push({ name: `label="${name}" (exact)`, locator: page.getByLabel(name, { exact: true }) });
    list.push({ name: `placeholder="${name}" (exact)`, locator: page.getByPlaceholder(name, { exact: true }) });
    for (const role of FILL_ROLES) list.push({ name: `role=${role} name="${name}" (exact)`, locator: page.getByRole(role, { name, exact: true }) });
    list.push({ name: `label~"${name}"`, locator: page.getByLabel(name) });
    list.push({ name: `placeholder~"${name}"`, locator: page.getByPlaceholder(name) });
  } else if (kind === "select") {
    list.push({ name: `label="${name}" (exact)`, locator: page.getByLabel(name, { exact: true }) });
    list.push({ name: `role=combobox name="${name}" (exact)`, locator: page.getByRole("combobox", { name, exact: true }) });
    list.push({ name: `label~"${name}"`, locator: page.getByLabel(name) });
  } else {
    list.push({ name: `text="${name}" (exact)`, locator: page.getByText(name, { exact: true }) });
    list.push({ name: `text~"${name}"`, locator: page.getByText(name) });
  }
  return list;
}

export async function resolveTarget(
  page: any,
  step: WorkflowV2Step,
  kind: TargetKind,
  options: { timeoutMs?: number; pollMs?: number } = {}
): Promise<TargetResolution> {
  const target = describeTarget(step);
  if (!target.selector && !target.text && !target.label) {
    return { ok: false, reason: "NO_TARGET", detail: "The step does not identify which control it acts on.", tried: [] };
  }

  const timeoutMs = options.timeoutMs ?? 8000;
  const pollMs = options.pollMs ?? 400;
  const deadline = Date.now() + timeoutMs;
  const list = candidates(page, kind, target);
  const tried = list.map(c => c.name);
  let ambiguous: string | undefined;

  // Poll so that a slow page gets time to render the control, but never beyond the deadline.
  for (;;) {
    ambiguous = undefined;
    for (const candidate of list) {
      const count = await visibleCount(candidate.locator);
      if (count === 1) {
        return { ok: true, locator: candidate.locator.filter({ visible: true }).first(), strategy: candidate.name };
      }
      if (count > 1 && !ambiguous) ambiguous = `${candidate.name} matches ${count} visible elements`;
    }
    if (Date.now() + pollMs > deadline) break;
    await new Promise(r => setTimeout(r, pollMs));
  }

  if (ambiguous) {
    return { ok: false, reason: "AMBIGUOUS", detail: `The demonstrated control is not unique on this page (${ambiguous}).`, tried };
  }
  const label = target.text || target.label || target.selector;
  return { ok: false, reason: "NOT_FOUND", detail: `No visible control matching "${label}" was found within ${Math.round(timeoutMs / 1000)}s.`, tried };
}

export type OutcomeCriterion = { id: string; type: "URL_CONTAINS" | "TEXT_VISIBLE"; value: string; source?: string };

export interface OutcomeCheck {
  criterionId: string;
  type: OutcomeCriterion["type"];
  expected: string;
  passed: boolean;
  observed: string;
}

/** Checks observable success criteria against the live page. */
export async function checkOutcome(page: any, criteria: OutcomeCriterion[], options: { timeoutMs?: number } = {}): Promise<{ verified: boolean; checks: OutcomeCheck[] }> {
  const checks: OutcomeCheck[] = [];
  const timeoutMs = options.timeoutMs ?? 5000;
  for (const criterion of criteria) {
    if (criterion.type === "URL_CONTAINS") {
      const deadline = Date.now() + timeoutMs;
      let url = page.url();
      while (!url.includes(criterion.value) && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 250));
        url = page.url();
      }
      checks.push({ criterionId: criterion.id, type: criterion.type, expected: criterion.value, passed: url.includes(criterion.value), observed: url });
    } else {
      const locator = page.getByText(criterion.value, { exact: false });
      const visible = await locator.filter({ visible: true }).first().waitFor({ state: "visible", timeout: timeoutMs }).then(() => true).catch(() => false);
      checks.push({
        criterionId: criterion.id,
        type: criterion.type,
        expected: criterion.value,
        passed: visible,
        observed: visible ? "visible on page" : "not visible on page"
      });
    }
  }
  return { verified: checks.length > 0 && checks.every(c => c.passed), checks };
}
