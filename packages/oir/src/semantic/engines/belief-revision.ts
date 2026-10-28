import { OperationalUnderstanding } from "../../reasoner/types.js";
import { OirGraph } from "../../types.js";
import { BusinessBelief } from "../types.js";
import { generateSelfCriticism } from "./self-critic.js";

export function reviseBeliefs(
  understanding: OperationalUnderstanding,
  graph: OirGraph
): BusinessBelief[] {
  const beliefs: BusinessBelief[] = [];
  
  // Since we don't have a persistent store right now, we create initial beliefs based on the understanding
  
  beliefs.push({
    description: `The operation "${understanding.goal.description}" is valid.`,
    beliefId: "belief_goal_validity",
    version: 1,
    history: [
      {
        timestamp: new Date().toISOString(),
        description: "Initial belief formation based on OIR structural extraction.",
        confidenceDelta: 0.8,
        triggeringEvidenceIds: understanding.goal.evidenceIds
      }
    ],
    evidenceIds: understanding.goal.evidenceIds,
    confidence: 0.8,
    selfCriticism: generateSelfCriticism(`The operation "${understanding.goal.description}" is valid.`, understanding.goal.evidenceIds)
  });

  return beliefs;
}
