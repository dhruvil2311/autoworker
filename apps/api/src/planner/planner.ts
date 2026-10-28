import { BusinessProcessSpecification } from "@ghost/bpi";
import { CapabilityResolver } from "../capabilities/resolver.js";
import { CapabilityBinding, SemanticOperation } from "@ghost/workflow-schema";
import { AuthContext } from "@ghost/shared-types";

export interface ExecutablePlanStep {
  id: string;
  semanticOperationId: string;
  description: string;
  fallbackChain: CapabilityBinding[];
}

export interface ExecutablePlan {
  id: string;
  bpsId: string;
  variables: Record<string, any>;
  steps: ExecutablePlanStep[];
}

export class ExecutionPlanner {
  constructor(private resolver: CapabilityResolver) {}

  /**
   * Plans the execution by converting BPS intent into an ordered ExecutablePlan
   * with fully resolved capability bindings.
   */
  async plan(auth: AuthContext, bps: BusinessProcessSpecification): Promise<ExecutablePlan> {
    
    // In a full implementation, we'd traverse the BPS DataFlow graph.
    // For this prototype, we'll mock extracting SemanticOperations from the intent.
    const steps: ExecutablePlanStep[] = [];

    // Mock extraction
    let operation: SemanticOperation;
    if (bps.intent.toLowerCase().includes("update inventory")) {
      operation = {
        id: "UPDATE_RECORD",
        entity: "inventory",
        inputs: {},
        outputs: {},
        sideEffect: "MUTATION",
        risk: "MEDIUM"
      };
    } else {
      operation = {
        id: "GET_RECORD",
        entity: "data",
        inputs: {},
        outputs: {},
        sideEffect: "READ",
        risk: "LOW"
      };
    }

    const fallbackChain = await this.resolver.resolve(auth, operation);
    
    steps.push({
      id: `step_sem_${Date.now()}`,
      semanticOperationId: operation.id,
      description: bps.intent,
      fallbackChain
    });

    return {
      id: crypto.randomUUID(),
      bpsId: bps.id,
      variables: bps.variables,
      steps
    };
  }
}
