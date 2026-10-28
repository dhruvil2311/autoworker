import { OirGraph } from "../../types.js";
import { Constraint } from "../types.js";
import { callLlm } from "../../intelligence/llm-client.js";
import { serializeOirForLlm, collectValidEvidenceIds } from "../../intelligence/oir-serializer.js";

const CONSTRAINTS_SCHEMA = `
{
  "constraints": [
    {
      "type": "'TIME' | 'AUTHORITY' | 'SYSTEM' | 'DATA' | 'PHYSICAL' | 'BUDGET' | 'SLA' | 'DEADLINE' | 'DEPENDENCY' | 'COMPLIANCE'",
      "description": "string",
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

export async function extractConstraints(graph: OirGraph): Promise<Constraint[]> {
  const validIds = collectValidEvidenceIds(graph);
  
  if (graph.nodes.length === 0) {
    return [];
  }

  const prompt = `
You are the Constraint Understanding Engine for Ghost.
Your task is to analyze the Operational Intermediate Representation (OIR) graph and extract operational constraints (budgetary, authority, physical, temporal, SLA, dependencies, etc.) that limit or mandate the workflow behavior.

OIR Graph:
${serializeOirForLlm(graph)}

Rules:
1. Every evidenceId MUST exist in the provided OIR graph.
2. Formulate constraints logically tied to specific evidence.
3. Provide rigorous self-criticism for each constraint identified.

Output ONLY valid JSON matching this schema:
${CONSTRAINTS_SCHEMA}
`.trim();

  try {
    const response = await callLlm({
      systemPrompt: "You are a rigid, deterministic inference engine. Output only raw JSON.",
      userPrompt: prompt,
      schemaDescription: CONSTRAINTS_SCHEMA,
      temperature: 0.1,
      responseFormat: "json_object"
    });

    const data = response.data as Record<string, any>;
    if (!data.constraints || !Array.isArray(data.constraints)) {
      return [];
    }

    const constraints: Constraint[] = data.constraints.map((c: any) => {
      const validatedEvidenceIds = Array.isArray(c.evidenceIds)
        ? c.evidenceIds.filter((id: string) => validIds.has(id))
        : [];
        
      const sc = c.selfCriticism || {};
      const validatedDisprovingIds = Array.isArray(sc.disprovingEvidenceIds)
        ? sc.disprovingEvidenceIds.filter((id: string) => validIds.has(id))
        : [];
        
      const validTypes = ["TIME", "AUTHORITY", "SYSTEM", "DATA", "PHYSICAL", "BUDGET", "SLA", "DEADLINE", "DEPENDENCY", "COMPLIANCE"];
      const type = validTypes.includes(c.type) ? c.type : "SYSTEM";
      
      const defaultConf = { reasoning: 0.5, evidence: 0.5, semantic: 0.5, structural: 0.5, operational: 0.5, unknown: 0.5 };
      const confidence = c.confidence && typeof c.confidence === 'object' ? c.confidence : defaultConf;

      return {
        type: type as any,
        description: c.description || "Unknown Constraint",
        evidenceIds: validatedEvidenceIds,
        confidence: confidence,
        reasoning: c.reasoning || "No reasoning provided.",
        alternativeHypotheses: Array.isArray(c.alternativeHypotheses) ? c.alternativeHypotheses : [],
        unknowns: Array.isArray(c.unknowns) ? c.unknowns : [],
        assumptions: Array.isArray(c.assumptions) ? c.assumptions : [],
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

    return constraints;
  } catch (error: any) {
    console.error(`LLM Inference failed for Constraints: ${error.message}`);
    return [];
  }
}
