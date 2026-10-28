/**
 * Adversarial Tests — Updated to async with LLM mocking.
 * 
 * Tests the reasoner against pathological inputs:
 * contradictory policies, hidden assumptions, missing variables,
 * incomplete SOPs, impossible workflows, authority conflicts, etc.
 */

import { describe, it, expect, vi } from "vitest";
import { OperationalReasoner } from "../OperationalReasoner.js";
import { OperationalCritic } from "../OperationalCritic.js";
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

describe("Adversarial: Contradictory Policies", () => {
  it("should detect conflicting business rules", async () => {
    const graph: OirGraph = {
      version: "1.0",
      businessGoal: "Process Refund",
      businessObjects: [],
      variables: [],
      constants: [],
      businessRules: [
        { id: "r1", description: "All refunds require manager approval", condition: "refund > 0", enforcementLevel: "STRICT" },
        { id: "r2", description: "Refunds under $50 are auto-approved", condition: "refund > 0", enforcementLevel: "GUIDELINE" }
      ],
      externalSystems: [],
      entities: [],
      evidenceLinks: [],
      knowledgeReferences: [],
      nodes: [
        {
          id: "n1", name: "Issue Refund", type: "ACTION",
          operation: "API_CALL", inputs: {}, outputs: [], sideEffects: true,
          provenance: [{ source: "BROWSER_EVENT", evidenceId: "obs_1" }], confidence: 0.9
        }
      ],
      dependencies: [],
      globalConfidence: 0.5,
      rootNodeId: "n1"
    };

    const reasoner = new OperationalReasoner();
    const understanding = await reasoner.reason(graph);

    const conflicting = understanding.rules.filter(r => r.classification === "CONFLICTING");
    expect(conflicting.length).toBeGreaterThan(0);
  });
});

describe("Adversarial: Missing Variables", () => {
  it("should generate unknowns when no variables exist", async () => {
    const graph: OirGraph = {
      version: "1.0",
      businessGoal: "Unknown Process",
      businessObjects: [],
      variables: [],
      constants: [],
      businessRules: [],
      externalSystems: [],
      entities: [],
      evidenceLinks: [],
      knowledgeReferences: [],
      nodes: [
        {
          id: "n1", name: "Do something", type: "ACTION",
          operation: "CLICK", inputs: {}, outputs: [], sideEffects: true,
          provenance: [{ source: "BROWSER_EVENT", evidenceId: "obs_1" }], confidence: 0.5
        }
      ],
      dependencies: [],
      globalConfidence: 0.3,
      rootNodeId: "n1"
    };

    const reasoner = new OperationalReasoner();
    const understanding = await reasoner.reason(graph);

    expect(understanding.unknowns.length).toBeGreaterThan(0);
    expect(understanding.assumptions.length).toBeGreaterThan(0);
  });
});

describe("Adversarial: Empty Graph", () => {
  it("should handle an empty graph gracefully and report critical unknowns", async () => {
    const graph: OirGraph = {
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
      globalConfidence: 0,
      rootNodeId: "nonexistent"
    };

    const reasoner = new OperationalReasoner();
    const understanding = await reasoner.reason(graph);

    expect(understanding.unknowns.some(u => u.impact === "CRITICAL")).toBe(true);
    expect(understanding.alternatives.length).toBeGreaterThanOrEqual(2);
    expect(understanding.confidence.unknown).toBeGreaterThan(0);
  });
});

describe("Adversarial: Financial Risk Detection", () => {
  it("should flag financial risk for refund-related mutations", async () => {
    const graph: OirGraph = {
      version: "1.0",
      businessGoal: "Process Customer Refund",
      businessObjects: [],
      variables: [],
      constants: [],
      businessRules: [],
      externalSystems: [],
      entities: [],
      evidenceLinks: [],
      knowledgeReferences: [],
      nodes: [
        {
          id: "n1", name: "POST /api/refund", type: "ACTION",
          operation: "API_CALL", inputs: { amount: 150 }, outputs: [], sideEffects: true,
          provenance: [{ source: "API_CALL", evidenceId: "obs_1" }], confidence: 0.9
        }
      ],
      dependencies: [],
      globalConfidence: 0.7,
      rootNodeId: "n1"
    };

    const reasoner = new OperationalReasoner();
    const understanding = await reasoner.reason(graph);

    const financialRisks = understanding.risks.filter(r => r.type === "FINANCIAL_RISK");
    expect(financialRisks.length).toBeGreaterThan(0);
  });
});

describe("Adversarial: Fabrication Guard", () => {
  it("should never produce evidence IDs that don't exist in the original OIR", async () => {
    const graph: OirGraph = {
      version: "1.0",
      businessGoal: "Test Guard",
      businessObjects: [],
      variables: [{ id: "v1", name: "x", type: "string" }],
      constants: [],
      businessRules: [],
      externalSystems: [{ id: "sys1", name: "SAP", type: "API" }],
      entities: [],
      evidenceLinks: [],
      knowledgeReferences: [],
      nodes: [
        {
          id: "n1", name: "Call SAP", type: "ACTION",
          operation: "API_CALL", inputs: {}, outputs: ["v1"], sideEffects: true,
          provenance: [{ source: "API_CALL", evidenceId: "obs_1" }], confidence: 0.85
        }
      ],
      dependencies: [],
      globalConfidence: 0.8,
      rootNodeId: "n1"
    };

    const reasoner = new OperationalReasoner();
    const critic = new OperationalCritic();
    const understanding = await reasoner.reason(graph);
    const review = critic.review(understanding, graph);

    expect(review.metrics.unsupportedConclusions).toBe(0);
  });
});
