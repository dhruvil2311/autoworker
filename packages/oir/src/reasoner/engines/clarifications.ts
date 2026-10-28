import { OirGraph } from "../../types.js";
import { Unknown, Clarification, KnowledgeGap } from "../types.js";
import { callLlm } from "../../intelligence/llm-client.js";
import { serializeOirForLlm, collectValidEvidenceIds } from "../../intelligence/oir-serializer.js";

const CLARIFICATIONS_SCHEMA = `
{
  "clarifications": [
    {
      "question": "string",
      "expectedInformationGain": "number",
      "priority": "'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'",
      "targetAudience": "string",
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
  ],
  "knowledgeGaps": [
    {
      "description": "string",
      "resolvingInformation": "string",
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

export async function generateClarifications(
  graph: OirGraph,
  unknowns: Unknown[]
): Promise<{ clarifications: Clarification[]; knowledgeGaps: KnowledgeGap[] }> {
  const validIds = collectValidEvidenceIds(graph);
  
  if (unknowns.length === 0) {
    return { clarifications: [], knowledgeGaps: [] };
  }

  const prompt = `
You are the Clarification & Information Gain Engine for Ghost.
Your task is to analyze the Operational Intermediate Representation (OIR) graph and a list of detected UNKNOWNS.
You must generate high-value, minimal information-gain questions (clarifications) and synthesize formal Knowledge Gaps.
Rank them by expectedInformationGain (0.0 to 1.0).

OIR Graph:
${serializeOirForLlm(graph)}

Detected Unknowns:
${JSON.stringify(unknowns, null, 2)}

Rules:
1. Every evidenceId MUST exist in the provided OIR graph. Like Unknowns, point to the surrounding context for evidence of the gap.
2. Formulate concise, targeted questions.
3. Provide rigorous self-criticism.

Output ONLY valid JSON matching this schema:
${CLARIFICATIONS_SCHEMA}
`.trim();

  try {
    const response = await callLlm({
      systemPrompt: "You are a rigid, deterministic inference engine. Output only raw JSON.",
      userPrompt: prompt,
      schemaDescription: CLARIFICATIONS_SCHEMA,
      temperature: 0.1,
      responseFormat: "json_object"
    });

    const data = response.data as Record<string, any>;
    
    const parseConfidence = (c: any) => c && typeof c === 'object' ? c : { reasoning: 0.5, evidence: 0.5, semantic: 0.5, structural: 0.5, operational: 0.5, unknown: 0.5 };
    const parseSelfCriticism = (sc: any, pValidIds: Set<string>) => ({
      whyIBelieveThis: sc?.whyIBelieveThis || "Unknown",
      otherExplanations: Array.isArray(sc?.otherExplanations) ? sc.otherExplanations : [],
      disprovingEvidenceIds: Array.isArray(sc?.disprovingEvidenceIds) ? sc.disprovingEvidenceIds.filter((id: string) => pValidIds.has(id)) : [],
      missingEvidence: Array.isArray(sc?.missingEvidence) ? sc.missingEvidence : [],
      certaintyLevel: typeof sc?.certaintyLevel === "number" ? sc.certaintyLevel : 0.5,
      expertDisagreementLikelihood: ["LOW", "MEDIUM", "HIGH"].includes(sc?.expertDisagreementLikelihood) ? sc.expertDisagreementLikelihood : "MEDIUM",
      shouldClarifyInstead: !!sc?.shouldClarifyInstead
    });

    const clarifications: Clarification[] = (Array.isArray(data.clarifications) ? data.clarifications : []).map((c: any) => ({
      question: c.question || "Unknown Question",
      expectedInformationGain: typeof c.expectedInformationGain === "number" ? c.expectedInformationGain : 0.5,
      priority: ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(c.priority) ? c.priority : "MEDIUM",
      targetAudience: c.targetAudience || "Process Owner",
      evidenceIds: Array.isArray(c.evidenceIds) ? c.evidenceIds.filter((id: string) => validIds.has(id)) : [],
      confidence: parseConfidence(c.confidence),
      reasoning: c.reasoning || "No reasoning provided.",
      alternativeHypotheses: Array.isArray(c.alternativeHypotheses) ? c.alternativeHypotheses : [],
      unknowns: Array.isArray(c.unknowns) ? c.unknowns : [],
      assumptions: Array.isArray(c.assumptions) ? c.assumptions : [],
      selfCriticism: parseSelfCriticism(c.selfCriticism, validIds)
    })).sort((a: any, b: any) => b.expectedInformationGain - a.expectedInformationGain);

    const knowledgeGaps: KnowledgeGap[] = (Array.isArray(data.knowledgeGaps) ? data.knowledgeGaps : []).map((kg: any) => ({
      description: kg.description || "Unknown Knowledge Gap",
      resolvingInformation: kg.resolvingInformation || "Clarification",
      evidenceIds: Array.isArray(kg.evidenceIds) ? kg.evidenceIds.filter((id: string) => validIds.has(id)) : [],
      confidence: parseConfidence(kg.confidence),
      reasoning: kg.reasoning || "No reasoning provided.",
      alternativeHypotheses: Array.isArray(kg.alternativeHypotheses) ? kg.alternativeHypotheses : [],
      unknowns: Array.isArray(kg.unknowns) ? kg.unknowns : [],
      assumptions: Array.isArray(kg.assumptions) ? kg.assumptions : [],
      selfCriticism: parseSelfCriticism(kg.selfCriticism, validIds)
    }));

    return { clarifications, knowledgeGaps };
  } catch (error: any) {
    console.error(`LLM Inference failed for Clarifications: ${error.message}`);
    return { clarifications: [], knowledgeGaps: [] };
  }
}
