import { ActionNode } from "../../types.js";
import { ProvenanceTracker } from "../provenance-tracker.js";
import { Observation, BrowserEventObservation, ApiCallObservation } from "../types.js";

export function extractActions(
  observations: Observation[],
  tracker: ProvenanceTracker
): ActionNode[] {
  const actions: ActionNode[] = [];

  for (const obs of observations) {
    if (obs.type === "BROWSER_EVENT") {
      const bObs = obs as BrowserEventObservation;
      
      const provenance = [tracker.createProvenance(obs.id, `Extracted action from browser event ${bObs.eventType}`)];
      
      actions.push({
        id: `action_${bObs.id}`,
        name: `${bObs.eventType.toUpperCase()} on ${bObs.targetSelector || bObs.url}`,
        type: "ACTION",
        operation: bObs.eventType.toUpperCase(),
        inputs: bObs.value ? { value: bObs.value } : {},
        outputs: [],
        sideEffects: bObs.eventType !== "scroll",
        provenance,
        confidence: 0.9 // High confidence for deterministic deterministic browser events
      });
    }

    if (obs.type === "API_CALL") {
      const aObs = obs as ApiCallObservation;
      
      const provenance = [tracker.createProvenance(obs.id, `Extracted action from API call ${aObs.method}`)];
      
      actions.push({
        id: `action_${aObs.id}`,
        name: `${aObs.method} ${aObs.endpoint}`,
        type: "ACTION",
        operation: "API_CALL",
        inputs: aObs.requestBody ? { body: aObs.requestBody } : {},
        outputs: [], // Potentially could extract variable outputs if we parse response
        sideEffects: aObs.method !== "GET",
        provenance,
        confidence: 0.95
      });
    }
  }

  return actions;
}
