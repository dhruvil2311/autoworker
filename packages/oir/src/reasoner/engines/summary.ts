/**
 * OperationalSummaryGenerator
 * 
 * Synthesizes the complete operational explanation:
 * What, Why, Inputs, Outputs, Business Impact, Dependencies, Failure Modes, Human Expectations.
 */

import { OirGraph, ActionNode } from "../../types.js";
import { OperationalSummary, InferredGoal, OperationalRisk, Unknown } from "../types.js";

export function generateSummary(
  graph: OirGraph,
  goal: InferredGoal,
  risks: OperationalRisk[],
  unknowns: Unknown[]
): OperationalSummary {

  const actions = graph.nodes.filter(n => n.type === "ACTION") as ActionNode[];

  // What
  const what = goal.description !== ""
    ? `This operation performs: "${goal.description}" involving ${actions.length} action(s) across ${graph.externalSystems.length} external system(s).`
    : "UNKNOWN — insufficient evidence to determine the operation.";

  // Why
  const why = graph.businessRules.length > 0
    ? `Governed by ${graph.businessRules.length} business rule(s). ${graph.businessRules.map(r => r.description).join("; ")}`
    : "No explicit business rules defined. The business rationale is underdetermined.";

  // Inputs
  const inputs = graph.variables
    .filter(v => v.defaultValue !== undefined || v.type)
    .map(v => `${v.name} (${v.type})`);

  // Outputs
  const outputVarIds = new Set<string>();
  for (const action of actions) {
    for (const out of action.outputs) outputVarIds.add(out);
  }
  const outputs = graph.variables
    .filter(v => outputVarIds.has(v.id))
    .map(v => `${v.name} (${v.type})`);

  // Business Impact
  const criticalRisks = risks.filter(r => r.impact === "CRITICAL");
  const businessImpact = criticalRisks.length > 0
    ? `HIGH IMPACT: ${criticalRisks.length} critical risk(s) identified. ${criticalRisks.map(r => r.description).join("; ")}`
    : "Standard operational impact. No critical risks detected.";

  // Dependencies
  const dependencies = graph.dependencies.map(
    d => `${d.sourceId} → ${d.targetId} (${d.type})`
  );

  // Failure Modes
  const failureModes = risks.map(r => `${r.type}: ${r.description}`);

  // Human Expectations
  const humanExpectations: string[] = [];
  if (unknowns.length > 0) {
    humanExpectations.push(`${unknowns.length} unknown(s) require human clarification before automation.`);
  }
  const hasDecisions = graph.nodes.some(n => n.type === "DECISION_POINT");
  if (hasDecisions) {
    humanExpectations.push("Decision points exist that may require human judgment.");
  }
  if (humanExpectations.length === 0) {
    humanExpectations.push("No explicit human intervention points detected.");
  }

  return {
    what,
    why,
    inputs,
    outputs,
    businessImpact,
    dependencies,
    failureModes,
    humanExpectations
  };
}
