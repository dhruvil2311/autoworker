import { OperationalUnderstanding } from "../../reasoner/types.js";
import { OirGraph, ActionNode } from "../../types.js";
import { BusinessCapabilityMapping } from "../types.js";
import { generateSelfCriticism } from "./self-critic.js";

export function mapBusinessCapabilities(
  understanding: OperationalUnderstanding,
  graph: OirGraph
): BusinessCapabilityMapping[] {
  const mappings: BusinessCapabilityMapping[] = [];
  const actions = graph.nodes.filter(n => n.type === "ACTION") as ActionNode[];

  if (actions.length > 0) {
    const actionIds = actions.map(a => a.id);
    const actionNames = actions.map(a => a.name).join(" ").toLowerCase();
    
    let capability = "General Processing";
    let process = "Operations Task";
    let func = "Operations";
    
    if (actionNames.includes("refund") || actionNames.includes("payment")) {
      capability = "Payment Processing";
      process = "Refund Management";
      func = "Finance";
    } else if (actionNames.includes("stock") || actionNames.includes("inventory")) {
      capability = "Inventory Management";
      process = "Stock Replenishment";
      func = "Supply Chain";
    }

    mappings.push({
      description: `Mapped ${actions.length} actions to ${capability}`,
      lowLevelActions: actionIds,
      businessCapability: capability,
      businessProcess: process,
      businessFunction: func,
      businessObjective: understanding.goal.description || "Unknown",
      businessKpi: "Efficiency",
      evidenceIds: actionIds,
      confidence: 0.85,
      selfCriticism: generateSelfCriticism(`Mapped ${actions.length} actions to ${capability}`, actionIds)
    });
  }

  return mappings;
}
