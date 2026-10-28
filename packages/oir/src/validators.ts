import { OirGraph, OirNode } from "./types.js";

export class OirValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(`OIR Validation failed:\n${errors.map(e => `- ${e}`).join("\n")}`);
    this.name = "OirValidationError";
  }
}

export function validateOirGraph(graph: OirGraph): void {
  const errors: string[] = [];

  const nodeMap = new Map<string, OirNode>();
  for (const node of graph.nodes) {
    if (nodeMap.has(node.id)) {
      errors.push(`Duplicate node ID: ${node.id}`);
    }
    nodeMap.set(node.id, node);
  }

  // 1. Unresolved References
  if (!nodeMap.has(graph.rootNodeId)) {
    errors.push(`Root node ID ${graph.rootNodeId} not found.`);
  }

  const edges = new Map<string, string[]>();

  for (const node of graph.nodes) {
    const targets: string[] = [];
    if (node.type === "CONDITION") {
      if (node.trueBranchId) targets.push(node.trueBranchId);
      if (node.falseBranchId) targets.push(node.falseBranchId);
    } else if (node.type === "LOOP") {
      targets.push(node.bodyNodeId);
    } else if (node.type === "DECISION_POINT") {
      for (const opt of node.options) {
        targets.push(opt.nextNodeId);
      }
    } else if (node.type === "EXCEPTION") {
      if (node.fallbackNodeId) targets.push(node.fallbackNodeId);
    }

    for (const target of targets) {
      if (!nodeMap.has(target)) {
        errors.push(`Node ${node.id} references missing target node ID ${target}`);
      }
    }
    edges.set(node.id, targets);
  }

  // 2. Circular dependencies / Impossible loops
  // Standard DFS for cycle detection
  const visited = new Set<string>();
  const stack = new Set<string>();

  function dfs(nodeId: string) {
    if (stack.has(nodeId)) {
      errors.push(`Circular dependency detected involving node: ${nodeId}`);
      return;
    }
    if (visited.has(nodeId)) return;

    visited.add(nodeId);
    stack.add(nodeId);

    const neighbors = edges.get(nodeId) || [];
    for (const neighbor of neighbors) {
      // Allow loops to repeat themselves, but structural cycles are banned
      // Here we might need a more sophisticated check for 'Impossible loops', 
      // but for now any generic cycle that isn't a LOOP node's body implicitly returning is a structural cycle.
      dfs(neighbor);
    }

    stack.delete(nodeId);
  }

  if (nodeMap.has(graph.rootNodeId)) {
    dfs(graph.rootNodeId);
  }

  // 3. Dangling Variables
  const variableIds = new Set(graph.variables.map(v => v.id));
  
  for (const node of graph.nodes) {
    if (node.type === "ACTION") {
      // Check outputs register new variables (assuming they are pre-defined in graph.variables though)
      for (const outVar of node.outputs) {
        if (!variableIds.has(outVar)) {
          errors.push(`Action ${node.id} outputs to undefined variable: ${outVar}`);
        }
      }
      
      // We don't strictly check inputs here because inputs are values or references, 
      // but if we enforce inputs to reference variableIds, we can do it here.
    }
    if (node.type === "LOOP") {
      if (!variableIds.has(node.collectionVariableId)) {
        errors.push(`Loop ${node.id} references undefined collection variable: ${node.collectionVariableId}`);
      }
      if (!variableIds.has(node.itemVariableId)) {
        errors.push(`Loop ${node.id} references undefined item variable: ${node.itemVariableId}`);
      }
    }
  }

  // 4. Duplicate Entities
  const entityIds = new Set<string>();
  for (const entity of graph.entities) {
    if (entityIds.has(entity.id)) {
      errors.push(`Duplicate entity ID: ${entity.id}`);
    }
    entityIds.add(entity.id);
  }

  // 5. Conflicting Business Rules (Simple heuristic: same condition, different outcome)
  const ruleConditions = new Map<string, string>();
  for (const rule of graph.businessRules) {
    if (ruleConditions.has(rule.condition) && ruleConditions.get(rule.condition) !== rule.enforcementLevel) {
      errors.push(`Conflicting business rules for condition: ${rule.condition}`);
    }
    ruleConditions.set(rule.condition, rule.enforcementLevel);
  }

  if (errors.length > 0) {
    throw new OirValidationError(errors);
  }
}
