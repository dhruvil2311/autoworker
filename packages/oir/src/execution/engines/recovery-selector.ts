/**
 * Recovery Selector Engine
 * 
 * When a step fails, selects a recovery strategy based on:
 * - The failure observation (what went wrong)
 * - The Semantic Understanding (counterfactuals, simulations, policies)
 * - The step's risk assessment (what was predicted)
 * 
 * INVARIANTS:
 * 1. Every evidenceId must exist in the OIR graph.
 * 2. Recovery strategies are ranked by confidence × success probability.
 * 3. The selector NEVER fabricates recovery paths — it maps from existing analysis.
 * 4. If no viable recovery exists, ESCALATE_TO_HUMAN is always the fallback.
 */

import { OirGraph } from "../../types.js";
import { SemanticUnderstanding } from "../../semantic/types.js";
import { ExecutionObservation, RecoveryDecision, RecoveryStrategy, StepRiskAssessment, RecoveryAction } from "../types.js";
import { callLlm } from "../../intelligence/llm-client.js";
import { collectValidEvidenceIds } from "../../intelligence/oir-serializer.js";

const RECOVERY_SCHEMA = `
{
  "strategies": [
    {
      "action": "'RETRY' | 'RETRY_WITH_BACKOFF' | 'SKIP' | 'ALTERNATIVE_PATH' | 'ROLLBACK' | 'ESCALATE_TO_HUMAN' | 'ABORT'",
      "reasoning": "string",
      "confidence": "number (0-1)",
      "evidenceIds": ["string"],
      "successProbability": "number (0-1)",
      "recoveryRisks": ["string"],
      "maxRetries": "number (optional)",
      "alternativeSteps": ["string (optional)"],
      "rollbackTargets": ["string (optional)"]
    }
  ],
  "overallReasoning": "string"
}
`;

/**
 * Select a recovery strategy for a failed step.
 */
