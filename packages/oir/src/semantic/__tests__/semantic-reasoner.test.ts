import { describe, it, expect, vi } from "vitest";
import { SemanticReasoner } from "../SemanticReasoner.js";
import { OperationalReasoner } from "../../reasoner/OperationalReasoner.js";
import { OirGraph } from "../../types.js";

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

function createValidGraph(): OirGraph {
  return {
    version: "1.0",
    businessGoal: "Process Refund for VIP Customer",
    businessObjects: [],
    variables: [{ id: "var_amount", name: "Refund Amount", type: "number" }],
    constants: [],
    businessRules: [
      { id: "rule_vip", description: "VIPs get immediate refunds", condition: "isVIP == true", enforcementLevel: "STRICT" }
    ],
    externalSystems: [
      { id: "sys_payment", name: "Payment Gateway", type: "API", url: "https://pay.example.com" }
    ],
    entities: [],
    evidenceLinks: [],
    knowledgeReferences: [],
    nodes: [
      {
        id: "action_refund",
        name: "POST /api/refund",
        type: "ACTION",
        operation: "API_CALL",
        inputs: { amount: 100 },
        outputs: [],
        sideEffects: true,
        systemId: "sys_payment",
        provenance: [{ source: "API_CALL", evidenceId: "obs_1" }],
        confidence: 0.95
      }
    ],
    dependencies: [],
    globalConfidence: 0.9,
    rootNodeId: "action_refund"
  };
}

describe("SemanticReasoner V2", () => {
  it("should process a valid OIR and produce a verified SemanticUnderstanding", async () => {
    const graph = createValidGraph();
    const opReasoner = new OperationalReasoner();
    const understanding = await opReasoner.reason(graph);

    const semanticReasoner = new SemanticReasoner();
    const semanticUnderstanding = await semanticReasoner.reason(graph, understanding);

    // Assert semantic verification passed
    expect(semanticUnderstanding.verificationResult.passed).toBe(true);
    expect(semanticUnderstanding.verificationResult.unsupportedClaims).toBe(0);

    // Self Critic should exist
    expect(semanticUnderstanding.businessMeaning.objective.selfCriticism).toBeDefined();
  });

  it("should detect causal chains from dependencies", async () => {
    const graph = createValidGraph();
    graph.nodes.push({
      id: "action_notify",
      name: "Send Email",
      type: "ACTION",
      operation: "API_CALL",
      inputs: {},
      outputs: [],
      sideEffects: true,
      confidence: 0.9
    });
    graph.dependencies.push({ sourceId: "action_refund", targetId: "action_notify", type: "CONTROL" });

    const opReasoner = new OperationalReasoner();
    const understanding = await opReasoner.reason(graph);

    const semanticReasoner = new SemanticReasoner();
    const semanticUnderstanding = await semanticReasoner.reason(graph, understanding);

    expect(semanticUnderstanding.causalChains.length).toBe(1);
    expect(semanticUnderstanding.causalChains[0].cause).toBe("POST /api/refund");
    expect(semanticUnderstanding.causalChains[0].effect).toBe("Send Email");
  });
});
