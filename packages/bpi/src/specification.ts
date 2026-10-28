import type { NormalizedDemonstration, ProcessGeneralization, ProcessGap, BusinessProcessSpecification } from "./index.js";

export class SpecificationBuilder {
  generateSpecification(demo: NormalizedDemonstration, generalization: ProcessGeneralization, gaps: ProcessGap[]): BusinessProcessSpecification {
    const hasBlockingGaps = gaps.some(g => g.blocking);
    
    return {
      id: `bps_${demo.recording_id}`,
      version: "1.0",
      status: hasBlockingGaps ? "NEEDS_CLARIFICATION" : "READY_FOR_TEST_COMPILATION",
      identity: {
        process_id: `proc_${demo.recording_id}`,
        name: generalization.workflow_intent.value
      },
      intent: generalization.workflow_intent.value,
      steps: demo.observations,
      systems: [...new Set(demo.observations.map(o => {
        try { return new URL(o.context.url).hostname; } catch { return o.context.url; }
      }))],
      scope: "Discovered from demonstration",
      entities: {},
      variables: generalization.variables,
      dataSources: [],
      dataFlow: generalization.data_flow,
      matchingRules: [],
      businessRules: [],
      transformations: [],
      exceptionPolicies: [],
      safetyPolicies: [],
      successCriteria: [],
      assumptions: generalization.facts.filter(f => f.classification === "ASSUMPTION").map(f => f.value),
      unresolvedGaps: gaps,
      confidence: generalization.workflow_intent.confidence
    };
  }

  applyClarificationAnswer(spec: BusinessProcessSpecification, gapId: string, answer: string, actor: string): BusinessProcessSpecification {
    const updatedSpec = JSON.parse(JSON.stringify(spec)) as BusinessProcessSpecification;
    if (!updatedSpec.unresolvedGaps) updatedSpec.unresolvedGaps = [];
    if (!updatedSpec.businessRules) updatedSpec.businessRules = [];
    if (!updatedSpec.transformations) updatedSpec.transformations = [];
    if (!updatedSpec.assumptions) updatedSpec.assumptions = [];
    if (!updatedSpec.variables) updatedSpec.variables = {};

    const safeAnswer = (answer ?? "").toString().trim();
    const ansLower = safeAnswer.toLowerCase();
    
    const gapIndex = updatedSpec.unresolvedGaps.findIndex(g => g.gap_id === gapId || g.gap_id?.includes(gapId) || gapId?.includes(g.gap_id));
    if (gapIndex >= 0) {
      const gap = updatedSpec.unresolvedGaps[gapIndex];
      let resolved = false;

      if (gapId.startsWith("gap_var_")) {
        const isTransformation = gapId.endsWith("_transformation");
        const varName = gapId.replace("gap_", "").replace("_transformation", "");
        
        if (isTransformation) {
          updatedSpec.transformations.push({
            source_gap: gapId,
            description: safeAnswer || "Transform from previous step",
            actor
          });
          resolved = true;
        } else if (updatedSpec.variables[varName]) {
          if (ansLower.includes("constant") || ansLower.includes("exact") || ansLower.includes("always")) {
            updatedSpec.variables[varName].classification.value = "CONSTANT";
            updatedSpec.variables[varName].classification.confidence = 1.0;
            updatedSpec.variables[varName].classification.classification = "OBSERVED_FACT";
            if (safeAnswer && !ansLower.includes("constant") && !ansLower.includes("always")) {
              updatedSpec.variables[varName].raw_value = safeAnswer;
            }
            resolved = true;
          } else {
            updatedSpec.variables[varName].classification.value = "RUNTIME_VARIABLE";
            updatedSpec.variables[varName].classification.confidence = 1.0;
            updatedSpec.variables[varName].classification.classification = "OBSERVED_FACT";
            
            if (ansLower.includes("file") || ansLower.includes("upload") || ansLower.includes("csv")) {
               updatedSpec.scope = `FILE: ${safeAnswer}`;
            }
            resolved = true;
          }
        } else {
          resolved = true;
        }
      } else if (gapId.startsWith("gap_rule_")) {
        // Business rule confirmation
        const gapDescription = gap?.description ?? "";
        if (ansLower.includes("yes") || ansLower.includes("correct") || ansLower.includes("follow") || !ansLower.includes("no")) {
          // Confirmed — add to business rules
          updatedSpec.businessRules.push({
            source_gap: gapId,
            description: gapDescription.replace('Ghost inferred a business rule: ', '').replace('Inferred rule: ', '').replace(/"/g, '') || safeAnswer,
            confirmed_by: actor,
            confirmed_at: new Date().toISOString()
          });
          resolved = true;
        } else if (ansLower.includes("no") || ansLower.includes("remove") || ansLower.includes("ignore")) {
          // Rejected — simply remove the gap without adding the rule
          resolved = true;
        } else {
          // Custom adjustment — store the user's rule
          updatedSpec.businessRules.push({
            source_gap: gapId,
            description: safeAnswer,
            confirmed_by: actor,
            confirmed_at: new Date().toISOString()
          });
          resolved = true;
        }
      } else if (gapId.startsWith("gap_ambiguity_")) {
        // Ambiguity clarification — store the answer as an assumption
        if (gap) {
          updatedSpec.assumptions.push(`[Clarified] ${gap.description}: ${safeAnswer}`);
        }
        resolved = true;
      } else if (gapId.startsWith("gap_iteration_")) {
        // Iteration gap
        if (ansLower.includes("yes") || ansLower.includes("every") || ansLower.includes("all")) {
          // Confirmed loop — already captured in structure
          resolved = true;
        } else {
          // Not a loop — note this as an assumption
          updatedSpec.assumptions.push(`User confirmed: only process specific item (${safeAnswer})`);
          resolved = true;
        }
      } else {
        // Generic gap fallback (e.g. gap_no_executable_steps)
        if (gap) {
          updatedSpec.assumptions.push(`[Clarified ${gapId}]: ${safeAnswer}`);
        }
        resolved = true;
      }

      if (resolved) {
        updatedSpec.unresolvedGaps.splice(gapIndex, 1);
      }
    } else {
      // If gap wasn't found by index, record as generalized assumption
      updatedSpec.assumptions.push(`[Clarification ${gapId}]: ${safeAnswer}`);
    }
    
    // Re-evaluate state
    const hasBlockingGaps = updatedSpec.unresolvedGaps.some(g => g.blocking);
    updatedSpec.status = hasBlockingGaps ? "NEEDS_CLARIFICATION" : "READY_FOR_TEST_COMPILATION";

    return updatedSpec;
  }
}
