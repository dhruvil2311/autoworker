import type { DesktopVerificationPredicate } from "@ghost/workflow-schema";
import type { DesktopObservedState, ObservationEngine } from "../observation/observation-engine.js";

export interface VerificationCheckResult {
  predicate: DesktopVerificationPredicate;
  passed: boolean;
  actualValue?: any | undefined;
  message?: string | undefined;
}

export interface StateVerificationResult {
  verified: boolean;
  checks: VerificationCheckResult[];
  failureReason?: string | undefined;
  recommendedAction?: ("CONTINUE" | "RETRY" | "ALTERNATIVE_SELECTOR" | "RECOVERY" | "HITL") | undefined;
}

export class VerificationEngine {
  constructor(private observationEngine: ObservationEngine) {}

  async verify(
    predicates: DesktopVerificationPredicate[],
    state: DesktopObservedState,
    previousScreenshot?: string
  ): Promise<StateVerificationResult> {
    if (!predicates || predicates.length === 0) {
      return { verified: true, checks: [] };
    }

    const checks: VerificationCheckResult[] = [];

    for (const pred of predicates) {
      const check = await this.evaluatePredicate(pred, state, previousScreenshot);
      checks.push(check);
    }

    const failed = checks.filter(c => !c.passed);
    if (failed.length === 0) {
      return { verified: true, checks };
    }

    const firstFail = failed[0]!;
    let recommendedAction: StateVerificationResult["recommendedAction"] = "RETRY";
    if (firstFail.predicate.type === "dialog_present" || firstFail.predicate.type === "element_exists") {
      recommendedAction = "ALTERNATIVE_SELECTOR";
    }

    return {
      verified: false,
      checks,
      failureReason: firstFail.message || `Verification predicate failed: ${firstFail.predicate.type}`,
      recommendedAction
    };
  }

  private async evaluatePredicate(
    pred: DesktopVerificationPredicate,
    state: DesktopObservedState,
    previousScreenshot?: string
  ): Promise<VerificationCheckResult> {
    switch (pred.type) {
      case "element_exists": {
        const found = state.visibleElements.some(el => 
          (pred.target?.automationId && el.automationId === pred.target.automationId) ||
          (pred.target?.name && el.name?.toLowerCase().includes(pred.target.name.toLowerCase()))
        );
        return {
          predicate: pred,
          passed: found,
          message: found ? undefined : `Element not found: ${pred.target?.name || pred.target?.automationId}`
        };
      }

      case "element_visible": {
        const el = state.visibleElements.find(e => 
          (pred.target?.automationId && e.automationId === pred.target.automationId) ||
          (pred.target?.name && e.name?.toLowerCase().includes(pred.target.name.toLowerCase()))
        );
        const passed = Boolean(el && el.visible);
        return {
          predicate: pred,
          passed,
          message: passed ? undefined : `Element is not visible: ${pred.target?.name}`
        };
      }

      case "element_enabled": {
        const el = state.visibleElements.find(e => 
          (pred.target?.automationId && e.automationId === pred.target.automationId) ||
          (pred.target?.name && e.name?.toLowerCase().includes(pred.target.name.toLowerCase()))
        );
        const passed = Boolean(el && el.enabled);
        return {
          predicate: pred,
          passed,
          message: passed ? undefined : `Element is not enabled: ${pred.target?.name}`
        };
      }

      case "text_contains": {
        const expected = String(pred.expectedValue || "");
        const matched = state.visibleElements.some(el => 
          (el.value && el.value.includes(expected)) ||
          (el.name && el.name.includes(expected))
        );
        return {
          predicate: pred,
          passed: matched,
          actualValue: state.visibleElements.map(e => e.value || e.name).filter(Boolean).slice(0, 5),
          message: matched ? undefined : `Expected text containing "${expected}" was not found in visible UI`
        };
      }

      case "text_equals": {
        const expected = String(pred.expectedValue || "");
        const matched = state.visibleElements.some(el => 
          el.value === expected || el.name === expected
        );
        return {
          predicate: pred,
          passed: matched,
          message: matched ? undefined : `Expected exact text "${expected}" was not found`
        };
      }

      case "window_exists":
      case "window_title_matches": {
        const expected = String(pred.expectedValue || pred.target?.windowTitle || "");
        const matched = state.runningApplications.some(app => 
          app.title.toLowerCase().includes(expected.toLowerCase())
        );
        return {
          predicate: pred,
          passed: matched,
          actualValue: state.runningApplications.map(a => a.title),
          message: matched ? undefined : `Window matching "${expected}" not found`
        };
      }

      case "value_equals": {
        const el = state.visibleElements.find(e => 
          (pred.target?.automationId && e.automationId === pred.target.automationId) ||
          (pred.target?.name && e.name?.toLowerCase().includes(pred.target.name.toLowerCase()))
        );
        const passed = Boolean(el && String(el.value) === String(pred.expectedValue));
        return {
          predicate: pred,
          passed,
          actualValue: el?.value,
          message: passed ? undefined : `Element value "${el?.value}" does not match expected "${pred.expectedValue}"`
        };
      }

      case "screenshot_changed": {
        const changed = Boolean(previousScreenshot && previousScreenshot !== state.screenshotBase64);
        return {
          predicate: pred,
          passed: changed,
          message: changed ? undefined : "Screenshot did not change after action"
        };
      }

      case "application_running": {
        const appName = String(pred.expectedValue || pred.target?.application || "");
        const running = state.runningApplications.some(app => 
          app.name.toLowerCase().includes(appName.toLowerCase())
        );
        return {
          predicate: pred,
          passed: running,
          message: running ? undefined : `Application "${appName}" is not running`
        };
      }

      case "dialog_present": {
        const hasDialog = state.activeDialogs.length > 0;
        return {
          predicate: pred,
          passed: hasDialog,
          actualValue: state.activeDialogs.map(d => d.name),
          message: hasDialog ? undefined : "Expected modal/dialog was not present"
        };
      }

      case "file_exists": {
        const path = pred.path || String(pred.expectedValue || "");
        const exists = this.observationEngine.checkFileExists(path);
        return {
          predicate: pred,
          passed: exists,
          message: exists ? undefined : `File "${path}" does not exist`
        };
      }

      default:
        return {
          predicate: pred,
          passed: true
        };
    }
  }
}
