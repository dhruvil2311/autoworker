/**
 * Risk Assessor Engine
 * 
 * Pre-execution risk analysis for workflow steps.
 * Consumes the SemanticUnderstanding to identify constraints, unknowns,
 * and simulated failure scenarios that apply to a specific step.
 * 
 * INVARIANTS:
 * 1. Every evidenceId must exist in the OIR graph.
 * 2. Risk assessment is pre-computed for all steps before execution begins.
 * 3. The assessor NEVER fabricates risks — it maps existing semantic analysis to steps.
 */

import { OirGraph } from "../../types.js";
import { SemanticUnderstanding } from "../../semantic/types.js";
import { OperationalUnderstanding } from "../../reasoner/types.js";
import { StepRiskAssessment } from "../types.js";
import { callLlm } from "../../intelligence/llm-client.js";
import { serializeOirForLlm, collectValidEvidenceIds } from "../../intelligence/oir-serializer.js";

const RISK_ASSESSMENT_SCHEMA = `
{
  "stepId": "string",
  "riskLevel": "'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'",
  "recommendation": "'PROCEED' | 'PROCEED_WITH_CAUTION' | 'REQUIRES_HUMAN_APPROVAL' | 'ABORT'",
  "risks": [
    {
      "description": "string",
      "likelihood": "number (0-1)",
      "impact": "string",
      "mitigations": ["string"],
      "evidenceIds": ["string"]
    }
  ],
  "applicableConstraints": ["string"],
  "applicableUnknowns": ["string"],
  "preconditions": [
    {
      "description": "string",
      "satisfied": "boolean",
      "evidenceIds": ["string"]
    }
  ],
  "reasoning": "string",
  "confidence": "number (0-1)"
}
`;

export interface StepDescriptor {
  stepId: string;
  stepName: string;
  operation: string;
  target: string;
  hasSideEffects: boolean;
  inputVariables: string[];
  outputVariables: string[];
}

/**
 * Assess a single step's risk using the Semantic Understanding.
 */
