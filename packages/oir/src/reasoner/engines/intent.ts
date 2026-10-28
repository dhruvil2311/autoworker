import { OirGraph } from "../../types.js";
import { OperationalIntent } from "../types.js";
import { callLlm } from "../../intelligence/llm-client.js";
import { serializeOirForLlm, collectValidEvidenceIds } from "../../intelligence/oir-serializer.js";

const INTENT_SCHEMA = `
{
  "description": "string — The core operational intent (What this IS)",
  "notDescription": "string — What this is NOT (Explicitly deny naive heuristic interpretations)",
  "evidenceIds": "string[] — EXACT IDs of nodes/variables proving this intent",
  "confidence": {
    "reasoning": "number — 0-1",
    "evidence": "number — 0-1",
    "semantic": "number — 0-1",
    "structural": "number — 0-1",
    "operational": "number — 0-1",
    "unknown": "number — 0-1"
  },
  "reasoning": "string — Step-by-step logic for deriving this intent",
  "alternativeHypotheses": "string[] — What else could this be?",
  "unknowns": "string[] — What information is missing?",
  "assumptions": "string[] — What assumptions were made to reach this conclusion?"
}
`;

export async function inferIntent(graph: OirGraph): Promise<OperationalIntent> {
  const actions = graph.nodes.filter(n => n.type === "ACTION");
  if (actions.length === 0) {
    return createFallbackIntent("No actions in graph");
  }

  const serializedGraph = serializeOirForLlm(graph);
  
  const prompt = `
You are the Operational Intent Inference Engine for Ghost.
Your task is to analyze the following Operational Intermediate Representation (OIR) graph and determine its CORE OPERATIONAL INTENT.

Do not describe clicks and keystrokes. Describe the *business operation* being performed.

${serializedGraph}

Output ONLY valid JSON matching this schema:
${INTENT_SCHEMA}
  `.trim();

  try {
    const response = await callLlm({
      systemPrompt: "You are a rigid, deterministic deterministic inference engine. You must output only raw JSON.",
      userPrompt: prompt,
      schemaDescription: INTENT_SCHEMA,
      temperature: 0.1,
      responseFormat: "json_object"
    });

    const data = response.data as Record<string, any>;
    const validEvidenceSet = collectValidEvidenceIds(graph);
    
    // Strict post-validation: strip fabricated evidence
    const validatedEvidenceIds = Array.isArray(data.evidenceIds) 
      ? data.evidenceIds.filter((id: any) => typeof id === "string" && validEvidenceSet.has(id))
      : [];

    return {
      description: data.description || "Unknown Operational Intent",
      notDescription: data.notDescription || "Unknown",
      evidenceIds: validatedEvidenceIds,
      confidence: data.confidence || {
        reasoning: 0.5, evidence: 0.5, semantic: 0.5, structural: 0.5, operational: 0.5, unknown: 0.5
      },
      reasoning: data.reasoning,
      alternativeHypotheses: data.alternativeHypotheses || [],
      unknowns: data.unknowns || [],
      assumptions: data.assumptions || []
    };
  } catch (error: any) {
    console.error(`LLM Inference failed for Intent: ${error.message}`);
    return createFallbackIntent(error.message);
  }
}

function createFallbackIntent(reason: string): OperationalIntent {
  return {
    description: "UNKNOWN — Inference failed",
    notDescription: `Failed due to: ${reason}`,
    evidenceIds: [],
    confidence: { reasoning: 0, evidence: 0, semantic: 0, structural: 0, operational: 0, unknown: 1.0 },
    reasoning: "Fallback triggered due to error.",
    alternativeHypotheses: [],
    unknowns: ["The entire intent is unknown due to inference failure."],
    assumptions: []
  };
}
