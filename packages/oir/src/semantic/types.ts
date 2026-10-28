import { MultidimensionalConfidence, OperationalUnderstanding } from "../reasoner/types.js";
import { OirGraph } from "../types.js";

// ─── Core Semantic Base Types ───────────────────────────────────────────────

export interface SelfCriticism {
  whyIBelieveThis: string;
  otherExplanations: string[];
  disprovingEvidenceIds: string[];
  missingEvidence: string[];
  certaintyLevel: number;
  expertDisagreementLikelihood: "LOW" | "MEDIUM" | "HIGH";
  shouldClarifyInstead: boolean;
}

export interface SemanticClaim {
  description: string;
  evidenceIds: string[];
  confidence: number;
  selfCriticism?: SelfCriticism;
  reasoning?: string;
  alternativeHypotheses?: string[];
  unknowns?: string[];
  assumptions?: string[];
}

// ─── 1. Business Meaning Engine ─────────────────────────────────────────────

export interface BusinessMeaning {
  objective: SemanticClaim;
  capability: SemanticClaim;
  function: SemanticClaim;
  outcome: SemanticClaim;
  kpi: SemanticClaim;
}

// ─── 2. Latent Goal Engine ──────────────────────────────────────────────────

export interface LatentGoal extends SemanticClaim {
  inferredFromGoal: string; // The explicit goal
  goalChain: string[];      // e.g., ["Approve Refund", "Retain Customer", "Reduce Churn"]
}

// ─── 3. Policy Interpretation Engine ────────────────────────────────────────

export interface ImplicitPolicy extends SemanticClaim {
  policyCategory: "VIP" | "HIGH_RISK" | "URGENT" | "FRAUD" | "WHOLESALE" | "ENTERPRISE" | "OTHER";
  inferredRules: string[];
}

// ─── 4. Counterfactual Reasoner ─────────────────────────────────────────────

export interface CounterfactualScenario extends SemanticClaim {
  whatIfCondition: string;
  expectedOutcome: string;
  operationalAlternatives: string[];
}

// ─── 5. Simulation Engine ───────────────────────────────────────────────────

export interface SimulationResult extends SemanticClaim {
  simulatedScenario: string;
  likelyFailures: string[];
  policyViolations: string[];
  financialConsequences: string[];
  rollbackNeeds: string[];
  successProbability: number;
}

// ─── 6. Belief Revision Engine ──────────────────────────────────────────────

export interface BusinessBelief extends SemanticClaim {
  beliefId: string;
  version: number;
  history: {
    timestamp: string;
    description: string;
    confidenceDelta: number;
    triggeringEvidenceIds: string[];
  }[];
}

// ─── 7. Causal Reasoner ─────────────────────────────────────────────────────

export interface CausalChain extends SemanticClaim {
  cause: string;
  effect: string;
  businessImpact: string;
  dependencyType: "OPERATIONAL" | "FINANCIAL" | "TECHNICAL" | "COMPLIANCE";
}

// ─── 8. Organizational Reasoner ─────────────────────────────────────────────

export interface OrganizationalContext extends SemanticClaim {
  rolesInvolved: string[];
  departments: string[];
  approvalChains: string[];
  authorityLevel: "LOW" | "MEDIUM" | "HIGH" | "EXECUTIVE";
}

// ─── 9. Business Capability Mapper ──────────────────────────────────────────

export interface BusinessCapabilityMapping extends SemanticClaim {
  lowLevelActions: string[];
  businessCapability: string;
  businessProcess: string;
  businessFunction: string;
  businessObjective: string;
  businessKpi: string;
}

// ─── 10. Semantic Contradiction Engine ──────────────────────────────────────

export interface SemanticContradiction extends SemanticClaim {
  conflictingClaims: string[];
  logicalFlaw: string;
}

// ─── 11. Decision Quality Engine ────────────────────────────────────────────

export interface DecisionQuality extends SemanticClaim {
  isGoodWorkflow: boolean;
  qualityScore: number;
  flaws: string[];
  efficiencies: string[];
}

// ─── 12. Operational Strategy Engine ────────────────────────────────────────

export interface OperationalStrategy extends SemanticClaim {
  betterAlternative: string;
  expectedBenefits: string[];
  tradeoffs: string[];
}

// ─── 13. Learning Engine ────────────────────────────────────────────────────

export interface LearningDelta extends SemanticClaim {
  expectedOutcome: string;
  observedOutcome: string;
  deltaDescription: string;
  confidenceUpdate: number;
}

// ─── Verifier Types ─────────────────────────────────────────────────────────

export interface SemanticVerificationResult {
  passed: boolean;
  unsupportedClaims: number;
  fabricatedEvidenceIds: string[];
  rejectionReasons: string[];
}

// ─── Root Semantic Output ───────────────────────────────────────────────────

export interface SemanticUnderstanding {
  version: "2.0";
  timestamp: string;
  sourceOirVersion: string;

  businessMeaning: BusinessMeaning;
  latentGoals: LatentGoal[];
  implicitPolicies: ImplicitPolicy[];
  counterfactuals: CounterfactualScenario[];
  simulations: SimulationResult[];
  businessBeliefs: BusinessBelief[];
  causalChains: CausalChain[];
  organizationalContext: OrganizationalContext;
  capabilityMappings: BusinessCapabilityMapping[];
  semanticContradictions: SemanticContradiction[];
  decisionQuality: DecisionQuality;
  operationalStrategies: OperationalStrategy[];
  learningDeltas: LearningDelta[];

  verificationResult: SemanticVerificationResult;
}
