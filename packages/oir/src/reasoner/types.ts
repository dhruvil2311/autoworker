/**
 * Operational Reasoner — Output Types
 * 
 * The OperationalUnderstanding is the canonical output artifact of the Operational Reasoner.
 * It is a READ-ONLY interpretation of a validated OirGraph.
 * Nothing in this structure may be fabricated — every conclusion traces to OIR evidence
 * or is explicitly marked UNKNOWN.
 */

// ─── Multidimensional Confidence ────────────────────────────────────────────

export interface MultidimensionalConfidence {
  reasoning: number;    // How sound is the logical chain? (0-1)
  evidence: number;     // How much raw evidence supports this? (0-1)
  semantic: number;     // How unambiguous is the semantic meaning? (0-1)
  structural: number;   // How well does the OIR graph structure support this? (0-1)
  operational: number;  // How likely is this the actual business operation? (0-1)
  unknown: number;      // How much is still unknown? (0 = fully known, 1 = fully unknown)
}

// ─── Goal ───────────────────────────────────────────────────────────────────

export interface InferredGoal {
  description: string;
  evidenceIds: string[];
  confidence: MultidimensionalConfidence;
  alternatives: string[];
}

// ─── Intent ─────────────────────────────────────────────────────────────────

export interface OperationalIntent {
  description: string;       // What this IS: "Approve Purchase Order"
  notDescription: string;    // What this is NOT: "Click submit button"
  evidenceIds: string[];
  confidence: MultidimensionalConfidence;
  reasoning?: string;
  alternativeHypotheses?: string[];
  unknowns?: string[];
  assumptions?: string[];
}

// ─── Constraints ────────────────────────────────────────────────────────────

export type ConstraintType =
  | "BUDGET"
  | "AUTHORITY"
  | "POLICY"
  | "PERMISSION"
  | "DEADLINE"
  | "DEPENDENCY"
  | "COMPLIANCE";

export interface Constraint {
  type: ConstraintType;
  description: string;
  evidenceIds: string[];
  confidence: MultidimensionalConfidence;
  reasoning?: string;
  alternativeHypotheses?: string[];
  unknowns?: string[];
  assumptions?: string[];
  selfCriticism?: any; // To hold self-criticism like in SemanticClaim
}

// ─── Business Rules ─────────────────────────────────────────────────────────

export type RuleClassification =
  | "EXPLICIT"
  | "IMPLICIT"
  | "DERIVED"
  | "CONFLICTING"
  | "UNKNOWN";

export interface InferredBusinessRule {
  description: string;
  classification: RuleClassification;
  evidenceIds: string[];
  confidence: MultidimensionalConfidence;
}

// ─── Assumptions ────────────────────────────────────────────────────────────

export interface Assumption {
  description: string;
  basis: string;            // Why this assumption was made
  evidenceIds: string[];
  riskIfWrong: string;      // What breaks if this assumption is false
}

// ─── Unknowns ───────────────────────────────────────────────────────────────

export interface Unknown {
  description: string;
  impact: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  resolvableVia: string;    // What information would resolve this
  evidenceIds?: string[];
  confidence?: MultidimensionalConfidence;
  reasoning?: string;
  alternativeHypotheses?: string[];
  unknowns?: string[]; // Nested unknowns if needed
  assumptions?: string[];
  selfCriticism?: any;
}

// ─── Operational Risks ──────────────────────────────────────────────────────

export type RiskType =
  | "DATA_LOSS"
  | "DUPLICATE_ORDER"
  | "WRONG_CUSTOMER"
  | "INVENTORY_DRIFT"
  | "INCORRECT_REFUND"
  | "FINANCIAL_RISK"
  | "COMPLIANCE_RISK"
  | "SECURITY_RISK"
  | "INTEGRATION_FAILURE"
  | "DATA_CORRUPTION";

export interface OperationalRisk {
  type: RiskType;
  description: string;
  likelihood: "LOW" | "MEDIUM" | "HIGH";
  impact: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  evidenceIds: string[];
  mitigations: string[];
}

// ─── Alternative Hypotheses ─────────────────────────────────────────────────

export interface AlternativeHypothesis {
  description: string;
  evidenceFor: string[];
  evidenceAgainst: string[];
  confidence: MultidimensionalConfidence;
  rank: number;
}

// ─── Clarifications ─────────────────────────────────────────────────────────

export interface Clarification {
  question: string;
  expectedInformationGain: number;  // 0-1, how much this would reduce unknowns
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  targetAudience: string;           // "Process Owner", "IT Admin", etc.
  evidenceIds?: string[];
  confidence?: MultidimensionalConfidence;
  reasoning?: string;
  alternativeHypotheses?: string[];
  unknowns?: string[];
  assumptions?: string[];
  selfCriticism?: any;
}

// ─── Knowledge Gaps ─────────────────────────────────────────────────────────

export interface KnowledgeGap {
  description: string;
  resolvingInformation: string;
  evidenceIds?: string[];
  confidence?: MultidimensionalConfidence;
  reasoning?: string;
  alternativeHypotheses?: string[];
  unknowns?: string[];
  assumptions?: string[];
  selfCriticism?: any;
}

// ─── Operational Summary ────────────────────────────────────────────────────

export interface OperationalSummary {
  what: string;
  why: string;
  inputs: string[];
  outputs: string[];
  businessImpact: string;
  dependencies: string[];
  failureModes: string[];
  humanExpectations: string[];
}

// ─── Root Output ────────────────────────────────────────────────────────────

export interface OperationalUnderstanding {
  version: "1.0";
  timestamp: string;
  sourceOirVersion: string;

  goal: InferredGoal;
  intent: OperationalIntent;
  businessObjects: string[];      // Names referenced from OIR, not invented
  constraints: Constraint[];
  rules: InferredBusinessRule[];
  assumptions: Assumption[];
  unknowns: Unknown[];
  evidence: EvidenceChain[];
  confidence: MultidimensionalConfidence;
  risks: OperationalRisk[];
  alternatives: AlternativeHypothesis[];
  informationGains: KnowledgeGap[];
  clarifications: Clarification[];
  summary: OperationalSummary;
}

// ─── Evidence Chain ─────────────────────────────────────────────────────────

export interface EvidenceChain {
  conclusionId: string;
  conclusion: string;
  evidenceIds: string[];
  reasoning: string;
  confidence: number;
}

// ─── Operational Critic Types ───────────────────────────────────────────────

export interface UnderstandingCriticism {
  problem: string;
  evidence: string;
  impact: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  suggestedFix: string;
  confidence: number;
}

export interface UnderstandingReviewReport {
  timestamp: string;
  criticisms: UnderstandingCriticism[];
  metrics: {
    totalCriticisms: number;
    unsupportedConclusions: number;
    missingEvidence: number;
    contradictions: number;
    lowConfidenceDimensions: number;
    missingUnknowns: number;
    missingAssumptions: number;
    missingAlternatives: number;
  };
}
