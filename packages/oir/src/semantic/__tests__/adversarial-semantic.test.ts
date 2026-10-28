import { describe, it, expect, vi } from "vitest";
import { SemanticReasoner } from "../SemanticReasoner.js";
import { OperationalReasoner } from "../../reasoner/OperationalReasoner.js";
import { SemanticVerifier } from "../SemanticVerifier.js";
import { OirGraph } from "../../types.js";
import { SemanticUnderstanding } from "../types.js";

// ─── Mock the LLM Client ────────────────────────────────────────────────────

vi.mock("../../intelligence/llm-client.js", () => ({
  callLlm: vi.fn().mockImplementation(async (options: any) => {

    const prompt = options.userPrompt as string;
    let goal = "Unknown Process";
    let evidenceIds: string[] = [];
    const idMatches = prompt.match(/\[([a-z_0-9]+)\] ACTION/g);
    if (idMatches) evidenceIds = idMatches.map(m => m.match(/\[([^\]]+)\]/)![1]);
    const goalMatch = prompt.match(/## Business Goal\n(.+)/);
    if (goalMatch && goalMatch[1] !== "NOT DECLARED") goal = goalMatch[1];
    
    const mockConfidence = { reasoning: 0.9, evidence: 0.8, semantic: 0.7, structural: 0.9, operational: 0.9, unknown: 0.1 };
    const mockSelfCriticism = { whyIBelieveThis: "Mock", otherExplanations: [], disprovingEvidenceIds: [], missingEvidence: [], certaintyLevel: 0.9, expertDisagreementLikelihood: "LOW", shouldClarifyInstead: false };

    if (prompt.includes("Operational Intent Inference Engine")) {
      return { data: { description: "Approve Purchase Order", notDescription: "Clicking a button", evidenceIds, confidence: mockConfidence, reasoning: "Mock logic", alternativeHypotheses: [], unknowns: [], assumptions: [] }, model: "mock", promptTokens: 50, completionTokens: 30, latencyMs: 5 };
    }
    
    if (prompt.includes("Business Meaning Inference Engine")) {
      const mc = { description: "Mock Meaning", evidenceIds, confidence: 0.9, reasoning: "Because mock", selfCriticism: mockSelfCriticism };
      return { data: { objective: mc, capability: mc, function: mc, outcome: mc, kpi: mc }, model: "mock", promptTokens: 50, completionTokens: 30, latencyMs: 5 };
    }

    if (prompt.includes("Constraint Understanding Engine")) {
      return { data: { constraints: [{ type: "SYSTEM", description: "Mock Constraint", evidenceIds, confidence: mockConfidence, reasoning: "Mock reasoning", selfCriticism: mockSelfCriticism }] }, model: "mock", promptTokens: 50, completionTokens: 30, latencyMs: 5 };
    }

    if (prompt.includes("Unknown Detection Engine")) {
      // The tests check for CRITICAL unknowns and unknowns length > 0
      return { data: { unknowns: [{ description: "Mock Unknown", impact: "CRITICAL", resolvableVia: "Ask", evidenceIds, confidence: mockConfidence, reasoning: "Mock reasoning", selfCriticism: mockSelfCriticism }] }, model: "mock", promptTokens: 50, completionTokens: 30, latencyMs: 5 };
    }

    if (prompt.includes("Clarification & Information Gain Engine")) {
      return { data: { clarifications: [{ question: "Mock clarification", expectedInformationGain: 0.9, priority: "HIGH", targetAudience: "Process Owner", evidenceIds, confidence: mockConfidence, reasoning: "Mock", selfCriticism: mockSelfCriticism }], knowledgeGaps: [{ description: "Mock gap", resolvingInformation: "Ask", evidenceIds, confidence: mockConfidence, reasoning: "Mock", selfCriticism: mockSelfCriticism }] }, model: "mock", promptTokens: 50, completionTokens: 30, latencyMs: 5 };
    }

    if (prompt.includes("Latent Goal Inference Engine")) {
      return { data: { latentGoals: [{ description: "Mock Latent Goal", inferredFromGoal: goal, goalChain: [goal, "Mock Latent Goal"], evidenceIds, confidence: 0.9, reasoning: "Mock reasoning", selfCriticism: mockSelfCriticism }] }, model: "mock", promptTokens: 50, completionTokens: 30, latencyMs: 5 };
    }

    if (prompt.includes("Policy Interpretation Engine")) {
      return { data: { policies: [{ description: "Mock Policy", policyCategory: "OTHER", inferredRules: [], evidenceIds, confidence: 0.9, reasoning: "Mock reasoning", selfCriticism: mockSelfCriticism }] }, model: "mock", promptTokens: 50, completionTokens: 30, latencyMs: 5 };
    }

    return { data: { primaryGoal: goal, reasoning: "Mock goal", evidenceNodeIds: evidenceIds, alternatives: [{ goal: "Alt A", reasoning: "A" }], confidence: mockConfidence, crossValidation: { declaredGoalIsConsistent: true } }, model: "mock", promptTokens: 50, completionTokens: 30, latencyMs: 5 };
})
}));

