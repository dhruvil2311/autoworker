import { OirGraph, OirNode } from "./types.js";

function escapeMermaid(text: string): string {
  return text.replace(/"/g, "'").replace(/[\[\]{}()]/g, "");
}

export function renderOirToMermaid(graph: OirGraph): string {
  let mermaid = `flowchart TD\n`;
  mermaid += `  classDef action fill:#d4edda,stroke:#28a745,stroke-width:2px;\n`;
  mermaid += `  classDef condition fill:#fff3cd,stroke:#ffc107,stroke-width:2px;\n`;
  mermaid += `  classDef loop fill:#cce5ff,stroke:#007bff,stroke-width:2px;\n`;
  mermaid += `  classDef decision fill:#e2e3e5,stroke:#6c757d,stroke-width:2px;\n`;
  mermaid += `  classDef exception fill:#f8d7da,stroke:#dc3545,stroke-width:2px;\n\n`;

  // Render nodes
  for (const node of graph.nodes) {
    const label = `"${escapeMermaid(node.name)}"`;
    switch (node.type) {
      case "ACTION":
        mermaid += `  ${node.id}[${label}]:::action\n`;
        break;
      case "CONDITION":
        mermaid += `  ${node.id}{${label}}:::condition\n`;
        break;
      case "LOOP":
        mermaid += `  ${node.id}[\\${label}/]:::loop\n`; // Trapezoid
        break;
      case "DECISION_POINT":
        mermaid += `  ${node.id}{{${label}}}:::decision\n`; // Hexagon
        break;
      case "EXCEPTION":
        mermaid += `  ${node.id}(([${label}])):::exception\n`; // Subroutine shape / stadium
        break;
    }
  }

  mermaid += `\n`;

  // Render edges
  for (const node of graph.nodes) {
    switch (node.type) {
      case "CONDITION":
        if (node.trueBranchId) {
          mermaid += `  ${node.id} -- True --> ${node.trueBranchId}\n`;
        }
        if (node.falseBranchId) {
          mermaid += `  ${node.id} -- False --> ${node.falseBranchId}\n`;
        }
        break;
      case "LOOP":
        mermaid += `  ${node.id} -- Body --> ${node.bodyNodeId}\n`;
        break;
      case "DECISION_POINT":
        for (const opt of node.options) {
          mermaid += `  ${node.id} -- "${escapeMermaid(opt.label)}" --> ${opt.nextNodeId}\n`;
        }
        break;
      case "EXCEPTION":
        if (node.fallbackNodeId) {
          mermaid += `  ${node.id} -- Fallback --> ${node.fallbackNodeId}\n`;
        }
        break;
    }
  }

  // Dependencies (Data/Timing/Resource) - drawn as dotted lines
  for (const dep of graph.dependencies) {
    mermaid += `  ${dep.sourceId} -. "${dep.type}" .-> ${dep.targetId}\n`;
  }

  return mermaid;
}
