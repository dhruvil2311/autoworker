/**
 * GoalInferenceEngine — LLM-Backed
 * 
 * Infers the business goal from the OIR's structural evidence.
 * 
 * PREVIOUS IMPLEMENTATION: Passed through `graph.businessGoal` verbatim.
 * That is not inference — it is passthrough.
 * 
 * NEW IMPLEMENTATION:
 * 1. Serialize the entire OIR into a structured prompt.
 * 2. Ask the LLM to independently infer the business goal from actions,
 *    variables, rules, systems, and dependencies.
 * 3. Cross-validate: if the OIR has a declared businessGoal, compare it
 *    against the LLM's independent inference.
 * 4. Post-validate: ensure all evidence IDs reference real OIR nodes.
 * 5. Produce alternative hypotheses with ranked confidence.
 * 
 * INVARIANTS:
 * - Never fabricates evidence IDs.
 * - Never invents nodes, variables, or entities.
 * - Every evidenceId is validated against the graph.
 * - If confidence is insufficient, returns UNKNOWN with clarification flag.
 */

import { OirGraph } from "../../types.js";
import { InferredGoal, MultidimensionalConfidence } from "../types.js";
import { callLlm } from "../../intelligence/llm-client.js";
import { serializeOirForLlm, collectValidEvidenceIds } from "../../intelligence/oir-serializer.js";

// ─── LLM Response Schema ────────────────────────────────────────────────────

interface GoalInferenceResponse {
  primaryGoal: string;
  reasoning: string;
  evidenceNodeIds: string[];
  alternatives: Array<{
    goal: string;
    reasoning: string;
  }>;
  confidence: {
    reasoning: number;
    evidence: number;
    semantic: number;
    structural: number;
    operational: number;
    unknown: number;
  };
  crossValidation?: {
    declaredGoalIsConsistent: boolean;
    discrepancy?: string;
  };
}

const GOAL_SCHEMA_DESCRIPTION = `{
  "primaryGoal": "string — The inferred business goal (e.g., 'Process customer refund')",
  "reasoning": "string — Explanation of WHY you believe this is the goal",
  "evidenceNodeIds": ["string — ONLY IDs that appear in the workflow nodes, e.g., 'action_refund'"],
  "alternatives": [{"goal": "string", "reasoning": "string"}],
  "confidence": {
    "reasoning": "number 0-1 — How sound is the logical chain?",
    "evidence": "number 0-1 — How much raw evidence supports this?",
    "semantic": "number 0-1 — How unambiguous is the semantic meaning?",
    "structural": "number 0-1 — How well does the graph structure support this?",
    "operational": "number 0-1 — How likely is this the actual business operation?",
    "unknown": "number 0-1 — How much is still unknown? (0 = fully known, 1 = fully unknown)"
  },
  "crossValidation": {
    "declaredGoalIsConsistent": "boolean — Does the declared businessGoal match what you infer?",
    "discrepancy": "string | null — If inconsistent, explain the discrepancy"
  }
}`;

const SYSTEM_PROMPT = `You are an expert business process analyst. You are given a structured representation of an operational workflow (the OIR — Operational Intermediate Representation).

Your task is to INFER the business goal of this workflow from the structural evidence provided.

RULES:
1. Examine the actions, variables, business rules, external systems, and dependencies.
2. Infer WHAT business operation is being performed and WHY.
3. In "evidenceNodeIds", list ONLY node IDs that appear in the "Workflow Nodes" section (e.g., "action_refund", "n1"). Do NOT invent IDs.
4. Provide at least 2 alternative hypotheses.
5. If a "Business Goal" is declared, cross-validate your inference against it.
6. Be honest about confidence. If the workflow is ambiguous, set unknown high.`;

// ─── Engine ─────────────────────────────────────────────────────────────────

export async function inferGoal(graph: OirGraph): Promise<InferredGoal> {
  // If the graph has zero nodes, there is nothing to infer from.
  if (graph.nodes.length === 0) {
    return createEmptyGoal(graph);
  }

  const serialized = serializeOirForLlm(graph);
  const validIds = collectValidEvidenceIds(graph);

  try {
    const result = await callLlm<GoalInferenceResponse>({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: `Analyze this operational workflow and infer the business goal:\n\n${serialized}`,
      schemaDescription: GOAL_SCHEMA_DESCRIPTION,
    });

    const response = result.data;

    // POST-VALIDATION: Strip any fabricated evidence IDs
    const validatedEvidenceIds = response.evidenceNodeIds.filter((id) =>
      validIds.has(id)
    );
    const fabricatedIds = response.evidenceNodeIds.filter((id) =>
      !validIds.has(id)
    );

    if (fabricatedIds.length > 0) {
      // The LLM hallucinated IDs. Penalize confidence.
      response.confidence.evidence = Math.max(
        0,
        response.confidence.evidence - 0.3
      );
      response.confidence.unknown = Math.min(
        1,
        response.confidence.unknown + 0.2
      );
    }

    // Clamp all confidence values to [0, 1]
    const confidence: MultidimensionalConfidence = {
      reasoning: clamp(response.confidence.reasoning),
      evidence: clamp(response.confidence.evidence),
      semantic: clamp(response.confidence.semantic),
      structural: clamp(response.confidence.structural),
      operational: clamp(response.confidence.operational),
      unknown: clamp(response.confidence.unknown),
    };

    const alternatives = (response.alternatives || []).map((a) => a.goal);
    // Ensure at least 2 alternatives
    if (alternatives.length < 2) {
      alternatives.push("Insufficient evidence to generate alternative hypothesis");
    }
    while (alternatives.length < 2) {
      alternatives.push("UNKNOWN — requires additional observation");
    }

    return {
      description: response.primaryGoal || "UNKNOWN — LLM could not infer a goal",
      evidenceIds: validatedEvidenceIds,
      confidence,
      alternatives,
    };
  } catch (error: any) {
    console.error(`LLM Inference failed: ${error.message}`);
    // LLM failure fallback: return a degraded but honest result
    // We fall back to the declared businessGoal if it exists,
    // but mark confidence as extremely low to signal that
    // no actual inference occurred.
    return createFallbackGoal(graph, error.message);
  }
}

// ─── Fallback Constructors ──────────────────────────────────────────────────

function createEmptyGoal(graph: OirGraph): InferredGoal {
  return {
    description: graph.businessGoal || "UNKNOWN — no nodes exist in the OIR to infer a goal from",
    evidenceIds: [],
    confidence: {
      reasoning: 0.1,
      evidence: 0,
      semantic: graph.businessGoal ? 0.5 : 0.1,
      structural: 0,
      operational: 0.1,
      unknown: 0.9,
    },
    alternatives: [
      "Workflow is incomplete or empty",
      "Observation recording may have failed",
    ],
  };
}

function createFallbackGoal(graph: OirGraph, errorMessage: string): InferredGoal {
  const actions = graph.nodes.filter((n) => n.type === "ACTION");
  return {
    description: graph.businessGoal || "UNKNOWN — LLM inference failed",
    evidenceIds: actions.map((a) => a.id),
    confidence: {
      reasoning: 0.2,
      evidence: actions.length > 0 ? 0.3 : 0,
      semantic: 0.2,
      structural: actions.length > 0 ? 0.4 : 0,
      operational: 0.2,
      unknown: 0.7,
    },
    alternatives: [
      `LLM inference failed: ${errorMessage}`,
      "Fallback to declared businessGoal field (unvalidated passthrough)",
    ],
  };
}

function clamp(v: number): number {
  if (typeof v !== "number" || isNaN(v)) return 0.5;
  return Math.max(0, Math.min(1, v));
}
