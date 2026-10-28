import { OperationalUnderstanding } from "../../reasoner/types.js";
import { OirGraph } from "../../types.js";
import { CausalChain } from "../types.js";
import { generateSelfCriticism } from "./self-critic.js";

export function inferCausality(
  understanding: OperationalUnderstanding,
  graph: OirGraph
): CausalChain[] {
  const chains: CausalChain[] = [];

  for (const dep of graph.dependencies) {
    const sourceNode = graph.nodes.find(n => n.id === dep.sourceId);
    const targetNode = graph.nodes.find(n => n.id === dep.targetId);

    if (sourceNode && targetNode) {
      const isFinancial = (targetNode as any).sideEffects && targetNode.name.toLowerCase().includes("refund");
      
      chains.push({
        description: `${sourceNode.name} causes ${targetNode.name}`,
        cause: sourceNode.name,
        effect: targetNode.name,
        businessImpact: isFinancial ? "Financial mutation" : "State transition",
        dependencyType: isFinancial ? "FINANCIAL" : "OPERATIONAL",
        evidenceIds: [dep.sourceId, dep.targetId],
        confidence: 0.9,
        selfCriticism: generateSelfCriticism(`${sourceNode.name} causes ${targetNode.name}`, [dep.sourceId, dep.targetId], ["Correlation does not imply causation, this is inferred from sequential dependency."])
      });
    }
  }

  return chains;
}
