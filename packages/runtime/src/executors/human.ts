import type { WorkflowV2Step } from "@ghost/workflow-schema";
import type { RuntimeContext } from "../context.js";
import type { ExecutionCapability, ExecutionResult } from "./index.js";

export class HumanExecutor implements ExecutionCapability {
  canExecute(step: WorkflowV2Step): boolean {
    return step.target === "HUMAN" || step.operation === "REQUIRE_APPROVAL";
  }

  async execute(step: WorkflowV2Step, context: RuntimeContext): Promise<ExecutionResult> {
    const hitlResponse = context.get(`hitl_response_${step.id}`);
    
    if (!hitlResponse) {
      // Initiate HITL pause
      return { 
        state: "PAUSED_FOR_HUMAN", 
        hitlReason: step.operation === "REQUIRE_APPROVAL" ? "MANUAL_APPROVAL" : "PROVIDE_VALUE",
        message: step.description 
      };
    }

    // Process human response
    if (hitlResponse.action === "APPROVE") {
      return { state: "SUCCEEDED" };
    }
    if (hitlResponse.action === "REJECT") {
      return { state: "FAILED", message: "Human rejected" };
    }
    if (hitlResponse.action === "PROVIDE_VALUE" || hitlResponse.action === "CHOOSE_MAPPING") {
      return { 
        state: "SUCCEEDED",
        outputs: step.bind_result_to ? { [step.bind_result_to]: hitlResponse.value } : {}
      };
    }

    return { state: "FAILED", message: `Unknown human action: ${hitlResponse.action}` };
  }
}
