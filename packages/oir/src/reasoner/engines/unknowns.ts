import { OirGraph } from "../../types.js";
import { Unknown } from "../types.js";
import { callLlm } from "../../intelligence/llm-client.js";
import { serializeOirForLlm, collectValidEvidenceIds } from "../../intelligence/oir-serializer.js";

const UNKNOWNS_SCHEMA = `
{
  "unknowns": [
    {
      "description": "string",
      "impact": "'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'",
      "resolvableVia": "string",
      "evidenceIds": ["string"],
      "confidence": {
        "reasoning": "number",
        "evidence": "number",
        "semantic": "number",
        "structural": "number",
        "operational": "number",
        "unknown": "number"
      },
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

export async function detectUnknowns(graph: OirGraph): Promise<Unknown[]> {
  const validIds = collectValidEvidenceIds(graph);
  
  if (graph.nodes.length === 0) {
    return [{
      description: "Empty graph provided. No operations detected.",
      impact: "CRITICAL",
      resolvableVia: "Provide valid workflow demonstrations",
      evidenceIds: [],
      confidence: { reasoning: 1, evidence: 0, semantic: 1, structural: 1, operational: 1, unknown: 1 },
      reasoning: "Graph contains zero nodes.",
      alternativeHypotheses: [],
      unknowns: [],
      assumptions: [],
      selfCriticism: { whyIBelieveThis: "No nodes.", otherExplanations: [], disprovingEvidenceIds: [], missingEvidence: [], certaintyLevel: 1, expertDisagreementLikelihood: "LOW", shouldClarifyInstead: true }
    }];
  }

  const prompt = `
You are the Unknown Detection Engine for Ghost.
Your task is to analyze the Operational Intermediate Representation (OIR) graph and detect UNKNOWNS.
Unknowns are first-class citizens — logical gaps, missing exception handlers, unspecified behaviors, undefined variables, hidden assumptions.

OIR Graph:
${serializeOirForLlm(graph)}

Rules:
1. Every evidenceId MUST exist in the provided OIR graph. For an "Unknown" (which represents missing information), the evidenceId should point to the SURROUNDING context that proves the gap exists (e.g., the specific Action node missing an exception handler).
2. Rank impact according to business risk.
3. Provide rigorous self-criticism.

Output ONLY valid JSON matching this schema:
${UNKNOWNS_SCHEMA}
`.trim();

  try {
    const response = await callLlm({
      systemPrompt: "You are a rigid, deterministic inference engine. Output only raw JSON.",
      userPrompt: prompt,
      schemaDescription: UNKNOWNS_SCHEMA,
      temperature: 0.1,
      responseFormat: "json_object"
    });

    const data = response.data as Record<string, any>;
    if (!data.unknowns || !Array.isArray(data.unknowns)) {
      return [];
    }

    const unknowns: Unknown[] = data.unknowns.map((u: any) => {
      const validatedEvidenceIds = Array.isArray(u.evidenceIds)
        ? u.evidenceIds.filter((id: string) => validIds.has(id))
        : [];
        
      const sc = u.selfCriticism || {};
      const validatedDisprovingIds = Array.isArray(sc.disprovingEvidenceIds)
        ? sc.disprovingEvidenceIds.filter((id: string) => validIds.has(id))
        : [];
        
      const validImpacts = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
      const impact = validImpacts.includes(u.impact) ? u.impact : "MEDIUM";
      
      const defaultConf = { reasoning: 0.5, evidence: 0.5, semantic: 0.5, structural: 0.5, operational: 0.5, unknown: 0.5 };
      const confidence = u.confidence && typeof u.confidence === 'object' ? u.confidence : defaultConf;

      return {
        description: u.description || "Unknown gap",
        impact: impact as any,
        resolvableVia: u.resolvableVia || "Clarification from process owner",
        evidenceIds: validatedEvidenceIds,
        confidence: confidence,
        reasoning: u.reasoning || "No reasoning provided.",
        alternativeHypotheses: Array.isArray(u.alternativeHypotheses) ? u.alternativeHypotheses : [],
        unknowns: Array.isArray(u.unknowns) ? u.unknowns : [],
        assumptions: Array.isArray(u.assumptions) ? u.assumptions : [],
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

    return unknowns;
  } catch (error: any) {
    console.error(`LLM Inference failed for Unknowns: ${error.message}`);
    return [];
  }
}
