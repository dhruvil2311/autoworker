/**
 * Semantic Operational Reasoner V2
 * 
 * Ghost's cognitive brain. Infers business meaning, latent goals,
 * implicit policies, counterfactuals, and causal chains.
 * Uses a Reasoner -> Self Critic -> Verifier pipeline.
 * 
 * CHANGE LOG:
 * - reason() is now async because OperationalReasoner is async.
 * - V2 engines themselves remain synchronous (heuristic — to be replaced next).
 */

import { OirGraph } from "../types.js";
import { OperationalUnderstanding } from "../reasoner/types.js";
import { SemanticUnderstanding } from "./types.js";

import { inferBusinessMeaning } from "./engines/business-meaning.js";
import { inferLatentGoals } from "./engines/latent-goals.js";
import { interpretPolicies } from "./engines/policy-interpretation.js";
import { generateCounterfactuals } from "./engines/counterfactuals.js";
import { simulateExecution } from "./engines/simulation.js";
import { reviseBeliefs } from "./engines/belief-revision.js";
import { inferCausality } from "./engines/causal.js";
import { inferOrganizationalContext } from "./engines/organizational.js";
import { mapBusinessCapabilities } from "./engines/capability-mapper.js";
import { detectContradictions } from "./engines/contradictions.js";
import { judgeDecisionQuality } from "./engines/decision-quality.js";
import { recommendStrategies } from "./engines/strategy.js";
import { generateLearningDeltas } from "./engines/learning.js";

import { SelfCritic } from "./SelfCritic.js";
import { SemanticVerifier } from "./SemanticVerifier.js";

export class SemanticReasoner {
  public async reason(
    graph: OirGraph,
    understanding: OperationalUnderstanding
  ): Promise<SemanticUnderstanding> {
    
    // Deep-freeze to prevent mutations
    deepFreeze(graph);
    deepFreeze(understanding);

    // 1. Reasoner (run all 13 cognitive engines)
    const draft: SemanticUnderstanding = {
      version: "2.0",
      timestamp: new Date().toISOString(),
      sourceOirVersion: graph.version,
      
      businessMeaning: await inferBusinessMeaning(understanding, graph),
      latentGoals: await inferLatentGoals(understanding, graph),
      implicitPolicies: await interpretPolicies(understanding, graph),
      counterfactuals: generateCounterfactuals(understanding, graph),
      simulations: simulateExecution(understanding, graph),
      businessBeliefs: reviseBeliefs(understanding, graph),
      causalChains: inferCausality(understanding, graph),
      organizationalContext: inferOrganizationalContext(understanding, graph),
      capabilityMappings: mapBusinessCapabilities(understanding, graph),
      semanticContradictions: detectContradictions(understanding, graph),
      decisionQuality: judgeDecisionQuality(understanding, graph),
      operationalStrategies: recommendStrategies(understanding, graph),
      learningDeltas: generateLearningDeltas(understanding, graph),

      verificationResult: { passed: false, unsupportedClaims: 0, fabricatedEvidenceIds: [], rejectionReasons: [] }
    };

    // 2. Self Critic (challenges all claims in the draft)
    const selfCritic = new SelfCritic();
    selfCritic.challenge(draft, graph, understanding);

    // 3. Verifier (final verification against OIR boundaries)
    const verifier = new SemanticVerifier();
    const verification = verifier.verify(draft, graph, understanding);
    draft.verificationResult = verification;

    if (!verification.passed) {
      throw new Error(
        `SEMANTIC INTEGRITY VIOLATION: The semantic reasoner generated unsupported or fabricated claims.\n` +
        `Reasons: \n` + verification.rejectionReasons.join("\n")
      );
    }

    return draft;
  }
}

function deepFreeze(obj: any): void {
  if (obj === null || typeof obj !== "object") return;
  if (Object.isFrozen(obj)) return;
  Object.freeze(obj);
  for (const value of Object.values(obj)) {
    deepFreeze(value);
  }
}
