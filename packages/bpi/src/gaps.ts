import type { ProcessGeneralization, ProcessGap } from "./index.js";

export class GapDetector {
  detectGaps(generalization: ProcessGeneralization): ProcessGap[] {
    const gaps: ProcessGap[] = [];
    
    // Variable Ambiguity Gaps
    for (const [varName, variable] of Object.entries(generalization.variables)) {
      const valStr = variable.raw_value ? `"${variable.raw_value}"` : `this field (${varName})`;
      const roleStr = variable.semantic_role || varName;
      const isMissingOrPlaceholder = !variable.raw_value || variable.raw_value.startsWith("<") || variable.raw_value.startsWith("{{");

      if (variable.classification.value === "EXAMPLE_VALUE") {
        gaps.push({
          gap_id: `gap_${varName}`,
          category: "SCOPE",
          description: `Input value ${valStr} was provided for ${roleStr}. Is this a fixed constant or a dynamic input?`,
          why_it_matters: "Hardcoding this value will cause the workflow to enter the same text on every run.",
          risk_level: isMissingOrPlaceholder ? "HIGH" : "MEDIUM",
          blocking: isMissingOrPlaceholder,
          related_inference: variable.classification,
          supporting_evidence: variable.classification.evidence || [],
          suggested_question: {
            question_text: `What value should Autoworker use for ${roleStr} (${valStr}) during a real run?`,
            suggested_options: ["It changes every run (Input Variable)", "Always use this exact value (Constant)"]
          },
          discover_during_test: false
        });
      } else if (variable.classification.value === "DERIVED_VALUE" && variable.classification.confidence < 0.9) {
         gaps.push({
          gap_id: `gap_${varName}_transformation`,
          category: "TRANSFORMATION",
          description: `Value ${valStr} appears to be calculated or derived from previous steps.`,
          why_it_matters: "Without the formula or source, Autoworker cannot calculate this value for future runs.",
          risk_level: "HIGH",
          blocking: true,
          related_inference: variable.classification,
          supporting_evidence: variable.classification.evidence || [],
          suggested_question: {
            question_text: `How should Autoworker calculate or retrieve the value for ${roleStr} (${valStr})?`,
            suggested_options: ["Copy from page", "Calculate from other inputs", "Use dynamic variable"]
          },
          discover_during_test: false
        });
      }
    }
    
    // Iteration Gaps
    if (generalization.structure?.value?.type === "LOOP") {
      gaps.push({
        gap_id: `gap_iteration_${generalization.structure.value.steps?.join("_") || "items"}`,
        category: "ITERATION",
        description: `Multiple similar items or list elements were interacted with.`,
        why_it_matters: "Autoworker needs to know if it should repeat these steps for every item in the list or only specific ones.",
        risk_level: "HIGH",
        blocking: true,
        related_inference: {
          property: "structure",
          value: "LOOP",
          confidence: generalization.structure.confidence,
          evidence: "Multiple similar elements interacted with"
        },
        supporting_evidence: [],
        suggested_question: {
          question_text: `Should Autoworker perform these actions for every item in the list?`,
          suggested_options: ["Yes, process every item", "No, only process the specific item shown"]
        },
        discover_during_test: false
      });
    }

    // Business Rule Gaps — inform user of inferred rules without blocking valid execution
    if (generalization.businessRules) {
      for (let i = 0; i < generalization.businessRules.length; i++) {
        const rule = generalization.businessRules[i]!;
        gaps.push({
          gap_id: `gap_rule_${i}`,
          category: "BUSINESS_RULE",
          description: `Inferred rule: "${rule.value}"`,
          why_it_matters: "If this rule is incorrect, Autoworker may make invalid decisions during execution.",
          risk_level: "LOW",
          blocking: false,
          related_inference: rule,
          supporting_evidence: rule.evidence || [],
          suggested_question: {
            question_text: `Should Autoworker follow this rule: "${rule.value}"?`,
            suggested_options: ["Yes, that's correct", "No, ignore this rule", "Adjust rule"]
          },
          discover_during_test: false
        });
      }
    }

    // Semantic Ambiguity Gaps — ask the user to clarify genuinely high-risk ambiguities
    if (generalization.ambiguities) {
      for (let i = 0; i < generalization.ambiguities.length; i++) {
        const ambiguity = generalization.ambiguities[i]!;
        const isCritical = ambiguity.toLowerCase().includes("fail") || ambiguity.toLowerCase().includes("error") || ambiguity.toLowerCase().includes("missing");
        gaps.push({
          gap_id: `gap_ambiguity_${i}`,
          category: "SCOPE",
          description: ambiguity,
          why_it_matters: "Autoworker needs your clarification on this step to avoid execution errors.",
          risk_level: isCritical ? "HIGH" : "MEDIUM",
          blocking: isCritical,
          related_inference: undefined,
          supporting_evidence: [],
          suggested_question: {
            question_text: `How should Autoworker handle this: "${ambiguity}"?`,
            suggested_options: ["Proceed normally", "Skip if not found", "Wait for human approval"]
          },
          discover_during_test: false
        });
      }
    }

    return gaps;
  }
}