export async function assessStepRisk(
  step: StepDescriptor,
  graph: OirGraph,
  operationalUnderstanding: OperationalUnderstanding,
  semanticUnderstanding: SemanticUnderstanding
): Promise<StepRiskAssessment> {
  const validIds = collectValidEvidenceIds(graph);

  // Edge case: empty graph
  if (graph.nodes.length === 0) {
    return {
      stepId: step.stepId,
      riskLevel: "CRITICAL",
      recommendation: "ABORT",
      risks: [{ description: "Empty graph — no operational context", likelihood: 1, impact: "Total failure", mitigations: [], evidenceIds: [] }],
      applicableConstraints: [],
      applicableUnknowns: [],
      preconditions: [],
      reasoning: "Cannot assess risk for a step with no OIR context.",
      confidence: 1
    };
  }

  const prompt = `
You are the Pre-Execution Risk Assessor for Ghost.

Your task is to analyze a specific execution step against the Operational and Semantic Understanding to determine its risk profile BEFORE execution.

Step to Assess:
- ID: ${step.stepId}
- Name: ${step.stepName}
- Operation: ${step.operation}
- Target: ${step.target}
- Has Side Effects: ${step.hasSideEffects}
- Input Variables: ${step.inputVariables.join(", ") || "none"}
- Output Variables: ${step.outputVariables.join(", ") || "none"}

OIR Graph:
${serializeOirForLlm(graph)}

Known Constraints:
${JSON.stringify(operationalUnderstanding.constraints.map(c => ({ type: c.type, description: c.description, evidenceIds: c.evidenceIds })), null, 2)}

Known Unknowns:
${JSON.stringify(operationalUnderstanding.unknowns.map(u => ({ description: u.description, impact: u.impact, evidenceIds: u.evidenceIds })), null, 2)}

Simulated Failure Scenarios:
${JSON.stringify(semanticUnderstanding.simulations.map(s => ({ description: s.description, scenario: s.simulatedScenario, failures: s.likelyFailures, successProbability: s.successProbability })), null, 2)}

Counterfactual Scenarios:
${JSON.stringify(semanticUnderstanding.counterfactuals.map(c => ({ condition: c.whatIfCondition, outcome: c.expectedOutcome })), null, 2)}

Rules:
1. Every evidenceId MUST exist in the OIR graph.
2. Assess risks based on EXISTING semantic analysis, not invented scenarios.
3. Side-effect steps must be rated at least MEDIUM risk.
4. Steps with unsatisfied preconditions must be flagged.

Output ONLY valid JSON matching this schema:
${RISK_ASSESSMENT_SCHEMA}
`.trim();

  try {
    const response = await callLlm({
      systemPrompt: "You are a rigid, deterministic risk assessment engine. Output only raw JSON.",
      userPrompt: prompt,
      schemaDescription: RISK_ASSESSMENT_SCHEMA,
      temperature: 0.1
    });

    const data = response.data as any;

    // Validate and sanitize
    const validRiskLevels = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
    const validRecs = ["PROCEED", "PROCEED_WITH_CAUTION", "REQUIRES_HUMAN_APPROVAL", "ABORT"];

    const risks = Array.isArray(data.risks) ? data.risks.map((r: any) => ({
      description: r.description || "Unknown risk",
      likelihood: typeof r.likelihood === "number" ? Math.min(1, Math.max(0, r.likelihood)) : 0.5,
      impact: r.impact || "Unknown impact",
      mitigations: Array.isArray(r.mitigations) ? r.mitigations : [],
      evidenceIds: Array.isArray(r.evidenceIds) ? r.evidenceIds.filter((id: string) => validIds.has(id)) : []
    })) : [];

    const preconditions = Array.isArray(data.preconditions) ? data.preconditions.map((p: any) => ({
      description: p.description || "Unknown precondition",
      satisfied: typeof p.satisfied === "boolean" ? p.satisfied : false,
      evidenceIds: Array.isArray(p.evidenceIds) ? p.evidenceIds.filter((id: string) => validIds.has(id)) : []
    })) : [];

    // Enforce invariant: side-effect steps must be at least MEDIUM
    let riskLevel = validRiskLevels.includes(data.riskLevel) ? data.riskLevel : "MEDIUM";
    if (step.hasSideEffects && riskLevel === "LOW") {
      riskLevel = "MEDIUM";
    }

    return {
      stepId: step.stepId,
      riskLevel: riskLevel as any,
      recommendation: validRecs.includes(data.recommendation) ? data.recommendation as any : "PROCEED_WITH_CAUTION",
      risks,
      applicableConstraints: Array.isArray(data.applicableConstraints) ? data.applicableConstraints : [],
      applicableUnknowns: Array.isArray(data.applicableUnknowns) ? data.applicableUnknowns : [],
      preconditions,
      reasoning: data.reasoning || "No reasoning provided.",
      confidence: typeof data.confidence === "number" ? Math.min(1, Math.max(0, data.confidence)) : 0.5
    };
  } catch (error: any) {
    console.error(`Risk assessment failed for step ${step.stepId}: ${error.message}`);
    // Fail-safe: flag as HIGH risk if LLM fails
    return {
      stepId: step.stepId,
      riskLevel: "HIGH",
      recommendation: "PROCEED_WITH_CAUTION",
      risks: [{ description: `Risk assessment engine failure: ${error.message}`, likelihood: 1, impact: "Assessment unavailable", mitigations: ["Manual review"], evidenceIds: [] }],
      applicableConstraints: [],
      applicableUnknowns: [],
      preconditions: [],
      reasoning: `LLM inference failed: ${error.message}. Defaulting to HIGH risk.`,
      confidence: 0.1
    };
  }
}

/**
 * Pre-compute risk assessments for all steps in a workflow.
 * Called once before execution begins.
 */
export async function assessAllSteps(
  steps: StepDescriptor[],
  graph: OirGraph,
  operationalUnderstanding: OperationalUnderstanding,
  semanticUnderstanding: SemanticUnderstanding
): Promise<Map<string, StepRiskAssessment>> {
  const assessments = new Map<string, StepRiskAssessment>();

  // Run assessments sequentially to avoid LLM rate limits
  for (const step of steps) {
    const assessment = await assessStepRisk(step, graph, operationalUnderstanding, semanticUnderstanding);
    assessments.set(step.stepId, assessment);
  }

  return assessments;
}
