import { OperationalUnderstanding } from "../../reasoner/types.js";
import { OirGraph } from "../../types.js";
import { SemanticContradiction } from "../types.js";
import { generateSelfCriticism } from "./self-critic.js";

export function detectContradictions(
  understanding: OperationalUnderstanding,
  graph: OirGraph
): SemanticContradiction[] {
  const contradictions: SemanticContradiction[] = [];

  // Example heuristic: A refund goal but no mutating actions
  const isRefundGoal = understanding.goal.description.toLowerCase().includes("refund");
  const hasMutations = graph.nodes.some(n => n.type === "ACTION" && (n as any).sideEffects);

  if (isRefundGoal && !hasMutations) {
    contradictions.push({
      description: "Financial intent without state mutation",
      conflictingClaims: ["Goal is Process Refund", "No actions have sideEffects = true"],
      logicalFlaw: "A refund inherently requires a state mutation. The OIR graph does not reflect this.",
      evidenceIds: understanding.goal.evidenceIds,
      confidence: 0.95,
      selfCriticism: generateSelfCriticism("Financial intent without state mutation", understanding.goal.evidenceIds)
    });
  }

  return contradictions;
}
