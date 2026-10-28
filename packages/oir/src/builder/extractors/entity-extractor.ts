import { BusinessObject, Entity } from "../../types.js";
import { ProvenanceTracker } from "../provenance-tracker.js";
import { Observation, ApiCallObservation } from "../types.js";

export function extractEntities(
  observations: Observation[],
  tracker: ProvenanceTracker
): { objects: BusinessObject[], entities: Entity[] } {
  const objects: BusinessObject[] = [];
  const entities: Entity[] = [];

  for (const obs of observations) {
    if (obs.type === "API_CALL") {
      const aObs = obs as ApiCallObservation;
      
      // Heuristic: A GET request returning an array might be a list of entities
      if (aObs.method === "GET" && Array.isArray(aObs.responseBody)) {
        const objId = `bo_api_${aObs.id}`;
        
        // Define Business Object from first element if exists
        if (aObs.responseBody.length > 0 && typeof aObs.responseBody[0] === 'object') {
            objects.push({
                id: objId,
                name: `Entity from ${aObs.endpoint}`,
                description: `Automatically extracted from API endpoint ${aObs.endpoint}`,
                properties: {} // We could iterate keys, but keep simple for now
            });

            // Define Entities
            aObs.responseBody.forEach((item: any, idx: number) => {
                entities.push({
                    id: `entity_${aObs.id}_${idx}`,
                    type: objId,
                    value: item,
                    confidence: 0.8
                });
            });
        }
      }
    }
  }

  return { objects, entities };
}
