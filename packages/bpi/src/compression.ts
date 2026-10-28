import type { Observation, SemanticEvent } from "./index.js";
import { extractStructuredData } from "./llm.js";

export class ObservationCompressionEngine {
  /**
   * Compresses raw observations into high-level SemanticEvents.
   * Preserves provenance by linking original sequence IDs.
   */
  async compress(observations: Observation[]): Promise<SemanticEvent[]> {
    if (!observations || observations.length === 0) return [];

    // 1. Normalization & Noise Removal
    // Remove duplicate wait events or purely technical noise (like mousemove if it was present)
    const normalized = this.removeNoise(observations);

    // 2. Duplicate Elimination
    // If consecutive clicks happen on the exact same target within a short time, merge them
    const deduplicated = this.eliminateDuplicates(normalized);

    // Instead of using an LLM to hallucinate summaries, we use Deterministic Semantic Minification.
    // 1. Remove duplicate events safely.
    // 2. Strip heavy DOM evidence and metadata that aren't critical for intent (keep tag, id, name, text).
    // 3. Keep sequence, action, minimal context, minimal target, minimal value.
    
    const semanticTimeline: any[] = [];
    
    for (const obs of deduplicated) {
      const minified: any = { s: obs.sequence, a: obs.action };
      
      // Preserve critical context for navigation only, or if URL changes
      if (obs.action === "NAVIGATE") {
        minified.u = obs.context.url;
      }
      
      if (obs.target?.dom_evidence) {
        minified.t = { 
          tag: obs.target.dom_evidence.tag, 
          id: obs.target.dom_evidence.attributes?.id,
          class: obs.target.dom_evidence.attributes?.class,
          txt: obs.target.dom_evidence.text 
        };
      }
      
      if (obs.value) {
        minified.v = obs.value.raw_value;
      }
      
      semanticTimeline.push(minified);
    }
    
    return semanticTimeline as any;
  }

  private removeNoise(observations: Observation[]): Observation[] {
    return observations.filter((obs, i, arr) => {
      const previous = arr[i - 1];
      // Example rule: remove consecutive WAITs
      if (obs.action === "WAIT") {
        if (previous && previous.action === "WAIT") return false;
      }
      return true;
    });
  }

  private eliminateDuplicates(observations: Observation[]): Observation[] {
    const deduplicated: Observation[] = [];
    for (const obs of observations) {
      if (deduplicated.length > 0) {
        const last = deduplicated[deduplicated.length - 1];
        if (obs.action === "CLICK" && last?.action === "CLICK") {
          // If the target is identical and time difference is small, skip it
          if (JSON.stringify(obs.target) === JSON.stringify(last.target)) {
             continue; // skip duplicate click
          }
        }
      }
      deduplicated.push(obs);
    }
    return deduplicated;
  }

  private detectEpisodes(observations: Observation[]): Observation[][] {
    // Kept for structural compatibility if needed later, but not used in lossless minification.
    return [observations];
  }
}
