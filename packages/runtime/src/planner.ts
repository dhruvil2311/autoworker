import type { WorkflowV2, WorkflowV2Step } from "@ghost/workflow-schema";

export interface ExecutionPlan {
  workflowVersionId: string;
  workflow: WorkflowV2;
  browserSessionGroups: Record<string, string[]>; // groupId -> stepIds
}

export class ExecutionPlanner {
  public createPlan(workflowVersionId: string, workflow: WorkflowV2): ExecutionPlan {
    const browserSessionGroups: Record<string, string[]> = {};
    
    // Group browser steps logically. 
    // In a real implementation, we would group contiguous BROWSER_DETERMINISTIC / BROWSER_SEMANTIC steps.
    // For now, we put them all in one default group for simplicity unless isolation is explicitly requested.
    const browserSteps = this.findBrowserSteps(workflow.root_step);
    if (browserSteps.length > 0) {
      browserSessionGroups["default"] = browserSteps.map(s => s.id);
    }

    return {
      workflowVersionId,
      workflow,
      browserSessionGroups
    };
  }

  private findBrowserSteps(step: WorkflowV2Step): WorkflowV2Step[] {
    const steps: WorkflowV2Step[] = [];
    if (step.target === "BROWSER_DETERMINISTIC" || step.target === "BROWSER_SEMANTIC") {
      steps.push(step);
    }
    if (step.children) {
      for (const child of step.children) {
        steps.push(...this.findBrowserSteps(child));
      }
    }
    return steps;
  }
}
