import { describe, it, expect } from "vitest";
import { validateOirGraph, OirValidationError } from "../validators.js";
import { OirGraph } from "../types.js";

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
        outputs: ["var_1"]
      }
    ],
    dependencies: [],
    globalConfidence: 1,
    rootNodeId: "root"
  };
}

describe("OIR Validators", () => {
  it("should accept a valid graph", () => {
    const graph = createValidBaseGraph();
    expect(() => validateOirGraph(graph)).not.toThrow();
  });

  it("should detect duplicate node IDs", () => {
    const graph = createValidBaseGraph();
    graph.nodes.push({
      id: "root",
      name: "Root2",
      type: "ACTION",
      operation: "END",
      inputs: {},
      outputs: []
    });
    
    try {
      validateOirGraph(graph);
      expect.fail("Should throw");
    } catch (e: any) {
      expect(e).toBeInstanceOf(OirValidationError);
      expect(e.errors).toContain("Duplicate node ID: root");
    }
  });

  it("should detect missing root node", () => {
    const graph = createValidBaseGraph();
    graph.rootNodeId = "missing";
    
    try {
      validateOirGraph(graph);
      expect.fail("Should throw");
    } catch (e: any) {
      expect(e.errors).toContain("Root node ID missing not found.");
    }
  });

  it("should detect circular dependencies", () => {
    const graph = createValidBaseGraph();
    graph.nodes = [
      {
        id: "n1",
        name: "Node 1",
        type: "CONDITION",
        expression: "true",
        trueBranchId: "n2"
      },
      {
        id: "n2",
        name: "Node 2",
        type: "CONDITION",
        expression: "true",
        trueBranchId: "n1"
      }
    ];
    graph.rootNodeId = "n1";

    try {
      validateOirGraph(graph);
      expect.fail("Should throw");
    } catch (e: any) {
      expect(e.errors).toContain("Circular dependency detected involving node: n1");
    }
  });
  
  it("should detect dangling variables in ACTION outputs", () => {
    const graph = createValidBaseGraph();
    graph.nodes = [
      {
        id: "n1",
        name: "Node 1",
        type: "ACTION",
        operation: "DO_THING",
        inputs: {},
        outputs: ["missing_var"]
      }
    ];
    graph.rootNodeId = "n1";

    try {
      validateOirGraph(graph);
      expect.fail("Should throw");
    } catch (e: any) {
      expect(e.errors).toContain("Action n1 outputs to undefined variable: missing_var");
    }
  });
});
