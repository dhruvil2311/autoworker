import { OperationalUnderstanding } from "../../reasoner/types.js";
import { OirGraph } from "../../types.js";
import { SimulationResult } from "../types.js";
import { generateSelfCriticism } from "./self-critic.js";

export function simulateExecution(
  understanding: OperationalUnderstanding,
  graph: OirGraph
): SimulationResult[] {
  const results: SimulationResult[] = [];
  
  const hasExceptions = graph.nodes.some(n => n.type === "EXCEPTION");
  const sideEffectActions = graph.nodes.filter(n => n.type === "ACTION" && (n as any).sideEffects);

  results.push({
    description: "Happy Path Simulation",
    simulatedScenario: "All inputs valid, APIs available, rules satisfied.",
    likelyFailures: [],
    policyViolations: [],
    financialConsequences: ["Normal business operation costs"],
    rollbackNeeds: [],
    successProbability: 0.95,
    evidenceIds: graph.nodes.filter(n => n.type === "ACTION").map(n => n.id),
    confidence: 0.9,
    selfCriticism: generateSelfCriticism("Happy Path Simulation", [])
  });

  if (sideEffectActions.length > 0 && !hasExceptions) {
    const firstSideEffect = sideEffectActions[0];
    if (firstSideEffect) {
      results.push({
        description: "Unhappy Path: Mid-flight Failure Simulation",
        simulatedScenario: `Failure occurs after ${firstSideEffect.name}.`,
      likelyFailures: ["Partial state mutation without recovery"],
      policyViolations: ["Data consistency policy violation"],
      financialConsequences: ["Potential duplicate orders or lost funds"],
        rollbackNeeds: ["Requires manual rollback of the initial mutation"],
        successProbability: 0.05,
        evidenceIds: sideEffectActions.map(a => a.id),
        confidence: 0.85,
        selfCriticism: generateSelfCriticism("Unhappy Path: Mid-flight Failure Simulation", sideEffectActions.map(a => a.id))
      });
    }
  }

  return results;
}
