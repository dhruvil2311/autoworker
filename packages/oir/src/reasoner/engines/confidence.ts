/**
 * ConfidenceEngine
 * 
 * Computes the aggregate multidimensional confidence vector for the
 * entire OperationalUnderstanding. Never a single float.
 */

import { OirGraph } from "../../types.js";
import { MultidimensionalConfidence, InferredGoal, OperationalIntent, Constraint, InferredBusinessRule, Unknown, Assumption } from "../types.js";

export function computeGlobalConfidence(
  graph: OirGraph,
  goal: InferredGoal,
  intent: OperationalIntent,
  constraints: Constraint[],
  rules: InferredBusinessRule[],
  unknowns: Unknown[],
  assumptions: Assumption[]
): MultidimensionalConfidence {

  // Reasoning: weighted average of goal and intent reasoning confidence
  const reasoning = (goal.confidence.reasoning + intent.confidence.reasoning) / 2;

  // Evidence: proportion of nodes that have provenance
  const nodesWithProvenance = graph.nodes.filter(n => n.provenance && n.provenance.length > 0).length;
  const evidence = graph.nodes.length > 0 ? nodesWithProvenance / graph.nodes.length : 0;

  // Semantic: average semantic confidence from constraints and rules
  const semanticScores = [
    goal.confidence.semantic,
    intent.confidence.semantic,
    ...constraints.map(c => c.confidence.semantic),
    ...rules.map(r => r.confidence.semantic)
  ];
  const semantic = semanticScores.length > 0
    ? semanticScores.reduce((a, b) => a + b, 0) / semanticScores.length
    : 0;

  // Structural: graph completeness
  const hasGoal = graph.businessGoal.length > 0 ? 1 : 0;
  const hasNodes = graph.nodes.length > 0 ? 1 : 0;
  const hasVars = graph.variables.length > 0 ? 1 : 0;
  const hasDeps = graph.dependencies.length > 0 ? 1 : 0;
  const structural = (hasGoal + hasNodes + hasVars + hasDeps) / 4;

  // Operational: penalized by unknowns and critical assumptions
  const criticalUnknowns = unknowns.filter(u => u.impact === "CRITICAL").length;
  const operational = Math.max(0, 1 - (criticalUnknowns * 0.2) - (assumptions.length * 0.05));

  // Unknown: proportion of unknowns relative to total extracted knowledge
  const totalKnowledge = graph.nodes.length + graph.variables.length + graph.businessRules.length;
  const unknown = totalKnowledge > 0
    ? Math.min(unknowns.length / totalKnowledge, 1)
    : 1;

  return {
    reasoning: Math.round(reasoning * 100) / 100,
    evidence: Math.round(evidence * 100) / 100,
    semantic: Math.round(semantic * 100) / 100,
    structural: Math.round(structural * 100) / 100,
    operational: Math.round(operational * 100) / 100,
    unknown: Math.round(unknown * 100) / 100
  };
}
