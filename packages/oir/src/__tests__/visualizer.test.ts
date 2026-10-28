import { describe, it, expect } from "vitest";
import { renderOirToMermaid } from "../visualizer.js";
import { OirGraph } from "../types.js";

describe("OIR Visualizer", () => {
  it("should render a graph to Mermaid", () => {
    const graph: OirGraph = {
      version: "1.0",
      businessGoal: "Test Flow",
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
          id: "n1",
          name: "Start Action",
          type: "ACTION",
          operation: "START",
          inputs: {},
          outputs: []
        },
        {
          id: "n2",
          name: "Check Something",
          type: "CONDITION",
          expression: "x > 5",
          trueBranchId: "n3"
        },
        {
          id: "n3",
          name: "End",
          type: "EXCEPTION",
          errorType: "DONE",
          message: "Finished"
        }
      ],
      dependencies: [
        {
          sourceId: "n1",
          targetId: "n2",
          type: "CONTROL"
        }
      ],
      globalConfidence: 1,
      rootNodeId: "n1"
    };

    const mermaid = renderOirToMermaid(graph);
    
    expect(mermaid).toContain("flowchart TD");
    expect(mermaid).toContain(`n1["Start Action"]:::action`);
    expect(mermaid).toContain(`n2{"Check Something"}:::condition`);
    expect(mermaid).toContain(`n3((["End"])):::exception`);
    expect(mermaid).toContain("n2 -- True --> n3");
    expect(mermaid).toContain(`n1 -. "CONTROL" .-> n2`);
  });
});
