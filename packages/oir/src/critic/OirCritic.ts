import { OirGraph, OirNode } from "../types.js";
import { Criticism, ReviewReport } from "./types.js";

export class OirCritic {
  public review(graph: OirGraph): ReviewReport {
    const criticisms: Criticism[] = [];
    let structuralFailures = 0;
    let semanticFlaws = 0;

    const nodeIds = new Set(graph.nodes.map(n => n.id));
    const variableIds = new Set(graph.variables.map(v => v.id));

    // 1. Missing Entities / Variables
    for (const node of graph.nodes) {
      if (node.type === "ACTION") {
        for (const outVar of node.outputs) {
          if (!variableIds.has(outVar)) {
            criticisms.push({
              problem: "Missing Variable",
              evidence: `Action node ${node.id} outputs to ${outVar}, but it is missing from graph.variables`,
              impact: "CRITICAL",
              suggestedFix: "Extract or declare the variable in the OIR builder.",
              confidence: 1.0
            });
            structuralFailures++;
          }
        }
      }
    }

    // 2. Dangling References / Disconnected Graph Regions
    const referencedNodes = new Set<string>();
    if (nodeIds.has(graph.rootNodeId)) {
      referencedNodes.add(graph.rootNodeId);
    } else if (graph.nodes.length > 0) {
      criticisms.push({
        problem: "Dangling Reference",
        evidence: `Root node ID ${graph.rootNodeId} not found in graph.`,
        impact: "CRITICAL",
        suggestedFix: "Ensure rootNodeId points to a valid starting node.",
        confidence: 1.0
      });
      structuralFailures++;
    }

    for (const node of graph.nodes) {
      const targets = this.extractTargets(node);
      for (const target of targets) {
        referencedNodes.add(target);
        if (!nodeIds.has(target)) {
          criticisms.push({
            problem: "Dangling Reference",
            evidence: `Node ${node.id} references missing target ${target}`,
            impact: "CRITICAL",
            suggestedFix: "Remove reference or build the missing node.",
            confidence: 1.0
          });
          structuralFailures++;
        }
      }
    }

    for (const dependency of graph.dependencies) {
      referencedNodes.add(dependency.targetId);
      if (!nodeIds.has(dependency.sourceId)) {
        criticisms.push({
          problem: "Dangling Reference",
          evidence: `Dependency source ${dependency.sourceId} is missing from graph nodes.`,
          impact: "CRITICAL",
          suggestedFix: "Remove dependency or build the missing source node.",
          confidence: 1.0
        });
        structuralFailures++;
      }
      if (!nodeIds.has(dependency.targetId)) {
        criticisms.push({
          problem: "Dangling Reference",
          evidence: `Dependency target ${dependency.targetId} is missing from graph nodes.`,
          impact: "CRITICAL",
          suggestedFix: "Remove dependency or build the missing target node.",
          confidence: 1.0
        });
        structuralFailures++;
      }
    }

    // Orphaned nodes (Disconnected regions)
    for (const id of nodeIds) {
      if (!referencedNodes.has(id) && id !== graph.rootNodeId) {
        criticisms.push({
          problem: "Disconnected Graph Region",
          evidence: `Node ${id} is never referenced by any other node or dependencies.`,
          impact: "MEDIUM",
          suggestedFix: "Connect the node to the control flow or remove it.",
          confidence: 0.9
        });
        structuralFailures++;
      }
    }

    // 3. Low Confidence / Missing Evidence
    let nodesWithEvidence = 0;
    for (const node of graph.nodes) {
      if (node.provenance && node.provenance.length > 0) {
        nodesWithEvidence++;
      } else {
        criticisms.push({
          problem: "Missing Evidence",
          evidence: `Node ${node.id} lacks provenance tracing.`,
          impact: "HIGH",
          suggestedFix: "Ensure the builder maps this node back to a raw observation.",
          confidence: 1.0
        });
        semanticFlaws++;
      }

      if (node.confidence !== undefined && node.confidence < 0.5) {
        criticisms.push({
          problem: "Low-confidence node",
          evidence: `Node ${node.id} has confidence ${node.confidence}`,
          impact: "MEDIUM",
          suggestedFix: "Require human-in-the-loop review or enrich via LLM.",
          confidence: 1.0
        });
        semanticFlaws++;
      }
    }

    // 4. Duplicate concepts (Simple check on names)
    const nodeNames = new Set<string>();
    for (const node of graph.nodes) {
      if (nodeNames.has(node.name) && node.type !== 'EXCEPTION') {
        criticisms.push({
          problem: "Duplicate Concept",
          evidence: `Multiple nodes named '${node.name}' exist.`,
          impact: "LOW",
          suggestedFix: "Deduplicate or rename for clarity.",
          confidence: 0.8
        });
        semanticFlaws++;
      }
      nodeNames.add(node.name);
    }

    // Metric calculation
    const evidenceCompleteness = graph.nodes.length === 0 ? 100 : (nodesWithEvidence / graph.nodes.length) * 100;

    return {
      timestamp: new Date().toISOString(),
      criticisms,
      metrics: {
        totalCriticisms: criticisms.length,
        structuralFailures,
        semanticFlaws,
        evidenceCompleteness
      }
    };
  }

  private extractTargets(node: OirNode): string[] {
    const targets: string[] = [];
    if (node.type === "CONDITION") {
      if (node.trueBranchId) targets.push(node.trueBranchId);
      if (node.falseBranchId) targets.push(node.falseBranchId);
    } else if (node.type === "LOOP") {
      targets.push(node.bodyNodeId);
    } else if (node.type === "DECISION_POINT") {
      for (const opt of node.options) targets.push(opt.nextNodeId);
    } else if (node.type === "EXCEPTION") {
      if (node.fallbackNodeId) targets.push(node.fallbackNodeId);
    }
    return targets;
  }
}
