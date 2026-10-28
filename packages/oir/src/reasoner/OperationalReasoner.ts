/**
 * OperationalReasoner
 * 
 * The canonical reasoning pipeline.
 * Consumes a VALIDATED, FROZEN OirGraph (read-only).
 * Produces an OperationalUnderstanding artifact.
 * 
 * INVARIANTS:
 * 1. The OirGraph is deep-frozen before any engine touches it.
 * 2. Every evidenceId in the output is validated against the graph.
 * 3. The reasoner NEVER modifies the OIR.
 * 4. The reasoner NEVER invents nodes, variables, entities, or evidence.
 * 
 * CHANGE LOG:
 * - reason() is now async because GoalInference uses LLM inference.
 */

import { OirGraph } from "../types.js";
import { OperationalUnderstanding } from "./types.js";
import { reasonEvidence, validateEvidenceIds } from "./engines/evidence.js";
import { inferGoal } from "./engines/goal-inference.js";
import { inferIntent } from "./engines/intent.js";
import { extractConstraints } from "./engines/constraints.js";
import { reasonBusinessRules } from "./engines/business-rules.js";
import { detectAssumptions } from "./engines/assumptions.js";
import { detectUnknowns } from "./engines/unknowns.js";
import { assessRisks } from "./engines/risks.js";
import { generateAlternatives } from "./engines/alternatives.js";
import { computeGlobalConfidence } from "./engines/confidence.js";
import { generateClarifications } from "./engines/clarifications.js";
import { generateSummary } from "./engines/summary.js";

export class OperationalReasoner {
  public async reason(graph: OirGraph): Promise<OperationalUnderstanding> {
    // INVARIANT 1: Deep-freeze the OIR so no engine can mutate it
    deepFreeze(graph);

    // Run evidence reasoning first — it provides the validation set
    const { chains, allValidEvidenceIds } = reasonEvidence(graph);

    // Run goal and intent inference (async — uses LLM)
    const goal = await inferGoal(graph);
    const intent = await inferIntent(graph);

    // Run remaining deterministic engines
    const constraints = await extractConstraints(graph);
    const rules = reasonBusinessRules(graph);
    const assumptions = detectAssumptions(graph);
    const unknowns = await detectUnknowns(graph);
    const risks = assessRisks(graph);
    const alternatives = generateAlternatives(graph);
    const confidence = computeGlobalConfidence(graph, goal, intent, constraints, rules, unknowns, assumptions);
    const { clarifications, knowledgeGaps: informationGains } = await generateClarifications(graph, unknowns);
    const summary = generateSummary(graph, goal, risks, unknowns);

    // Collect business object names (never invented, only from OIR)
    const businessObjects = graph.businessObjects.map(bo => bo.name);

    // INVARIANT 2: Validate all evidence IDs produced by engines
    const allReferencedIds = [
      ...goal.evidenceIds,
      ...intent.evidenceIds,
      ...constraints.flatMap(c => c.evidenceIds),
      ...rules.flatMap(r => r.evidenceIds),
      ...assumptions.flatMap(a => a.evidenceIds),
      ...risks.flatMap(r => r.evidenceIds),
      ...alternatives.flatMap(a => [...a.evidenceFor, ...a.evidenceAgainst])
    ];

    const orphanedIds = validateEvidenceIds(allReferencedIds, allValidEvidenceIds);
    if (orphanedIds.length > 0) {
      throw new Error(
        `REASONER INTEGRITY VIOLATION: The following evidence IDs do not exist in the OIR: ${orphanedIds.join(", ")}. ` +
        `The reasoner is fabricating evidence. This is a critical failure.`
      );
    }

    return {
      version: "1.0",
      timestamp: new Date().toISOString(),
      sourceOirVersion: graph.version,
      goal,
      intent,
      businessObjects,
      constraints,
      rules,
      assumptions,
      unknowns,
      evidence: chains,
      confidence,
      risks,
      alternatives,
      informationGains,
      clarifications,
      summary
    };
  }
}

function deepFreeze(obj: any): void {
  if (obj === null || typeof obj !== "object") return;
  if (Object.isFrozen(obj)) return;
  Object.freeze(obj);
  for (const value of Object.values(obj)) {
    deepFreeze(value);
  }
}
