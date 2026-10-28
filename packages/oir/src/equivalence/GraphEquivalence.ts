import { OirGraph, ActionNode } from "../types.js";

export interface EquivalenceResult {
  isEquivalent: boolean;
  score: number; // 0 to 1
  differences: string[];
}

export class GraphEquivalence {
  public compare(graphA: OirGraph, graphB: OirGraph): EquivalenceResult {
    const differences: string[] = [];
    let score = 0;
    const weights = {
      goal: 0.1,
      entities: 0.2,
      actions: 0.5,
      dependencies: 0.2
    };

    // 1. Business Goal Equivalence (Simple string similarity for prototype)
    const goalMatch = graphA.businessGoal === graphB.businessGoal;
    if (goalMatch) score += weights.goal;
    else differences.push(`Business goals differ: '${graphA.businessGoal}' vs '${graphB.businessGoal}'`);

    // 2. Entity Equivalence (Compare by semantic properties/types, ignoring exact IDs)
    // We'll compare the set of entity values and types.
    const entitiesA = new Set(graphA.entities.map(e => `${e.type}:${JSON.stringify(e.value)}`));
    const entitiesB = new Set(graphB.entities.map(e => `${e.type}:${JSON.stringify(e.value)}`));
    
    let entityMatches = 0;
    for (const e of entitiesA) {
      if (entitiesB.has(e)) entityMatches++;
      else differences.push(`Graph B missing entity equivalent to: ${e}`);
    }
    const maxEntities = Math.max(entitiesA.size, entitiesB.size);
    const entityScore = maxEntities > 0 ? (entityMatches / maxEntities) : 1.0;
    score += entityScore * weights.entities;

    // 3. Action Equivalence (Compare operations and inputs, ignoring IDs)
    const actionsA = graphA.nodes.filter(n => n.type === 'ACTION') as ActionNode[];
    const actionsB = graphB.nodes.filter(n => n.type === 'ACTION') as ActionNode[];

    const getActionSig = (a: ActionNode) => `${a.operation}:${JSON.stringify(a.inputs)}`;
    
    const sigsA = new Set(actionsA.map(getActionSig));
    const sigsB = new Set(actionsB.map(getActionSig));

    let actionMatches = 0;
    for (const sig of sigsA) {
      if (sigsB.has(sig)) actionMatches++;
      else differences.push(`Graph B missing action equivalent to: ${sig}`);
    }
    const maxActions = Math.max(sigsA.size, sigsB.size);
    const actionScore = maxActions > 0 ? (actionMatches / maxActions) : 1.0;
    score += actionScore * weights.actions;

    // 4. Dependency Equivalence
    // Since node IDs differ, we check if the dependencies enforce the same ordering of action signatures.
    // This is complex for arbitrary DAGs. For this prototype, we'll map edges using the signatures.
    
    // Map NodeID -> Signature
    const idToSigA = new Map(actionsA.map(a => [a.id, getActionSig(a)]));
    const idToSigB = new Map(actionsB.map(a => [a.id, getActionSig(a)]));

    const depSigsA = new Set(graphA.dependencies
      .filter(d => idToSigA.has(d.sourceId) && idToSigA.has(d.targetId))
      .map(d => `${idToSigA.get(d.sourceId)}->${idToSigA.get(d.targetId)}`));

    const depSigsB = new Set(graphB.dependencies
      .filter(d => idToSigB.has(d.sourceId) && idToSigB.has(d.targetId))
      .map(d => `${idToSigB.get(d.sourceId)}->${idToSigB.get(d.targetId)}`));

    let depMatches = 0;
    for (const dep of depSigsA) {
      if (depSigsB.has(dep)) depMatches++;
      else differences.push(`Graph B missing dependency equivalent to: ${dep}`);
    }
    
    const maxDeps = Math.max(depSigsA.size, depSigsB.size);
    const depScore = maxDeps > 0 ? (depMatches / maxDeps) : 1.0;
    score += depScore * weights.dependencies;

    return {
      isEquivalent: score >= 0.99, // User specified Operational equivalence ≥99%
      score,
      differences
    };
  }
}
