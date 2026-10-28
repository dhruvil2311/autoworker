import type { WorkflowV2Step } from "@ghost/workflow-schema";
import type { RuntimeContext } from "../context.js";
import type { ExecutionCapability, ExecutionResult } from "./index.js";

export class BrowserSemanticExecutor implements ExecutionCapability {
  canExecute(step: WorkflowV2Step): boolean {
    return step.target === "BROWSER_SEMANTIC";
  }

  async execute(step: WorkflowV2Step, context: RuntimeContext): Promise<ExecutionResult> {
    try {
      // In a real environment, we'd invoke Stagehand here.
      return { state: "SUCCEEDED" };
    } catch (e: any) {
      return { state: "FAILED", message: e.message };
    }
  }
}
