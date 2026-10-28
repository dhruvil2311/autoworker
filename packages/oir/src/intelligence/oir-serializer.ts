/**
 * OIR Serializer
 * 
 * Converts a frozen OirGraph into a structured text representation
 * optimized for LLM consumption. This is the canonical bridge between
 * the deterministic OIR layer and the intelligence layer.
 * 
 * DESIGN PRINCIPLES:
 * 1. Include ALL structurally meaningful information.
 * 2. Exclude raw DOM, CSS selectors, and browser implementation details.
 * 3. Present information at the OPERATIONAL level (what the business does).
 * 4. Always include node IDs so the LLM can reference them as evidence.
 * 5. Keep it concise — LLMs reason better with structured, compact input.
 */

import { OirGraph, ActionNode, ConditionNode, LoopNode, DecisionPointNode, ExceptionNode } from "../types.js";

export function serializeOirForLlm(graph: OirGraph): string {
  const sections: string[] = [];

  // ─── Business Goal ────────────────────────────────────────────────
  sections.push(`## Business Goal\n${graph.businessGoal || "NOT DECLARED"}`);

  // ─── Business Objects ─────────────────────────────────────────────
  if (graph.businessObjects.length > 0) {
    sections.push(`## Business Objects\n${graph.businessObjects.map(bo =>
      `- [${bo.id}] ${bo.name}: ${bo.description} | Properties: ${JSON.stringify(bo.properties)}`
    ).join("\n")}`);
  }

  // ─── Variables ────────────────────────────────────────────────────
  if (graph.variables.length > 0) {
    sections.push(`## Variables\n${graph.variables.map(v =>
      `- [${v.id}] ${v.name} (${v.type})${v.description ? `: ${v.description}` : ""}${v.defaultValue !== undefined ? ` = ${JSON.stringify(v.defaultValue)}` : ""}`
    ).join("\n")}`);
  }

  // ─── Constants ────────────────────────────────────────────────────
  if (graph.constants.length > 0) {
    sections.push(`## Constants\n${graph.constants.map(c =>
      `- [${c.id}] ${c.name} = ${JSON.stringify(c.value)} (${c.type})`
    ).join("\n")}`);
  }

  // ─── Business Rules ───────────────────────────────────────────────
  if (graph.businessRules.length > 0) {
    sections.push(`## Business Rules\n${graph.businessRules.map(br =>
      `- [${br.id}] ${br.description} | Condition: ${br.condition} | Enforcement: ${br.enforcementLevel}`
    ).join("\n")}`);
  }

  // ─── External Systems ─────────────────────────────────────────────
  if (graph.externalSystems.length > 0) {
    sections.push(`## External Systems\n${graph.externalSystems.map(es =>
      `- [${es.id}] ${es.name} (${es.type})${es.url ? ` @ ${es.url}` : ""}`
    ).join("\n")}`);
  }

  // ─── Entities ─────────────────────────────────────────────────────
  if (graph.entities.length > 0) {
    sections.push(`## Entity Instances\n${graph.entities.map(e =>
      `- [${e.id}] Type: ${e.type} | Value: ${JSON.stringify(e.value)} | Confidence: ${e.confidence}`
    ).join("\n")}`);
  }

  // ─── Nodes (Actions, Conditions, Loops, etc.) ─────────────────────
  if (graph.nodes.length > 0) {
    const nodeLines: string[] = [];
    for (const node of graph.nodes) {
      nodeLines.push(serializeNode(node));
    }
    sections.push(`## Workflow Nodes\n${nodeLines.join("\n")}`);
  }

  // ─── Dependencies ─────────────────────────────────────────────────
  if (graph.dependencies.length > 0) {
    sections.push(`## Dependencies\n${graph.dependencies.map(d =>
      `- ${d.sourceId} → ${d.targetId} (${d.type})`
    ).join("\n")}`);
  }

  // ─── Global Metrics ───────────────────────────────────────────────
  sections.push(`## Metadata\n- Global Confidence: ${graph.globalConfidence}\n- Root Node: ${graph.rootNodeId}\n- Total Nodes: ${graph.nodes.length}`);

  return sections.join("\n\n");
}

function serializeNode(node: any): string {
  switch (node.type) {
    case "ACTION": {
      const a = node as ActionNode;
      const inputStr = Object.keys(a.inputs).length > 0 ? JSON.stringify(a.inputs) : "none";
      const outputStr = a.outputs.length > 0 ? a.outputs.join(", ") : "none";
      return `- [${a.id}] ACTION: "${a.name}" | Operation: ${a.operation} | Inputs: ${inputStr} | Outputs: ${outputStr} | Side Effects: ${a.sideEffects} | System: ${a.systemId || "local"} | Confidence: ${a.confidence ?? "N/A"}`;
    }
    case "CONDITION": {
      const c = node as ConditionNode;
      return `- [${c.id}] CONDITION: "${c.name}" | Expression: ${c.expression} | True→${c.trueBranchId || "?"} | False→${c.falseBranchId || "?"}`;
    }
    case "LOOP": {
      const l = node as LoopNode;
      return `- [${l.id}] LOOP: "${l.name}" | Over: ${l.collectionVariableId} | Item: ${l.itemVariableId} | Body: ${l.bodyNodeId}`;
    }
    case "DECISION_POINT": {
      const dp = node as DecisionPointNode;
      return `- [${dp.id}] DECISION: "${dp.name}" | Question: ${dp.question} | Options: ${dp.options.map(o => `${o.label}→${o.nextNodeId}`).join(", ")}`;
    }
    case "EXCEPTION": {
      const ex = node as ExceptionNode;
      return `- [${ex.id}] EXCEPTION: "${ex.name}" | Error: ${ex.errorType} | Message: ${ex.message} | Fatal: ${ex.isFatal} | Fallback: ${ex.fallbackNodeId || "none"}`;
    }
    default:
      return `- [${node.id}] ${node.type}: "${node.name}"`;
  }
}

/**
 * Builds the set of all valid evidence IDs from an OirGraph.
 * Used to post-validate LLM outputs.
 */
export function collectValidEvidenceIds(graph: OirGraph): Set<string> {
  const ids = new Set<string>();
  for (const node of graph.nodes) {
    ids.add(node.id);
    if (node.provenance) {
      for (const p of node.provenance) {
        if (p.evidenceId) ids.add(p.evidenceId);
      }
    }
  }
  for (const e of graph.entities) ids.add(e.id);
  for (const v of graph.variables) ids.add(v.id);
  for (const c of graph.constants) ids.add(c.id);
  for (const bo of graph.businessObjects) ids.add(bo.id);
  for (const br of graph.businessRules) ids.add(br.id);
  for (const es of graph.externalSystems) ids.add(es.id);
  return ids;
}
