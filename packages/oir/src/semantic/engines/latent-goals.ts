import { OperationalUnderstanding } from "../../reasoner/types.js";
import { OirGraph } from "../../types.js";
import { LatentGoal, SelfCriticism } from "../types.js";
import { callLlm } from "../../intelligence/llm-client.js";
import { serializeOirForLlm, collectValidEvidenceIds } from "../../intelligence/oir-serializer.js";

const LATENT_GOALS_SCHEMA = `
{
  "latentGoals": [
    {
      "description": "string",
      "inferredFromGoal": "string",
      "goalChain": ["string"],
      "evidenceIds": ["string"],
      "confidence": "number",
      "reasoning": "string",
      "alternativeHypotheses": ["string"],
      "unknowns": ["string"],
      "assumptions": ["string"],
      "selfCriticism": {
        "whyIBelieveThis": "string",
        "otherExplanations": ["string"],
        "disprovingEvidenceIds": ["string"],
        "missingEvidence": ["string"],
        "certaintyLevel": "number",
        "expertDisagreementLikelihood": "'LOW' | 'MEDIUM' | 'HIGH'",
        "shouldClarifyInstead": "boolean"
      }
    }
  ]
}
`;

export async function inferLatentGoals(
  understanding: OperationalUnderstanding,
  graph: OirGraph
): Promise<LatentGoal[]> {
  const validIds = collectValidEvidenceIds(graph);
  
  if (graph.nodes.length === 0 || !understanding.goal.description) {
    return [];
  }

  const prompt = `
You are the Latent Goal Inference Engine for Ghost.
Your task is to analyze the Operational Intermediate Representation (OIR) graph and its inferred primary goal, and deduce the LATENT GOALS.
A latent goal is the unstated "why" behind the primary goal (e.g., if the primary goal is "Issue a refund", a latent goal might be "Retain Customer" or "Ensure Compliance").

OIR Graph:
${serializeOirForLlm(graph)}

Primary Goal:
${understanding.goal.description}

Rules:
1. Every evidenceId MUST exist in the provided OIR graph.
2. Produce a logical "goalChain" showing how the primary goal leads to the latent goal.
3. Provide rigorous self-criticism.

Output ONLY valid JSON matching this schema:
${LATENT_GOALS_SCHEMA}
`.trim();

  try {
    const response = await callLlm({
      systemPrompt: "You are a rigid, deterministic inference engine. Output only raw JSON.",
      userPrompt: prompt,
      schemaDescription: LATENT_GOALS_SCHEMA,
      temperature: 0.1,
      responseFormat: "json_object"
    });

    const data = response.data as Record<string, any>;
    if (!data.latentGoals || !Array.isArray(data.latentGoals)) {
      return [];
    }

    const latentGoals: LatentGoal[] = data.latentGoals.map((lg: any) => {
      const validatedEvidenceIds = Array.isArray(lg.evidenceIds)
        ? lg.evidenceIds.filter((id: string) => validIds.has(id))
        : [];
        
      const sc = lg.selfCriticism || {};
      const validatedDisprovingIds = Array.isArray(sc.disprovingEvidenceIds)
        ? sc.disprovingEvidenceIds.filter((id: string) => validIds.has(id))
        : [];

      return {
        description: lg.description || "Unknown Latent Goal",
        inferredFromGoal: lg.inferredFromGoal || understanding.goal.description,
        goalChain: Array.isArray(lg.goalChain) ? lg.goalChain : [],
        evidenceIds: validatedEvidenceIds,
        confidence: typeof lg.confidence === "number" ? lg.confidence : 0.5,
        reasoning: lg.reasoning || "No reasoning provided.",
        alternativeHypotheses: Array.isArray(lg.alternativeHypotheses) ? lg.alternativeHypotheses : [],
        unknowns: Array.isArray(lg.unknowns) ? lg.unknowns : [],
        assumptions: Array.isArray(lg.assumptions) ? lg.assumptions : [],
        selfCriticism: {
          whyIBelieveThis: sc.whyIBelieveThis || "Unknown",
          otherExplanations: Array.isArray(sc.otherExplanations) ? sc.otherExplanations : [],
          disprovingEvidenceIds: validatedDisprovingIds,
          missingEvidence: Array.isArray(sc.missingEvidence) ? sc.missingEvidence : [],
          certaintyLevel: typeof sc.certaintyLevel === "number" ? sc.certaintyLevel : 0.5,
          expertDisagreementLikelihood: ["LOW", "MEDIUM", "HIGH"].includes(sc.expertDisagreementLikelihood) ? sc.expertDisagreementLikelihood : "MEDIUM",
          shouldClarifyInstead: !!sc.shouldClarifyInstead
        }
      };
    });

    return latentGoals;
  } catch (error: any) {
    console.error(`LLM Inference failed for Latent Goals: ${error.message}`);
    return [];
  }
}
