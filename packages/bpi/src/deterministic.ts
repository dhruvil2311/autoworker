import type { Observation, DataFlowEdge } from "./index.js";

export class DeterministicEvidenceExtractor {
  extractDataFlow(observations: Observation[]): DataFlowEdge[] {
    const edges: DataFlowEdge[] = [];
    const valuesBySequence = new Map<number, string>();

    for (const obs of observations) {
      if (obs.action === "EXTRACT" && obs.value?.raw_value) {
        valuesBySequence.set(obs.sequence, obs.value.raw_value);
      } else if (obs.action === "INPUT" && obs.value?.raw_value) {
        for (const [seq, val] of valuesBySequence.entries()) {
          if (val === obs.value.raw_value) {
            edges.push({
              source_observation_sequence: seq,
              target_observation_sequence: obs.sequence,
              variable_name: `var_${seq}`
            });
          }
        }
      }
    }
    return edges;
  }

  extractValues(observations: Observation[]): Record<string, string> {
    const values: Record<string, string> = {};
    for (const obs of observations) {
      if (obs.value?.raw_value) {
        values[`var_${obs.sequence}`] = obs.value.raw_value;
      }
    }
    return values;
  }
}
