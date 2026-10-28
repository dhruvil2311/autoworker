import { OperationalUnderstanding } from "../../reasoner/types.js";
import { OirGraph } from "../../types.js";
import { OperationalStrategy } from "../types.js";
import { generateSelfCriticism } from "./self-critic.js";

export function recommendStrategies(
  understanding: OperationalUnderstanding,
  graph: OirGraph
): OperationalStrategy[] {
  const strategies: OperationalStrategy[] = [];

  const manualUI = graph.nodes.some(n => n.type === "ACTION" && (n as any).operation !== "API_CALL");
  const hasApis = graph.externalSystems.length > 0;

  if (manualUI && hasApis) {
    strategies.push({
      description: "API-first Strategy",
      betterAlternative: "Replace UI automation with direct API calls",
      expectedBenefits: ["Lower latency", "Higher reliability", "Stateless execution"],
      tradeoffs: ["Requires API access credentials", "May bypass UI-specific business logic"],
      evidenceIds: graph.nodes.filter(n => n.type === "ACTION").map(n => n.id),
      confidence: 0.9,
      selfCriticism: generateSelfCriticism("API-first Strategy", graph.nodes.filter(n => n.type === "ACTION").map(n => n.id))
    });
  }

  const hasDecisions = graph.nodes.some(n => n.type === "DECISION_POINT");
  if (!hasDecisions) {
    strategies.push({
      description: "Batch Processing Strategy",
      betterAlternative: "Execute operations in bulk rather than sequentially",
      expectedBenefits: ["Higher throughput", "Reduced system load"],
      tradeoffs: ["Higher blast radius on failure"],
      evidenceIds: [],
      confidence: 0.7,
      selfCriticism: generateSelfCriticism("Batch Processing Strategy", [])
    });
  }

  return strategies;
}
