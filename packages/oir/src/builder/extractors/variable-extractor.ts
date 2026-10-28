import { Variable } from "../../types.js";
import { ProvenanceTracker } from "../provenance-tracker.js";
import { Observation, CsvDataObservation, ExcelDataObservation, BrowserEventObservation } from "../types.js";

export function extractVariables(
  observations: Observation[],
  tracker: ProvenanceTracker
): Variable[] {
  const variables = new Map<string, Variable>();

  for (const obs of observations) {
    if (obs.type === "CSV_DATA" || obs.type === "EXCEL_DATA") {
      const tableObs = obs as CsvDataObservation | ExcelDataObservation;
      const prefix = obs.type === "EXCEL_DATA" ? "excel" : "csv";
      
      for (const header of tableObs.headers) {
        const varId = `var_${prefix}_${tableObs.id}_${header}`;
        if (!variables.has(varId)) {
          variables.set(varId, {
            id: varId,
            name: header,
            type: "string", // fallback
            description: `Extracted from ${prefix.toUpperCase()} header: ${header}`
          });
        }
      }
    }

    if (obs.type === "BROWSER_EVENT") {
      const bObs = obs as BrowserEventObservation;
      if (bObs.eventType === "input" && bObs.targetSelector) {
        // Very basic heuristic: An input event probably maps to a variable
        const varId = `var_input_${bObs.id}`;
        variables.set(varId, {
          id: varId,
          name: `Input_${bObs.targetSelector}`,
          type: "string",
          defaultValue: bObs.value,
          description: `Extracted from browser input event on ${bObs.targetSelector}`
        });
      }
    }
  }

  return Array.from(variables.values());
}