function createEmptyGraph(): OirGraph {
  return {
    version: "1.0",
    businessGoal: "",
    businessObjects: [],
    variables: [],
    constants: [],
    businessRules: [],
    externalSystems: [],
    entities: [],
    evidenceLinks: [],
    knowledgeReferences: [],
    nodes: [],
    dependencies: [],
    globalConfidence: 0.1,
    rootNodeId: "unknown"
  };
}

describe("Adversarial: Semantic Verification & Fabrication Guard", () => {
  it("should mark claims with zero evidence for clarification", async () => {
    const graph = createEmptyGraph();
    const opReasoner = new OperationalReasoner();
    const understanding = await opReasoner.reason(graph);

    const semanticReasoner = new SemanticReasoner();
    const semanticUnderstanding = await semanticReasoner.reason(graph, understanding);

    // Because there's no evidence, the self-critic should mark claims to be clarified instead
    expect(semanticUnderstanding.verificationResult.passed).toBe(true);
    expect(semanticUnderstanding.businessMeaning.objective.selfCriticism?.shouldClarifyInstead).toBe(true);
  });

  it("should fail verification if a claim contains a fabricated evidence ID", () => {
    const graph = createEmptyGraph();

    const draft: SemanticUnderstanding = {
      version: "2.0",
      timestamp: new Date().toISOString(),
      sourceOirVersion: "1.0",
      businessMeaning: {
        objective: { description: "x", evidenceIds: ["FABRICATED"], confidence: 1 },
        capability: { description: "x", evidenceIds: [], confidence: 1 },
        function: { description: "x", evidenceIds: [], confidence: 1 },
        outcome: { description: "x", evidenceIds: [], confidence: 1 },
        kpi: { description: "x", evidenceIds: [], confidence: 1 },
      },
      latentGoals: [], implicitPolicies: [], counterfactuals: [], simulations: [],
      businessBeliefs: [], causalChains: [],
      organizationalContext: { description: "x", rolesInvolved: [], departments: [], approvalChains: [], authorityLevel: "LOW", evidenceIds: [], confidence: 1 },
      capabilityMappings: [], semanticContradictions: [],
      decisionQuality: { description: "x", isGoodWorkflow: true, qualityScore: 1, flaws: [], efficiencies: [], evidenceIds: [], confidence: 1 },
      operationalStrategies: [], learningDeltas: [],
      verificationResult: { passed: false, unsupportedClaims: 0, fabricatedEvidenceIds: [], rejectionReasons: [] }
    };

    const verifier = new SemanticVerifier();
    // Need a dummy understanding for the verifier
    const dummyUnderstanding = {
      version: "1.0" as const,
      timestamp: "", sourceOirVersion: "1.0",
      goal: { description: "", evidenceIds: [], confidence: { reasoning: 0, evidence: 0, semantic: 0, structural: 0, operational: 0, unknown: 1 }, alternatives: [] },
      intent: { description: "", notDescription: "", evidenceIds: [], confidence: { reasoning: 0, evidence: 0, semantic: 0, structural: 0, operational: 0, unknown: 1 } },
      businessObjects: [], constraints: [], rules: [], assumptions: [], unknowns: [],
      evidence: [], confidence: { reasoning: 0, evidence: 0, semantic: 0, structural: 0, operational: 0, unknown: 1 },
      risks: [], alternatives: [], informationGains: [], clarifications: [],
      summary: { what: "", why: "", inputs: [], outputs: [], businessImpact: "", dependencies: [], failureModes: [], humanExpectations: [] }
    };

    const result = verifier.verify(draft, graph, dummyUnderstanding);

    expect(result.passed).toBe(false);
    expect(result.unsupportedClaims).toBeGreaterThan(0);
    expect(result.fabricatedEvidenceIds).toContain("FABRICATED");
  });
});
