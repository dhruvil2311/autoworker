import { OperationalUnderstanding } from "../../reasoner/types.js";
import { OirGraph } from "../../types.js";
import { DecisionQuality } from "../types.js";
import { generateSelfCriticism } from "./self-critic.js";

export function judgeDecisionQuality(
  understanding: OperationalUnderstanding,
  graph: OirGraph
): DecisionQuality {
  const flaws: string[] = [];
  const efficiencies: string[] = [];
  
  const hasExceptions = graph.nodes.some(n => n.type === "EXCEPTION");
  if (!hasExceptions) {
    flaws.push("No exception handling. Fragile workflow.");
  } else {
    efficiencies.push("Contains explicit exception handling paths.");
  }

  const mutatingActions = graph.nodes.filter(n => n.type === "ACTION" && (n as any).sideEffects);
  if (mutatingActions.length > 1) {
    flaws.push("Multiple sequential mutations. Not transactional.");
  }

  if (graph.externalSystems.length > 0) {
    efficiencies.push("Leverages external systems for automation.");
  }

  const isGoodWorkflow = flaws.length === 0;
  const qualityScore = Math.max(0, 1.0 - (flaws.length * 0.2) + (efficiencies.length * 0.1));

  return {
    description: `Workflow quality judged as ${isGoodWorkflow ? "GOOD" : "NEEDS IMPROVEMENT"}`,
    isGoodWorkflow,
    qualityScore: Math.min(1.0, qualityScore),
    flaws,
    efficiencies,
    evidenceIds: understanding.goal.evidenceIds,
    confidence: 0.8,
    selfCriticism: generateSelfCriticism(`Workflow quality judged as ${isGoodWorkflow ? "GOOD" : "NEEDS IMPROVEMENT"}`, understanding.goal.evidenceIds)
  };
}
