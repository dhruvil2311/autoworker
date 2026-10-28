import type { WorkflowV2Step } from "@ghost/workflow-schema";
import type { RuntimeContext } from "./context.js";
import { VariableResolver } from "./context.js";

export class ControlFlowEngine {
  public evaluateCondition(step: WorkflowV2Step, context: RuntimeContext): boolean {
    const resolver = new VariableResolver(context);
    const { condition, left, right } = step.args || {};

    if (!condition) {
      throw new Error(`IF step requires a condition`);
    }

    const valLeft = resolver.resolve(left);
    const valRight = resolver.resolve(right);

    switch (condition) {
      case "EQUALS": return valLeft === valRight;
      case "NOT_EQUALS": return valLeft !== valRight;
      case "GREATER_THAN": return Number(valLeft) > Number(valRight);
      case "LESS_THAN": return Number(valLeft) < Number(valRight);
      case "GREATER_THAN_OR_EQUAL": return Number(valLeft) >= Number(valRight);
      case "LESS_THAN_OR_EQUAL": return Number(valLeft) <= Number(valRight);
      case "EXISTS": return valLeft !== undefined && valLeft !== null && valLeft !== "";
      case "CONTAINS": return typeof valLeft === "string" && valLeft.includes(String(valRight));
      default: throw new Error(`Unsupported condition: ${condition}`);
    }
  }

  public getCollectionForLoop(step: WorkflowV2Step, context: RuntimeContext): any[] {
    const resolver = new VariableResolver(context);
    const { collection } = step.args || {};
    
    if (!collection) {
      throw new Error("FOR_EACH requires a collection argument");
    }

    const items = resolver.resolve(collection);
    
    if (!Array.isArray(items)) {
      throw new Error(`Resolved collection is not an array: ${JSON.stringify(items)}`);
    }

    // Unbounded loop protection
    if (items.length > 1000) {
      throw new Error("Loop iteration limit exceeded (>1000)");
    }

    return items;
  }
}
