/**
 * BusinessRuleReasoner
 * 
 * Classifies business rules as EXPLICIT, IMPLICIT, DERIVED, CONFLICTING, or UNKNOWN.
 * Never invents rules — only classifies what exists in the OIR.
 */

import { OirGraph, ActionNode } from "../../types.js";
import { InferredBusinessRule, MultidimensionalConfidence } from "../types.js";

export function reasonBusinessRules(graph: OirGraph): InferredBusinessRule[] {
  const rules: InferredBusinessRule[] = [];

  // Explicit rules: directly from OIR businessRules
  for (const rule of graph.businessRules) {
    rules.push({
      description: rule.description,
      classification: "EXPLICIT",
      evidenceIds: [rule.id],
      confidence: {
        reasoning: 1.0, evidence: 1.0, semantic: 0.9,
        structural: 1.0, operational: 0.95, unknown: 0.0
      }
    });
  }

  // Derived rules: infer from conditions in the graph
  for (const node of graph.nodes) {
    if (node.type === "CONDITION") {
      rules.push({
        description: `Conditional branch: ${node.expression}`,
        classification: "DERIVED",
        evidenceIds: [node.id],
        confidence: {
          reasoning: 0.8, evidence: 1.0, semantic: 0.6,
          structural: 1.0, operational: 0.7, unknown: 0.2
        }
      });
    }
  }

  // Detect conflicting rules: same condition different enforcement
  const conditionMap = new Map<string, string[]>();
  for (const rule of graph.businessRules) {
    const existing = conditionMap.get(rule.condition) || [];
    existing.push(rule.id);
    conditionMap.set(rule.condition, existing);
  }
  for (const [condition, ids] of conditionMap) {
    if (ids.length > 1) {
      rules.push({
        description: `CONFLICT: Multiple rules govern condition "${condition}"`,
        classification: "CONFLICTING",
        evidenceIds: ids,
        confidence: {
          reasoning: 1.0, evidence: 1.0, semantic: 0.9,
          structural: 1.0, operational: 1.0, unknown: 0.0
        }
      });
    }
  }

  // Implicit rules: side-effect actions without explicit governing rules
  const actions = graph.nodes.filter(n => n.type === "ACTION") as ActionNode[];
  const mutatingActions = actions.filter(a => a.sideEffects);
  const ruledActionIds = new Set(graph.businessRules.map(r => r.id));

  for (const action of mutatingActions) {
    // If a mutating action has no corresponding business rule, it's an implicit rule gap
    if (!ruledActionIds.has(action.id)) {
      rules.push({
        description: `Implicit: Mutating action "${action.name}" has no explicit governing rule`,
        classification: "IMPLICIT",
        evidenceIds: [action.id],
        confidence: {
          reasoning: 0.7, evidence: 0.8, semantic: 0.5,
          structural: 0.9, operational: 0.6, unknown: 0.3
        }
      });
    }
  }

  return rules;
}
