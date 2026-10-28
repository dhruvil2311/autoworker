/**
 * OperationalCritic
 * 
 * Independent validator for OperationalUnderstanding.
 * The critic NEVER modifies the understanding — it only attacks it.
 */

import { OirGraph } from "../types.js";
import {
  OperationalUnderstanding,
  UnderstandingCriticism,
  UnderstandingReviewReport
} from "./types.js";

export class OperationalCritic {
  public review(
    understanding: OperationalUnderstanding,
    graph: OirGraph
  ): UnderstandingReviewReport {
    const criticisms: UnderstandingCriticism[] = [];
    let unsupportedConclusions = 0;
    let missingEvidence = 0;
    let contradictions = 0;
    let lowConfidenceDimensions = 0;
    let missingUnknowns = 0;
    let missingAssumptions = 0;
    let missingAlternatives = 0;

    // Build valid evidence set from OIR
    const validIds = new Set<string>();
    for (const node of graph.nodes) {
      validIds.add(node.id);
      if (node.provenance) {
        for (const p of node.provenance) {
          if (p.evidenceId) validIds.add(p.evidenceId);
        }
      }
    }
    for (const e of graph.entities) validIds.add(e.id);
    for (const v of graph.variables) validIds.add(v.id);
    for (const c of graph.constants) validIds.add(c.id);
    for (const bo of graph.businessObjects) validIds.add(bo.id);
    for (const br of graph.businessRules) validIds.add(br.id);
    for (const es of graph.externalSystems) validIds.add(es.id);

    // 1. Unsupported conclusions (evidenceIds that don't exist in OIR)
    const allRefIds = [
      ...understanding.goal.evidenceIds,
      ...understanding.intent.evidenceIds,
      ...understanding.constraints.flatMap(c => c.evidenceIds),
      ...understanding.rules.flatMap(r => r.evidenceIds),
      ...understanding.risks.flatMap(r => r.evidenceIds),
      ...understanding.alternatives.flatMap(a => [...a.evidenceFor, ...a.evidenceAgainst])
    ];

    for (const id of allRefIds) {
      if (!validIds.has(id)) {
        criticisms.push({
          problem: "Unsupported Conclusion",
          evidence: `Evidence ID "${id}" referenced in understanding but not found in OIR.`,
          impact: "CRITICAL",
          suggestedFix: "Remove fabricated evidence reference or trace to valid OIR node.",
          confidence: 1.0
        });
        unsupportedConclusions++;
      }
    }

    // 2. Missing evidence (conclusions with zero evidence)
    if (understanding.goal.evidenceIds.length === 0) {
      criticisms.push({
        problem: "Missing Evidence",
        evidence: "Goal inference has zero supporting evidence IDs.",
        impact: "HIGH",
        suggestedFix: "Link goal to at least one OIR action node.",
        confidence: 1.0
      });
      missingEvidence++;
    }

    for (const chain of understanding.evidence) {
      if (chain.evidenceIds.length === 0) {
        criticisms.push({
          problem: "Missing Evidence",
          evidence: `Evidence chain "${chain.conclusionId}" has no supporting evidence.`,
          impact: "HIGH",
          suggestedFix: "Trace this conclusion back to raw observations.",
          confidence: 1.0
        });
        missingEvidence++;
      }
    }

    // 3. Contradictions (conflicting rules)
    const conflictingRules = understanding.rules.filter(r => r.classification === "CONFLICTING");
    if (conflictingRules.length > 0) {
      for (const rule of conflictingRules) {
        criticisms.push({
          problem: "Contradiction",
          evidence: `Conflicting rule detected: "${rule.description}"`,
          impact: "HIGH",
          suggestedFix: "Resolve conflicting rules through clarification.",
          confidence: 1.0
        });
        contradictions++;
      }
    }

    // 4. Low confidence dimensions (any dimension < 0.3)
    const confDims = understanding.confidence;
    const dims: [string, number][] = [
      ["reasoning", confDims.reasoning],
      ["evidence", confDims.evidence],
      ["semantic", confDims.semantic],
      ["structural", confDims.structural],
      ["operational", confDims.operational]
    ];
    for (const [name, val] of dims) {
      if (val < 0.3) {
        criticisms.push({
          problem: "Low Confidence Dimension",
          evidence: `Confidence dimension "${name}" is ${val} (below 0.3 threshold).`,
          impact: "MEDIUM",
          suggestedFix: "Provide additional evidence or clarification to increase confidence.",
          confidence: 1.0
        });
        lowConfidenceDimensions++;
      }
    }

    // 5. Missing unknowns (side-effect actions with no corresponding risk)
    const mutatingActions = graph.nodes.filter(
      n => n.type === "ACTION" && (n as any).sideEffects
    );
    if (mutatingActions.length > 0 && understanding.risks.length === 0) {
      criticisms.push({
        problem: "Missing Unknowns",
        evidence: `${mutatingActions.length} mutating actions exist but zero risks are identified.`,
        impact: "HIGH",
        suggestedFix: "RiskReasoner should flag data corruption / financial risks for mutations.",
        confidence: 0.95
      });
      missingUnknowns++;
    }

    // 6. Missing assumptions
    if (understanding.assumptions.length === 0 && graph.nodes.length > 0) {
      criticisms.push({
        problem: "Missing Assumptions",
        evidence: "Zero assumptions listed. Every inference carries hidden assumptions.",
        impact: "MEDIUM",
        suggestedFix: "AssumptionEngine should surface at minimum goal validity and ordering assumptions.",
        confidence: 0.9
      });
      missingAssumptions++;
    }

    // 7. Missing alternatives (only one hypothesis)
    if (understanding.alternatives.length < 2) {
      criticisms.push({
        problem: "Missing Alternatives",
        evidence: `Only ${understanding.alternatives.length} alternative hypothesis(es). Minimum 2 required.`,
        impact: "MEDIUM",
        suggestedFix: "AlternativeHypothesisEngine must generate at least 2 hypotheses.",
        confidence: 1.0
      });
      missingAlternatives++;
    }

    return {
      timestamp: new Date().toISOString(),
      criticisms,
      metrics: {
        totalCriticisms: criticisms.length,
        unsupportedConclusions,
        missingEvidence,
        contradictions,
        lowConfidenceDimensions,
        missingUnknowns,
        missingAssumptions,
        missingAlternatives
      }
    };
  }
}
