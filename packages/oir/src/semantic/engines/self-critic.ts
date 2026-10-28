import { SelfCriticism } from "../types.js";

export function generateSelfCriticism(
  claimDescription: string,
  evidenceIds: string[],
  otherExplanations: string[] = []
): SelfCriticism {
  return {
    whyIBelieveThis: `Based on evidence nodes [${evidenceIds.join(", ")}] and deterministic heuristics mapping.`,
    otherExplanations,
    disprovingEvidenceIds: [],
    missingEvidence: evidenceIds.length === 0 ? ["No direct evidence supports this claim."] : [],
    certaintyLevel: evidenceIds.length > 0 ? 0.8 : 0.4,
    expertDisagreementLikelihood: "LOW",
    shouldClarifyInstead: evidenceIds.length === 0
  };
}
