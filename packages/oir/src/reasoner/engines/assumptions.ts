/**
 * AssumptionEngine
 * 
 * Surfaces every inference that is NOT directly evidenced in the OIR.
 * Every assumption is an explicit acknowledgement of reasoning under uncertainty.
 */

import { OirGraph, ActionNode } from "../../types.js";
import { Assumption } from "../types.js";

export function detectAssumptions(graph: OirGraph): Assumption[] {
  const assumptions: Assumption[] = [];

  // Assumption: The business goal as stated is correct
  if (graph.businessGoal) {
    assumptions.push({
      description: `The stated business goal "${graph.businessGoal}" accurately reflects the user's intent.`,
      basis: "Goal was provided explicitly or inferred by the builder.",
      evidenceIds: [],
      riskIfWrong: "Entire operational understanding would be misaligned with actual intent."
    });
  }

  // Assumption: External systems are available and accessible
  for (const sys of graph.externalSystems) {
    assumptions.push({
      description: `External system "${sys.name}" is available and the operator has access.`,
      basis: `System referenced in OIR: ${sys.id}`,
      evidenceIds: [sys.id],
      riskIfWrong: `Workflow will fail at any step requiring ${sys.name}.`
    });
  }

  // Assumption: Variable types are correct
  for (const v of graph.variables) {
    if (!v.description) {
      assumptions.push({
        description: `Variable "${v.name}" (type: ${v.type}) is correctly typed and named.`,
        basis: "Deterministic extraction from input observations.",
        evidenceIds: [v.id],
        riskIfWrong: `Type mismatch could cause runtime errors or data corruption.`
      });
    }
  }

  // Assumption: Sequential dependencies represent real ordering
  if (graph.dependencies.length > 0) {
    assumptions.push({
      description: "The extracted dependency ordering reflects the actual required execution order.",
      basis: "Dependencies were derived from observation timestamps and control flow.",
      evidenceIds: graph.dependencies.map(d => d.sourceId),
      riskIfWrong: "Steps may be executed out of order, causing incorrect state."
    });
  }

  // Assumption: Low confidence nodes are still valid
  const lowConfNodes = graph.nodes.filter(n => n.confidence !== undefined && n.confidence < 0.7);
  for (const node of lowConfNodes) {
    assumptions.push({
      description: `Low-confidence node "${node.name}" (confidence: ${node.confidence}) is still operationally valid.`,
      basis: `Node extracted with reduced confidence by the builder.`,
      evidenceIds: [node.id],
      riskIfWrong: `This node may represent a misinterpretation of the raw observation.`
    });
  }

  return assumptions;
}