export async function selectRecoveryStrategy(
  failureObservation: ExecutionObservation,
  riskAssessment: StepRiskAssessment | undefined,
  graph: OirGraph,
  semanticUnderstanding: SemanticUnderstanding
): Promise<RecoveryDecision> {
  const validIds = collectValidEvidenceIds(graph);

  const prompt = `
You are the Recovery Strategy Selector for Ghost.

A step has FAILED during execution. You must select the best recovery strategy.

Failed Step:
- Step ID: ${failureObservation.stepId}
- Expected: ${failureObservation.expectedBehavior}
- Actual: ${failureObservation.actualBehavior}
- Error Type: ${failureObservation.error?.type || "unknown"}
- Error Message: ${failureObservation.error?.message || "no message"}
- Is Transient: ${failureObservation.error?.isTransient ?? "unknown"}
- Is Recoverable: ${failureObservation.error?.isRecoverable ?? "unknown"}
- Side Effects Detected: ${failureObservation.sideEffectsDetected.join(", ") || "none"}
- Deviations: ${failureObservation.deviations.join(", ") || "none"}

Pre-Execution Risk Assessment:
${riskAssessment ? JSON.stringify({
    riskLevel: riskAssessment.riskLevel,
    risks: riskAssessment.risks,
    preconditions: riskAssessment.preconditions
  }, null, 2) : "No risk assessment available."}

Available Counterfactual Scenarios:
${JSON.stringify(semanticUnderstanding.counterfactuals.map(c => ({
    condition: c.whatIfCondition,
    outcome: c.expectedOutcome,
    alternatives: c.operationalAlternatives
  })), null, 2)}

Available Simulated Failures:
${JSON.stringify(semanticUnderstanding.simulations.map(s => ({
    scenario: s.simulatedScenario,
    failures: s.likelyFailures,
    rollbackNeeds: s.rollbackNeeds,
    successProbability: s.successProbability
  })), null, 2)}

Implicit Policies:
${JSON.stringify(semanticUnderstanding.implicitPolicies.map(p => ({
    description: p.description,
    rules: p.inferredRules
  })), null, 2)}

Rules:
1. Every evidenceId MUST exist in the OIR graph.
2. If the error is transient, prefer RETRY or RETRY_WITH_BACKOFF.
3. If side effects were detected, SKIP is dangerous — prefer ROLLBACK or ESCALATE.
4. ESCALATE_TO_HUMAN must always be included as the last-resort fallback.
5. Rank strategies by confidence × successProbability (highest first).
6. ABORT should only be recommended if the failure is unrecoverable AND has caused data corruption.

Output ONLY valid JSON matching this schema:
${RECOVERY_SCHEMA}
`.trim();

  try {
    const response = await callLlm({
      systemPrompt: "You are a rigid, deterministic recovery engine. Output only raw JSON.",
      userPrompt: prompt,
      schemaDescription: RECOVERY_SCHEMA,
      temperature: 0.1
    });

    const data = response.data as any;
    const validActions: RecoveryAction[] = ["RETRY", "RETRY_WITH_BACKOFF", "SKIP", "ALTERNATIVE_PATH", "ROLLBACK", "ESCALATE_TO_HUMAN", "ABORT"];

    let strategies: RecoveryStrategy[] = (Array.isArray(data.strategies) ? data.strategies : []).map((s: any) => ({
      action: validActions.includes(s.action) ? s.action : "ESCALATE_TO_HUMAN",
      reasoning: s.reasoning || "No reasoning provided.",
      confidence: typeof s.confidence === "number" ? Math.min(1, Math.max(0, s.confidence)) : 0.5,
      evidenceIds: Array.isArray(s.evidenceIds) ? s.evidenceIds.filter((id: string) => validIds.has(id)) : [],
      successProbability: typeof s.successProbability === "number" ? Math.min(1, Math.max(0, s.successProbability)) : 0.3,
      recoveryRisks: Array.isArray(s.recoveryRisks) ? s.recoveryRisks : [],
      maxRetries: typeof s.maxRetries === "number" ? s.maxRetries : undefined,
      alternativeSteps: Array.isArray(s.alternativeSteps) ? s.alternativeSteps : undefined,
      rollbackTargets: Array.isArray(s.rollbackTargets) ? s.rollbackTargets : undefined
    }));

    // Ensure ESCALATE_TO_HUMAN is always available
    if (!strategies.some(s => s.action === "ESCALATE_TO_HUMAN")) {
      strategies.push({
        action: "ESCALATE_TO_HUMAN",
        reasoning: "Fallback: human intervention is always available.",
        confidence: 1.0,
        evidenceIds: [],
        successProbability: 0.95,
        recoveryRisks: ["Introduces latency while waiting for human response."]
      });
    }

    // Sort by confidence × successProbability (descending),
    // but ESCALATE_TO_HUMAN and ABORT are always last-resort options
    const lastResortActions = new Set(["ESCALATE_TO_HUMAN", "ABORT"]);
    strategies.sort((a, b) => {
      const aIsLastResort = lastResortActions.has(a.action) ? 1 : 0;
      const bIsLastResort = lastResortActions.has(b.action) ? 1 : 0;
      if (aIsLastResort !== bIsLastResort) return aIsLastResort - bIsLastResort;
      return (b.confidence * b.successProbability) - (a.confidence * a.successProbability);
    });

    const selectedStrategy = strategies[0]!;

    return {
      failureObservation: failureObservation,
      strategies,
      selectedStrategy,
      reasoning: data.overallReasoning || "Recovery strategy selected based on failure analysis."
    };
  } catch (error: any) {
    console.error(`Recovery selection failed: ${error.message}`);
    // Fail-safe: always escalate to human if LLM fails
    const fallback: RecoveryStrategy = {
      action: "ESCALATE_TO_HUMAN",
      reasoning: `Recovery engine failed (${error.message}). Escalating to human.`,
      confidence: 1.0,
      evidenceIds: [],
      successProbability: 0.95,
      recoveryRisks: ["Recovery engine itself failed — human must intervene."]
    };

    return {
      failureObservation: failureObservation,
      strategies: [fallback],
      selectedStrategy: fallback,
      reasoning: `LLM inference failed. Defaulting to human escalation.`
    };
  }
}
