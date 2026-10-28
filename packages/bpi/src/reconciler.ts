import type { Observation, BusinessEntityCandidate, VariableCandidate, DataFlowEdge, VariableClassification } from "./index.js";

export class CandidateReconciler {
  reconcileEntities(
    observations: Observation[],
    inferences: Record<number, { name: string; confidence: number; reasoning: string }> = {}
  ): Record<number, BusinessEntityCandidate> {
    const safeInferences = inferences || {};
    const entities: Record<number, BusinessEntityCandidate> = {};
    for (const obs of observations) {
      if (obs.target) {
        const inf = safeInferences[obs.sequence];
        const entity: BusinessEntityCandidate = { ...obs.target };
        if (inf) {
          entity.semantic_name = {
            value: inf.name,
            confidence: inf.confidence,
            classification: "INFERRED_RULE",
            evidence: [{ type: "OBSERVATION", id: obs.sequence.toString(), description: "Target element" }],
            reasoningSummary: inf.reasoning
          };
        }
        entities[obs.sequence] = entity;
      }
    }
    return entities;
  }

  reconcileVariables(
    observations: Observation[],
    inferences: Record<string, { classification: VariableClassification; type: "string" | "number" | "boolean" | "date"; semantic_role: string; confidence: number; reasoning: string }> = {},
    dataFlow: DataFlowEdge[] = []
  ): Record<string, VariableCandidate> {
    const safeInferences = inferences || {};
    const variables: Record<string, VariableCandidate> = {};
    
    // First pass: apply AI inferences (semantic meaning)
    for (const obs of observations) {
      if (obs.value && obs.value.raw_value) {
        const varName = `var_${obs.sequence}`;
        const inf = safeInferences[varName];
        const variable: VariableCandidate = {
          ...obs.value,
          classification: inf ? {
            value: inf.classification,
            confidence: inf.confidence,
            classification: "INFERRED_RULE",
            evidence: [{ type: "OBSERVATION", id: obs.sequence.toString(), description: "Observed value" }],
            reasoningSummary: inf.reasoning
          } : {
            value: "USER_INPUT",
            confidence: 0.5,
            classification: "UNKNOWN",
            evidence: []
          }
        };

        if (inf) {
          variable.inferred_type = {
            value: inf.type,
            confidence: inf.confidence,
            classification: "INFERRED_RULE",
            evidence: []
          };
          variable.semantic_role = {
            value: inf.semantic_role,
            confidence: inf.confidence,
            classification: "INFERRED_RULE",
            evidence: []
          };
        }
        variables[varName] = variable;
      }
    }

    // Second pass: Data Flow Validation (Structural Fact vs Semantic Inference)
    // A coincidental string match does not guarantee identical semantic meaning.
    // If we observe string equality across systems, it is a CROSS_SYSTEM_VALUE_TRANSFER fact,
    // which *supports* a RUNTIME_VARIABLE inference, but does not unconditionally force it
    // if the semantic roles are completely disjoint.
    for (const edge of dataFlow) {
      const sourceVar = variables[`var_${edge.source_observation_sequence}`];
      const targetVar = variables[`var_${edge.target_observation_sequence}`];
      
      if (sourceVar && targetVar) {
        // If the LLM already thought it was a RUNTIME_VARIABLE or EXTRACTED_VALUE, this structural fact confirms it.
        const semanticAlignment = 
          sourceVar.classification.value === "RUNTIME_VARIABLE" || 
          sourceVar.classification.value === "EXTRACTED_VALUE" ||
          sourceVar.semantic_role?.value === targetVar.semantic_role?.value;

        if (semanticAlignment) {
          sourceVar.classification.value = "RUNTIME_VARIABLE";
          sourceVar.classification.confidence = Math.min(1.0, sourceVar.classification.confidence + 0.3); // Boost confidence
          sourceVar.classification.classification = "INFERRED_RULE"; // Still an inferred rule, backed by structural fact
          sourceVar.classification.evidence.push({
            type: "OBSERVATION", id: edge.target_observation_sequence.toString(), description: "Structural value transfer observed to target"
          });
          
          targetVar.classification.value = "RUNTIME_VARIABLE";
          targetVar.classification.confidence = Math.min(1.0, targetVar.classification.confidence + 0.3);
          targetVar.classification.classification = "INFERRED_RULE";
          targetVar.classification.evidence.push({
            type: "OBSERVATION", id: edge.source_observation_sequence.toString(), description: "Structural value transfer observed from source"
          });
        }
      }
    }

    return variables;
  }
}
