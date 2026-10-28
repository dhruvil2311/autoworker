/**
 * AlternativeHypothesisEngine
 * 
 * Never produces only one explanation.
 * Always generates multiple operational hypotheses, ranked.
 */

import { OirGraph, ActionNode } from "../../types.js";
import { AlternativeHypothesis, MultidimensionalConfidence } from "../types.js";

export function generateAlternatives(graph: OirGraph): AlternativeHypothesis[] {
  const alternatives: AlternativeHypothesis[] = [];
  const actions = graph.nodes.filter(n => n.type === "ACTION") as ActionNode[];
  const allNodeIds = graph.nodes.map(n => n.id);

  // Primary hypothesis: the stated goal is correct
  if (graph.businessGoal) {
    alternatives.push({
      description: `Primary: This operation is "${graph.businessGoal}" as declared.`,
      evidenceFor: allNodeIds,
      evidenceAgainst: [],
      confidence: {
        reasoning: 0.9, evidence: 0.9, semantic: 0.85,
        structural: 0.95, operational: 0.9, unknown: 0.1
      },
      rank: 1
    });
  }

  // Alternative: Read-only investigation
  const readOnlyActions = actions.filter(a => !a.sideEffects);
  if (readOnlyActions.length > 0) {
    alternatives.push({
      description: "Alternative: This is a read-only investigation or audit workflow.",
      evidenceFor: readOnlyActions.map(a => a.id),
      evidenceAgainst: actions.filter(a => a.sideEffects).map(a => a.id),
      confidence: {
        reasoning: 0.5, evidence: readOnlyActions.length / Math.max(actions.length, 1),
        semantic: 0.4, structural: 0.6, operational: 0.4,
        unknown: 0.4
      },
      rank: 2
    });
  }

  // Alternative: Data migration/sync
  if (graph.externalSystems.length > 1) {
    alternatives.push({
      description: "Alternative: This is a cross-system data synchronization workflow.",
      evidenceFor: graph.externalSystems.map(s => s.id),
      evidenceAgainst: [],
      confidence: {
        reasoning: 0.4, evidence: graph.externalSystems.length > 1 ? 0.7 : 0.2,
        semantic: 0.3, structural: 0.5, operational: 0.35,
        unknown: 0.5
      },
      rank: 3
    });
  }

  // Alternative: Error recovery
  const hasExceptions = graph.nodes.some(n => n.type === "EXCEPTION");
  if (hasExceptions) {
    alternatives.push({
      description: "Alternative: This is an error recovery or remediation workflow.",
      evidenceFor: graph.nodes.filter(n => n.type === "EXCEPTION").map(n => n.id),
      evidenceAgainst: readOnlyActions.map(a => a.id),
      confidence: {
        reasoning: 0.35, evidence: 0.5, semantic: 0.3,
        structural: 0.6, operational: 0.3, unknown: 0.5
      },
      rank: 4
    });
  }

  // Ensure minimum 2 alternatives
  while (alternatives.length < 2) {
    alternatives.push({
      description: `Alternative: Insufficient evidence to generate hypothesis #${alternatives.length + 1}.`,
      evidenceFor: [],
      evidenceAgainst: [],
      confidence: {
        reasoning: 0.1, evidence: 0.0, semantic: 0.1,
        structural: 0.1, operational: 0.1, unknown: 0.9
      },
      rank: alternatives.length + 1
    });
  }

  return alternatives.sort((a, b) => a.rank - b.rank);
}

