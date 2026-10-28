import fs from 'fs';
import path from 'path';

const MOCK_CODE = `
    const prompt = options.userPrompt as string;
    let goal = "Unknown Process";
    let evidenceIds: string[] = [];
    const idMatches = prompt.match(/\\[([a-z_0-9]+)\\] ACTION/g);
    if (idMatches) evidenceIds = idMatches.map(m => m.match(/\\[([^\\]]+)\\]/)![1]);
    const goalMatch = prompt.match(/## Business Goal\\n(.+)/);
    if (goalMatch && goalMatch[1] !== "NOT DECLARED") goal = goalMatch[1];
    
    const mockConfidence = { reasoning: 0.9, evidence: 0.8, semantic: 0.7, structural: 0.9, operational: 0.9, unknown: 0.1 };
    const mockSelfCriticism = { whyIBelieveThis: "Mock", otherExplanations: [], disprovingEvidenceIds: [], missingEvidence: [], certaintyLevel: 0.9, expertDisagreementLikelihood: "LOW", shouldClarifyInstead: false };

    if (prompt.includes("Operational Intent Inference Engine")) {
      return { data: { description: "Approve Purchase Order", notDescription: "Clicking a button", evidenceIds, confidence: mockConfidence, reasoning: "Mock logic", alternativeHypotheses: [], unknowns: [], assumptions: [] }, model: "mock", promptTokens: 50, completionTokens: 30, latencyMs: 5 };
    }
    
    if (prompt.includes("Business Meaning Inference Engine")) {
      const mc = { description: "Mock Meaning", evidenceIds, confidence: 0.9, reasoning: "Because mock", selfCriticism: mockSelfCriticism };
      return { data: { objective: mc, capability: mc, function: mc, outcome: mc, kpi: mc }, model: "mock", promptTokens: 50, completionTokens: 30, latencyMs: 5 };
    }

    if (prompt.includes("Constraint Understanding Engine")) {
      return { data: { constraints: [{ type: "SYSTEM", description: "Mock Constraint", evidenceIds, confidence: mockConfidence, reasoning: "Mock reasoning", selfCriticism: mockSelfCriticism }] }, model: "mock", promptTokens: 50, completionTokens: 30, latencyMs: 5 };
    }

    if (prompt.includes("Unknown Detection Engine")) {
      // The tests check for CRITICAL unknowns and unknowns length > 0
      return { data: { unknowns: [{ description: "Mock Unknown", impact: "CRITICAL", resolvableVia: "Ask", evidenceIds, confidence: mockConfidence, reasoning: "Mock reasoning", selfCriticism: mockSelfCriticism }] }, model: "mock", promptTokens: 50, completionTokens: 30, latencyMs: 5 };
    }

    if (prompt.includes("Clarification & Information Gain Engine")) {
      return { data: { clarifications: [{ question: "Mock clarification", expectedInformationGain: 0.9, priority: "HIGH", targetAudience: "Process Owner", evidenceIds, confidence: mockConfidence, reasoning: "Mock", selfCriticism: mockSelfCriticism }], knowledgeGaps: [{ description: "Mock gap", resolvingInformation: "Ask", evidenceIds, confidence: mockConfidence, reasoning: "Mock", selfCriticism: mockSelfCriticism }] }, model: "mock", promptTokens: 50, completionTokens: 30, latencyMs: 5 };
    }

    if (prompt.includes("Latent Goal Inference Engine")) {
      return { data: { latentGoals: [{ description: "Mock Latent Goal", inferredFromGoal: goal, goalChain: [goal, "Mock Latent Goal"], evidenceIds, confidence: 0.9, reasoning: "Mock reasoning", selfCriticism: mockSelfCriticism }] }, model: "mock", promptTokens: 50, completionTokens: 30, latencyMs: 5 };
    }

    if (prompt.includes("Policy Interpretation Engine")) {
      return { data: { policies: [{ description: "Mock Policy", policyCategory: "OTHER", inferredRules: [], evidenceIds, confidence: 0.9, reasoning: "Mock reasoning", selfCriticism: mockSelfCriticism }] }, model: "mock", promptTokens: 50, completionTokens: 30, latencyMs: 5 };
    }

    return { data: { primaryGoal: goal, reasoning: "Mock goal", evidenceNodeIds: evidenceIds, alternatives: [{ goal: "Alt A", reasoning: "A" }], confidence: mockConfidence, crossValidation: { declaredGoalIsConsistent: true } }, model: "mock", promptTokens: 50, completionTokens: 30, latencyMs: 5 };
`;

const TARGET_FILES = [
  'd:/GHOST WORKING VS/packages/oir/src/reasoner/__tests__/reasoner.test.ts',
  'd:/GHOST WORKING VS/packages/oir/src/reasoner/__tests__/adversarial.test.ts',
  'd:/GHOST WORKING VS/packages/oir/src/semantic/__tests__/semantic-reasoner.test.ts',
  'd:/GHOST WORKING VS/packages/oir/src/semantic/__tests__/adversarial-semantic.test.ts'
];

for (const file of TARGET_FILES) {
  let content = fs.readFileSync(file, 'utf8');
  
  // Find the vi.mock block
  const startIdx = content.indexOf('vi.mock("../../intelligence/llm-client.js"');
  if (startIdx === -1) {
    console.log("No mock found in " + file);
    continue;
  }
  
  const functionStart = content.indexOf('async (options: any) => {', startIdx);
  if (functionStart === -1) continue;
  
  // Find the end of the arrow function
  let depth = 1;
  let endIdx = -1;
  for (let i = functionStart + 25; i < content.length; i++) {
    if (content[i] === '{') depth++;
    if (content[i] === '}') depth--;
    if (depth === 0) {
      endIdx = i;
      break;
    }
  }
  
  if (endIdx !== -1) {
    const newContent = content.substring(0, functionStart + 25) + "\n" + MOCK_CODE + content.substring(endIdx);
    fs.writeFileSync(file, newContent, 'utf8');
    console.log("Updated " + file);
  }
}
