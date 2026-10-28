import { describe, it, expect } from "vitest";
import { OirCritic } from "../OirCritic.js";
import { OirGraph } from "../../types.js";
import { GraphEquivalence } from "../../equivalence/GraphEquivalence.js";

function createValidBaseGraph(): OirGraph {
  return {
    version: "1.0",
    businessGoal: "Test",
    businessObjects: [],
    variables: [{ id: "var_1", name: "v1", type: "string" }],
    constants: [],
    businessRules: [],
    externalSystems: [],
    entities: [],
    evidenceLinks: [],
    knowledgeReferences: [],
    nodes: [
      {
        id: "root",
        name: "Root",
        type: "ACTION",
        operation: "START",
        inputs: {},
        outputs: ["var_1"],
        provenance: [{ source: "BROWSER_EVENT", evidenceId: "e1" }],
        confidence: 0.9
      }
    ],
    dependencies: [],
    globalConfidence: 1,
    rootNodeId: "root"
  };
}

describe("OirCritic", () => {
  it("should return clean report for valid graph", () => {
    const critic = new OirCritic();
    const graph = createValidBaseGraph();
    const report = critic.review(graph);
    
    expect(report.metrics.totalCriticisms).toBe(0);
    expect(report.metrics.structuralFailures).toBe(0);
    expect(report.metrics.semanticFlaws).toBe(0);
    expect(report.metrics.evidenceCompleteness).toBe(100);
  });

  it("should detect missing variables in outputs", () => {
    const critic = new OirCritic();
    const graph = createValidBaseGraph();
    (graph.nodes[0] as any).outputs = ["missing_var"];
    
    const report = critic.review(graph);
    expect(report.metrics.structuralFailures).toBe(1);
    expect(report.criticisms[0].problem).toBe("Missing Variable");
  });

  it("should detect missing evidence (provenance)", () => {
    const critic = new OirCritic();
    const graph = createValidBaseGraph();
    delete graph.nodes[0].provenance;
    
    const report = critic.review(graph);
    expect(report.metrics.semanticFlaws).toBe(1);
    expect(report.criticisms[0].problem).toBe("Missing Evidence");
    expect(report.metrics.evidenceCompleteness).toBe(0);
  });

  it("should detect disconnected graph regions", () => {
    const critic = new OirCritic();
    const graph = createValidBaseGraph();
    graph.nodes.push({
      id: "orphan",
      name: "Orphan",
      type: "ACTION",
      operation: "ORPHAN",
      inputs: {},
      outputs: [],
      provenance: [{ source: "BROWSER_EVENT", evidenceId: "e1" }],
      confidence: 0.9
    });
    
    const report = critic.review(graph);
    expect(report.metrics.structuralFailures).toBe(1);
    expect(report.criticisms[0].problem).toBe("Disconnected Graph Region");
  });
});

describe("GraphEquivalence", () => {
  it("should compare two equivalent graphs and return high score", () => {
    const eq = new GraphEquivalence();
    const graphA = createValidBaseGraph();
    const graphB = createValidBaseGraph();
    
    // Change ID but keep signature identical
    graphB.nodes[0].id = "root_b";
    graphB.rootNodeId = "root_b";
    
    const result = eq.compare(graphA, graphB);
    expect(result.isEquivalent).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.99);
  });

  it("should detect differing business goals", () => {
    const eq = new GraphEquivalence();
    const graphA = createValidBaseGraph();
    const graphB = createValidBaseGraph();
    graphB.businessGoal = "Different Goal";
    
    const result = eq.compare(graphA, graphB);
    expect(result.isEquivalent).toBe(false);
  });
});
