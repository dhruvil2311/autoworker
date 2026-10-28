import { OperationalUnderstanding } from "../../reasoner/types.js";
import { OirGraph } from "../../types.js";
import { ImplicitPolicy, SelfCriticism } from "../types.js";
import { callLlm } from "../../intelligence/llm-client.js";
import { serializeOirForLlm, collectValidEvidenceIds } from "../../intelligence/oir-serializer.js";

const POLICY_SCHEMA = `
{
  "policies": [
    {
      "description": "string",
      "policyCategory": "'VIP' | 'HIGH_RISK' | 'URGENT' | 'FRAUD' | 'WHOLESALE' | 'ENTERPRISE' | 'OTHER'",
      "inferredRules": ["string"],
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

export async function interpretPolicies(
  understanding: OperationalUnderstanding,
  graph: OirGraph
): Promise<ImplicitPolicy[]> {
  const validIds = collectValidEvidenceIds(graph);
  
  if (graph.nodes.length === 0) {
    return [];
  }

  const prompt = `
You are the Policy Interpretation Engine for Ghost.
Your task is to analyze the Operational Intermediate Representation (OIR) graph and its Operational Understanding to deduce IMPLICIT POLICIES.
Look for routing logic, exception handling, data thresholds, or domain-specific terminology that implies a broader enterprise policy (e.g., VIP customer treatment, high-risk review gates).

OIR Graph:
${serializeOirForLlm(graph)}

Primary Goal:
${understanding.goal.description}

Rules:
1. Every evidenceId MUST exist in the provided OIR graph.
2. Formulate implicit business rules that enforce this policy.
3. Provide rigorous self-criticism.

Output ONLY valid JSON matching this schema:
${POLICY_SCHEMA}
`.trim();

  try {
    const response = await callLlm({
      systemPrompt: "You are a rigid, deterministic inference engine. Output only raw JSON.",
      userPrompt: prompt,
      schemaDescription: POLICY_SCHEMA,
      temperature: 0.1,
      responseFormat: "json_object"
    });

    const data = response.data as Record<string, any>;
    if (!data.policies || !Array.isArray(data.policies)) {
      return [];
    }

    const policies: ImplicitPolicy[] = data.policies.map((p: any) => {
      const validatedEvidenceIds = Array.isArray(p.evidenceIds)
        ? p.evidenceIds.filter((id: string) => validIds.has(id))
        : [];
        
      const sc = p.selfCriticism || {};
      const validatedDisprovingIds = Array.isArray(sc.disprovingEvidenceIds)
        ? sc.disprovingEvidenceIds.filter((id: string) => validIds.has(id))
        : [];
        
      const validCategories = ["VIP", "HIGH_RISK", "URGENT", "FRAUD", "WHOLESALE", "ENTERPRISE", "OTHER"];
      const category = validCategories.includes(p.policyCategory) ? p.policyCategory : "OTHER";

      return {
        description: p.description || "Unknown Policy",
        policyCategory: category as any,
        inferredRules: Array.isArray(p.inferredRules) ? p.inferredRules : [],
        evidenceIds: validatedEvidenceIds,
        confidence: typeof p.confidence === "number" ? p.confidence : 0.5,
        reasoning: p.reasoning || "No reasoning provided.",
        alternativeHypotheses: Array.isArray(p.alternativeHypotheses) ? p.alternativeHypotheses : [],
        unknowns: Array.isArray(p.unknowns) ? p.unknowns : [],
        assumptions: Array.isArray(p.assumptions) ? p.assumptions : [],
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

    return policies;
  } catch (error: any) {
    console.error(`LLM Inference failed for Policy Interpretation: ${error.message}`);
    return [];
  }
}
