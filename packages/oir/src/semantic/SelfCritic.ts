import { SemanticUnderstanding, SemanticClaim, SelfCriticism } from "./types.js";
import { OirGraph } from "../types.js";
import { OperationalUnderstanding } from "../reasoner/types.js";

/**
 * SelfCritic
 * 
 * Challenges every semantic statement before it is finalized.
 * Asks: Why do I believe this? Could another explanation exist?
 * What evidence disproves me? Which evidence is missing? How certain am I?
 * Would another expert disagree? Should this become a clarification question instead?
 */
export class SelfCritic {
  public challenge(
    draft: SemanticUnderstanding,
    graph: OirGraph,
    understanding: OperationalUnderstanding
  ): void {
    const claims = this.extractAllClaims(draft);
    
    for (const claim of claims) {
      if (!claim.selfCriticism) {
        // Generate self-criticism if the engine didn't provide one
        claim.selfCriticism = this.generateCriticism(claim, graph, understanding);
      } else {
        // Enhance existing self-criticism
        this.enhanceCriticism(claim, claim.selfCriticism, graph, understanding);
      }
      
      // If certainty level is extremely low, mark for clarification
      if (claim.selfCriticism.certaintyLevel < 0.5) {
        claim.selfCriticism.shouldClarifyInstead = true;
      }
    }
  }

  private enhanceCriticism(claim: SemanticClaim, sc: SelfCriticism, graph: OirGraph, understanding: OperationalUnderstanding) {
    if (claim.evidenceIds.length === 0 && sc.missingEvidence.length === 0) {
      sc.missingEvidence.push("No direct evidence linked in the OIR.");
      sc.shouldClarifyInstead = true;
      sc.certaintyLevel = Math.min(sc.certaintyLevel, 0.4);
    }

    if (claim.description.toLowerCase().includes("unknown")) {
      sc.shouldClarifyInstead = true;
    }
  }

  private generateCriticism(claim: SemanticClaim, graph: OirGraph, understanding: OperationalUnderstanding): SelfCriticism {
    return {
      whyIBelieveThis: `Derived via deterministic heuristics based on ${claim.evidenceIds.length} evidence nodes.`,
      otherExplanations: ["The context could be misinterpreted without further domain knowledge."],
      disprovingEvidenceIds: [],
      missingEvidence: claim.evidenceIds.length === 0 ? ["No supporting evidence"] : [],
      certaintyLevel: claim.evidenceIds.length > 0 ? claim.confidence : 0.3,
      expertDisagreementLikelihood: claim.evidenceIds.length > 0 ? "LOW" : "HIGH",
      shouldClarifyInstead: claim.evidenceIds.length === 0
    };
  }

  private extractAllClaims(draft: SemanticUnderstanding): SemanticClaim[] {
    const claims: SemanticClaim[] = [];
    
    claims.push(draft.businessMeaning.objective);
    claims.push(draft.businessMeaning.capability);
    claims.push(draft.businessMeaning.function);
    claims.push(draft.businessMeaning.outcome);
    claims.push(draft.businessMeaning.kpi);

    claims.push(...draft.latentGoals);
    claims.push(...draft.implicitPolicies);
    claims.push(...draft.counterfactuals);
    claims.push(...draft.simulations);
    claims.push(...draft.businessBeliefs);
    claims.push(...draft.causalChains);
    claims.push(draft.organizationalContext);
    claims.push(...draft.capabilityMappings);
    claims.push(...draft.semanticContradictions);
    claims.push(draft.decisionQuality);
    claims.push(...draft.operationalStrategies);
    claims.push(...draft.learningDeltas);

    return claims;
  }
}
