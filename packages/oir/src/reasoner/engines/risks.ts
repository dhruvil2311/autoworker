/**
 * RiskReasoner
 * 
 * Assesses operational risks from side-effects, mutations, external systems,
 * and missing safeguards present in the OIR.
 */

import { OirGraph, ActionNode } from "../../types.js";
import { OperationalRisk } from "../types.js";

export function assessRisks(graph: OirGraph): OperationalRisk[] {
  const risks: OperationalRisk[] = [];
  const actions = graph.nodes.filter(n => n.type === "ACTION") as ActionNode[];

  // Risk: Mutating actions without governing rules
  const mutatingActions = actions.filter(a => a.sideEffects);
  for (const action of mutatingActions) {
    risks.push({
      type: "DATA_CORRUPTION",
      description: `Mutating action "${action.name}" modifies state. Data corruption is possible if inputs are incorrect.`,
      likelihood: "MEDIUM",
      impact: "HIGH",
      evidenceIds: [action.id],
      mitigations: ["Add input validation", "Implement rollback mechanism", "Require HITL approval"]
    });
  }

  // Risk: Multiple mutations in sequence — duplicate order potential
  if (mutatingActions.length > 1) {
    risks.push({
      type: "DUPLICATE_ORDER",
      description: `${mutatingActions.length} sequential mutations detected. Retry without idempotency could create duplicates.`,
      likelihood: "MEDIUM",
      impact: "HIGH",
      evidenceIds: mutatingActions.map(a => a.id),
      mitigations: ["Implement idempotency keys", "Add duplicate detection", "Use transactional boundaries"]
    });
  }

  // Risk: External system dependencies
  for (const sys of graph.externalSystems) {
    risks.push({
      type: "INTEGRATION_FAILURE",
      description: `Dependency on external system "${sys.name}" (${sys.type}). Outage causes workflow failure.`,
      likelihood: "LOW",
      impact: "CRITICAL",
      evidenceIds: [sys.id],
      mitigations: ["Implement circuit breaker", "Define fallback behavior", "Add health checks"]
    });
  }

  // Risk: No exception handling
  const hasExceptions = graph.nodes.some(n => n.type === "EXCEPTION");
  if (!hasExceptions && actions.length > 0) {
    risks.push({
      type: "DATA_LOSS",
      description: "No exception handlers exist. Unhandled errors could cause data loss or inconsistent state.",
      likelihood: "MEDIUM",
      impact: "CRITICAL",
      evidenceIds: actions.map(a => a.id),
      mitigations: ["Add exception handlers", "Implement checkpoint/recovery", "Define manual fallback"]
    });
  }

  // Risk: Financial exposure from unguarded mutations
  const financialKeywords = ["refund", "payment", "invoice", "order", "charge", "credit", "debit"];
  for (const action of mutatingActions) {
    const nameLC = action.name.toLowerCase();
    if (financialKeywords.some(kw => nameLC.includes(kw))) {
      risks.push({
        type: "FINANCIAL_RISK",
        description: `Action "${action.name}" appears financially sensitive. Incorrect execution could cause monetary loss.`,
        likelihood: "LOW",
        impact: "CRITICAL",
        evidenceIds: [action.id],
        mitigations: ["Require approval gate", "Implement amount validation", "Add audit trail"]
      });
    }
  }

  return risks;
}
