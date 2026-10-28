import { OperationalUnderstanding } from "../../reasoner/types.js";
import { OirGraph } from "../../types.js";
import { BusinessMeaning, SemanticClaim } from "../types.js";
import { callLlm } from "../../intelligence/llm-client.js";
import { serializeOirForLlm, collectValidEvidenceIds } from "../../intelligence/oir-serializer.js";

const BUSINESS_MEANING_SCHEMA = `
{
  "objective": {
    "description": "string",
    "evidenceIds": "string[]",
    "confidence": "number",
    "reasoning": "string",
    "alternativeHypotheses": "string[]",
    "unknowns": "string[]",
    "assumptions": "string[]",
    "selfCriticism": {
      "whyIBelieveThis": "string",
      "otherExplanations": "string[]",
      "disprovingEvidenceIds": "string[]",
      "missingEvidence": "string[]",
      "certaintyLevel": "number",
      "expertDisagreementLikelihood": "'LOW' | 'MEDIUM' | 'HIGH'",
      "shouldClarifyInstead": "boolean"
    }
  },
  "capability": { /* exactly same schema as objective */ },
  "function": { /* exactly same schema as objective */ },
  "outcome": { /* exactly same schema as objective */ },
  "kpi": { /* exactly same schema as objective */ }
}
`;

export async function inferBusinessMeaning(
  understanding: OperationalUnderstanding,
  graph: OirGraph
): Promise<BusinessMeaning> {
  const actions = graph.nodes.filter(n => n.type === "ACTION");
  if (actions.length === 0) {
    return createFallbackBusinessMeaning("No actions in graph");
  }

  const serializedGraph = serializeOirForLlm(graph);
  // Summarize operational understanding to avoid blowing up context, but keep it structured
  const serializedUnderstanding = JSON.stringify({
    goal: understanding.goal.description,
    intent: understanding.intent.description,
    businessObjects: understanding.businessObjects,
    rules: understanding.rules.map(r => r.description)
  }, null, 2);

  const prompt = `
You are the Business Meaning Inference Engine for Ghost.
Your task is to analyze the following Operational Intermediate Representation (OIR) graph and its Operational Understanding, then infer the high-level BUSINESS MEANING.

Do not use simple keyword matching. Reason semantically about what business capability this workflow represents.

OIR Graph:
${serializedGraph}

Operational Understanding (V1 context):
${serializedUnderstanding}

Output ONLY valid JSON matching this schema for each of the 5 required semantic claims (objective, capability, function, outcome, kpi):
${BUSINESS_MEANING_SCHEMA}

CRITICAL RULES:
1. Every evidenceId MUST exist in the provided OIR graph.
2. Produce rigorous self-criticism for each claim, attacking your own logic.
  `.trim();

  try {
    const response = await callLlm({
      systemPrompt: "You are a rigid, deterministic inference engine. You must output only raw JSON.",
      userPrompt: prompt,
      schemaDescription: BUSINESS_MEANING_SCHEMA,
      temperature: 0.1,
      responseFormat: "json_object"
    });

    const data = response.data as Record<string, any>;
    const validEvidenceSet = collectValidEvidenceIds(graph);

    // Helper to validate and map a claim
    const mapClaim = (claimData: any, fallbackDesc: string): SemanticClaim => {
      if (!claimData) return createFallbackClaim(fallbackDesc);
      
      const validatedEvidenceIds = Array.isArray(claimData.evidenceIds)
        ? claimData.evidenceIds.filter((id: any) => typeof id === "string" && validEvidenceSet.has(id))
        : [];
        
      const sc = claimData.selfCriticism || {};
      const validatedDisprovingIds = Array.isArray(sc.disprovingEvidenceIds)
        ? sc.disprovingEvidenceIds.filter((id: any) => typeof id === "string" && validEvidenceSet.has(id))
        : [];

      return {
        description: claimData.description || fallbackDesc,
        evidenceIds: validatedEvidenceIds,
        confidence: claimData.confidence || 0.5,
        reasoning: claimData.reasoning,
        alternativeHypotheses: claimData.alternativeHypotheses || [],
        unknowns: claimData.unknowns || [],
        assumptions: claimData.assumptions || [],
        selfCriticism: {
          whyIBelieveThis: sc.whyIBelieveThis || claimData.reasoning || "Unknown",
          otherExplanations: sc.otherExplanations || claimData.alternativeHypotheses || [],
          disprovingEvidenceIds: validatedDisprovingIds,
          missingEvidence: sc.missingEvidence || [],
          certaintyLevel: sc.certaintyLevel || claimData.confidence || 0.5,
          expertDisagreementLikelihood: ["LOW", "MEDIUM", "HIGH"].includes(sc.expertDisagreementLikelihood) ? sc.expertDisagreementLikelihood : "MEDIUM",
          shouldClarifyInstead: !!sc.shouldClarifyInstead
        }
      };
    };

    return {
      objective: mapClaim(data.objective, "Unknown Objective"),
      capability: mapClaim(data.capability, "Unknown Capability"),
      function: mapClaim(data.function, "Unknown Function"),
      outcome: mapClaim(data.outcome, "Unknown Outcome"),
      kpi: mapClaim(data.kpi, "Unknown KPI")
    };
  } catch (error: any) {
    console.error(`LLM Inference failed for Business Meaning: ${error.message}`);
    return createFallbackBusinessMeaning(error.message);
  }
}

function createFallbackClaim(desc: string): SemanticClaim {
  return {
    description: desc,
    evidenceIds: [],
    confidence: 0.1,
    reasoning: "Fallback triggered due to error.",
    alternativeHypotheses: [],
    unknowns: ["Everything is unknown due to inference failure."],
    assumptions: [],
    selfCriticism: {
      whyIBelieveThis: "Fallback mechanism.",
      otherExplanations: [],
      disprovingEvidenceIds: [],
      missingEvidence: ["All evidence missing"],
      certaintyLevel: 0.1,
      expertDisagreementLikelihood: "HIGH",
      shouldClarifyInstead: true
    }
  };
}

function createFallbackBusinessMeaning(reason: string): BusinessMeaning {
  return {
    objective: createFallbackClaim(`Unknown Objective (${reason})`),
    capability: createFallbackClaim(`Unknown Capability (${reason})`),
    function: createFallbackClaim(`Unknown Function (${reason})`),
    outcome: createFallbackClaim(`Unknown Outcome (${reason})`),
    kpi: createFallbackClaim(`Unknown KPI (${reason})`)
  };
}
