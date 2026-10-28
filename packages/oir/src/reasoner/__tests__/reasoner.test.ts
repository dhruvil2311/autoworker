/**
 * Tests for Operational Reasoner V1
 * 
 * Updated to async. Uses vitest mocking to intercept LLM calls
 * so tests remain fast, deterministic, and do not require an API key.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { OperationalReasoner } from "../OperationalReasoner.js";
import { OperationalCritic } from "../OperationalCritic.js";
import { OirGraph } from "../../types.js";

// ─── Mock the LLM Client ────────────────────────────────────────────────────
// This replaces the real LLM call with a deterministic mock response.

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

function createComplexGraph(): OirGraph {
  return {
    version: "1.0",
    businessGoal: "Restock Inventory",
    businessObjects: [
      { id: "bo_inv", name: "InventoryItem", description: "A product in the warehouse", properties: { sku: "string", stock: "number" } }
    ],
    variables: [
      { id: "var_sku", name: "sku", type: "string", description: "Product SKU" },
      { id: "var_qty", name: "quantity", type: "number" },
      { id: "var_result", name: "result", type: "object" }
    ],
    constants: [
      { id: "const_threshold", name: "restock_threshold", value: 10, type: "number" }
    ],
    businessRules: [
      { id: "rule_1", description: "Restock when stock falls below threshold", condition: "stock < threshold", enforcementLevel: "STRICT" }
    ],
    externalSystems: [
      { id: "sys_erp", name: "ERP System", type: "API", url: "https://erp.example.com" }
    ],
    entities: [
      { id: "entity_widget", type: "bo_inv", value: { sku: "W001", stock: 3 }, confidence: 0.9 }
    ],
    evidenceLinks: [],
    knowledgeReferences: [],
    nodes: [
      {
        id: "action_login",
        name: "Navigate to ERP",
        type: "ACTION",
        operation: "NAVIGATE",
        inputs: { url: "https://erp.example.com" },
        outputs: [],
        sideEffects: false,
        systemId: "sys_erp",
        provenance: [{ source: "BROWSER_EVENT", evidenceId: "obs_001" }],
        confidence: 0.95
      },
      {
        id: "action_lookup",
        name: "GET /api/inventory",
        type: "ACTION",
        operation: "API_CALL",
        inputs: {},
        outputs: ["var_result"],
        sideEffects: false,
        provenance: [{ source: "API_CALL", evidenceId: "obs_002" }],
        confidence: 0.95
      },
      {
        id: "action_restock",
        name: "POST /api/inventory/restock",
        type: "ACTION",
        operation: "API_CALL",
        inputs: { sku: "W001", quantity: 100 },
        outputs: [],
        sideEffects: true,
        provenance: [{ source: "API_CALL", evidenceId: "obs_003" }],
        confidence: 0.9
      }
    ],
    dependencies: [
      { sourceId: "action_login", targetId: "action_lookup", type: "CONTROL" },
      { sourceId: "action_lookup", targetId: "action_restock", type: "DATA" }
    ],
    globalConfidence: 0.9,
    rootNodeId: "action_login"
  };
}

describe("OperationalReasoner", () => {
  it("should produce a complete OperationalUnderstanding from a complex graph", async () => {
    const reasoner = new OperationalReasoner();
    const graph = createComplexGraph();
    const understanding = await reasoner.reason(graph);

    expect(understanding.version).toBe("1.0");
    expect(understanding.goal.description).toBe("Restock Inventory");
    expect(understanding.goal.evidenceIds.length).toBeGreaterThan(0);
    expect(understanding.intent.description).not.toBe("");
    expect(understanding.intent.notDescription).not.toBe("");
    expect(understanding.businessObjects).toContain("InventoryItem");
    expect(understanding.constraints.length).toBeGreaterThan(0);
    expect(understanding.rules.length).toBeGreaterThan(0);
    expect(understanding.assumptions.length).toBeGreaterThan(0);
    expect(understanding.unknowns.length).toBeGreaterThan(0);
    expect(understanding.risks.length).toBeGreaterThan(0);
    expect(understanding.alternatives.length).toBeGreaterThanOrEqual(2);
    expect(understanding.clarifications.length).toBeGreaterThan(0);
    expect(understanding.summary.what).toContain("Restock Inventory");
  });

  it("should never fabricate evidence — all evidenceIds must exist in OIR", async () => {
    const reasoner = new OperationalReasoner();
    const graph = createComplexGraph();
    const understanding = await reasoner.reason(graph);

    // Collect all valid IDs
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

    const allRefIds = [
      ...understanding.goal.evidenceIds,
      ...understanding.intent.evidenceIds,
      ...understanding.constraints.flatMap(c => c.evidenceIds),
      ...understanding.rules.flatMap(r => r.evidenceIds),
      ...understanding.risks.flatMap(r => r.evidenceIds),
      ...understanding.alternatives.flatMap(a => [...a.evidenceFor, ...a.evidenceAgainst])
    ];

    for (const id of allRefIds) {
      expect(validIds.has(id)).toBe(true);
    }
  });

  it("should produce multidimensional confidence, not a single float", async () => {
    const reasoner = new OperationalReasoner();
    const graph = createComplexGraph();
    const understanding = await reasoner.reason(graph);

    const dims = understanding.confidence;
    expect(typeof dims.reasoning).toBe("number");
    expect(typeof dims.evidence).toBe("number");
    expect(typeof dims.semantic).toBe("number");
    expect(typeof dims.structural).toBe("number");
    expect(typeof dims.operational).toBe("number");
    expect(typeof dims.unknown).toBe("number");
  });

  it("should detect risks for mutating actions", async () => {
    const reasoner = new OperationalReasoner();
    const graph = createComplexGraph();
    const understanding = await reasoner.reason(graph);

    const dataCorrRisks = understanding.risks.filter(r => r.type === "DATA_CORRUPTION");
    expect(dataCorrRisks.length).toBeGreaterThan(0);
  });
});

describe("OperationalCritic", () => {
  it("should pass cleanly on a well-formed understanding", async () => {
    const reasoner = new OperationalReasoner();
    const critic = new OperationalCritic();
    const graph = createComplexGraph();
    const understanding = await reasoner.reason(graph);
    const review = critic.review(understanding, graph);

    expect(review.metrics.unsupportedConclusions).toBe(0);
    expect(review.metrics.missingAlternatives).toBe(0);
    expect(review.metrics.missingAssumptions).toBe(0);
  });

  it("should detect unsupported conclusions when fabricated IDs are injected", async () => {
    const reasoner = new OperationalReasoner();
    const critic = new OperationalCritic();
    const graph = createComplexGraph();
    const understanding = await reasoner.reason(graph);

    // Inject a fabricated evidence ID
    (understanding as any).goal.evidenceIds.push("FABRICATED_ID");

    const review = critic.review(understanding, graph);
    expect(review.metrics.unsupportedConclusions).toBeGreaterThan(0);
  });
});
