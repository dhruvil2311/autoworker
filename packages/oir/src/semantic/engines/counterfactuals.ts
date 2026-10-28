import { OperationalUnderstanding } from "../../reasoner/types.js";
import { OirGraph } from "../../types.js";
import { CounterfactualScenario } from "../types.js";
import { generateSelfCriticism } from "./self-critic.js";

export function generateCounterfactuals(
  understanding: OperationalUnderstanding,
  graph: OirGraph
): CounterfactualScenario[] {
  const scenarios: CounterfactualScenario[] = [];
  
  // What if API unavailable?
  if (graph.externalSystems.length > 0) {
    for (const sys of graph.externalSystems) {
      scenarios.push({
        description: `API Outage Scenario: ${sys.name}`,
        whatIfCondition: `What if ${sys.name} is offline?`,
        expectedOutcome: "Workflow halts. Data synchronization fails.",
        operationalAlternatives: ["Queue requests locally", "Use fallback cache", "Trigger manual SOP"],
        evidenceIds: [sys.id],
        confidence: 0.9,
        selfCriticism: generateSelfCriticism(`API Outage Scenario: ${sys.name}`, [sys.id])
      });
    }
  }

  // What if variable missing?
  if (graph.variables.length > 0) {
    const criticalVar = graph.variables[0];
    if (criticalVar) {
      scenarios.push({
        description: `Missing Input Data Scenario: ${criticalVar.name}`,
        whatIfCondition: `What if ${criticalVar.name} is missing or null?`,
        expectedOutcome: "Validation fails or action executes with incomplete data.",
        operationalAlternatives: ["Halt and prompt user", "Use default value", "Reject request"],
        evidenceIds: [criticalVar.id],
        confidence: 0.85,
        selfCriticism: generateSelfCriticism(`Missing Input Data Scenario: ${criticalVar.name}`, [criticalVar.id])
      });
    }
  }

  return scenarios;
}
