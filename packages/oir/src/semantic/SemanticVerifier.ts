import { SemanticUnderstanding, SemanticVerificationResult } from "./types.js";
import { OirGraph } from "../types.js";
import { OperationalUnderstanding } from "../reasoner/types.js";

/**
 * SemanticVerifier
 * 
 * Independently verifies every semantic output against OIR,
 * Business Beliefs, Evidence IDs, and Provenance.
 * Rejects unsupported conclusions.
 */
export class SemanticVerifier {
  public verify(
    draft: SemanticUnderstanding,
    graph: OirGraph,
    understanding: OperationalUnderstanding
  ): SemanticVerificationResult {
    let unsupportedClaims = 0;
    const fabricatedEvidenceIds: string[] = [];
    const rejectionReasons: string[] = [];

    // Build valid evidence set
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
    for (const d of graph.dependencies) {
      validIds.add(d.sourceId);
      validIds.add(d.targetId);
    }

    const claims = [
      draft.businessMeaning.objective,
      draft.businessMeaning.capability,
      draft.businessMeaning.function,
      draft.businessMeaning.outcome,
      draft.businessMeaning.kpi,
      ...draft.latentGoals,
      ...draft.implicitPolicies,
      ...draft.counterfactuals,
      ...draft.simulations,
      ...draft.businessBeliefs,
      ...draft.causalChains,
      draft.organizationalContext,
      ...draft.capabilityMappings,
      ...draft.semanticContradictions,
      draft.decisionQuality,
      ...draft.operationalStrategies,
      ...draft.learningDeltas
    ];

    for (const claim of claims) {
      for (const evidenceId of claim.evidenceIds) {
        if (!validIds.has(evidenceId)) {
          unsupportedClaims++;
          fabricatedEvidenceIds.push(evidenceId);
          rejectionReasons.push(`Claim "${claim.description}" references fabricated evidence ID: ${evidenceId}`);
        }
      }

      // If a claim has no evidence and shouldn't be a clarification, it's weakly supported
      // (We allow empty evidence if it's marked as shouldClarifyInstead)
      if (claim.evidenceIds.length === 0 && claim.selfCriticism && !claim.selfCriticism.shouldClarifyInstead) {
        unsupportedClaims++;
        rejectionReasons.push(`Claim "${claim.description}" has zero evidence but is not marked for clarification.`);
      }
    }

    const passed = unsupportedClaims === 0 && fabricatedEvidenceIds.length === 0;

    return {
      passed,
      unsupportedClaims,
      fabricatedEvidenceIds,
      rejectionReasons
    };
  }
}
