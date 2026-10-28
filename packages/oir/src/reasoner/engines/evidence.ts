/**
 * EvidenceReasoner
 * 
 * Verifies every conclusion maps to real OIR evidence IDs.
 * This is the foundational engine — all other engines produce evidenceIds
 * that must pass through this reasoner for validation.
 */

import { OirGraph } from "../../types.js";
import { EvidenceChain } from "../types.js";

export function reasonEvidence(graph: OirGraph): {
  chains: EvidenceChain[];
  allValidEvidenceIds: Set<string>;
} {
  const allValidEvidenceIds = new Set<string>();

  // Collect all evidence IDs from graph nodes (provenance)
  for (const node of graph.nodes) {
    allValidEvidenceIds.add(node.id);
    if (node.provenance) {
      for (const p of node.provenance) {
        if (p.evidenceId) allValidEvidenceIds.add(p.evidenceId);
      }
    }
  }

  // Collect from evidence links
  for (const link of graph.evidenceLinks) {
    allValidEvidenceIds.add(link.id);
  }

  // Collect from entities, variables, constants, business objects
  for (const e of graph.entities) allValidEvidenceIds.add(e.id);
  for (const v of graph.variables) allValidEvidenceIds.add(v.id);
  for (const c of graph.constants) allValidEvidenceIds.add(c.id);
  for (const bo of graph.businessObjects) allValidEvidenceIds.add(bo.id);
  for (const br of graph.businessRules) allValidEvidenceIds.add(br.id);
  for (const es of graph.externalSystems) allValidEvidenceIds.add(es.id);

  // Build evidence chains from the graph structure
  const chains: EvidenceChain[] = [];

  for (const node of graph.nodes) {
    const evidenceIds = node.provenance?.map(p => p.evidenceId).filter(Boolean) as string[] || [];
    chains.push({
      conclusionId: node.id,
      conclusion: `Node: ${node.name} (${node.type})`,
      evidenceIds,
      reasoning: `Deterministically extracted from ${evidenceIds.length} observation(s)`,
      confidence: node.confidence ?? 0
    });
  }

  return { chains, allValidEvidenceIds };
}

export function validateEvidenceIds(
  referencedIds: string[],
  validIds: Set<string>
): string[] {
  const orphaned: string[] = [];
  for (const id of referencedIds) {
    if (!validIds.has(id)) orphaned.push(id);
  }
  return orphaned;
}
