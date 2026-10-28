import { Provenance } from "../types.js";
import { Observation } from "./types.js";

export class ProvenanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProvenanceError";
  }
}

export class ProvenanceTracker {
  private registeredObservations = new Map<string, Observation>();

  public registerObservation(obs: Observation) {
    this.registeredObservations.set(obs.id, obs);
  }

  public registerObservations(observations: Observation[]) {
    for (const obs of observations) {
      this.registeredObservations.set(obs.id, obs);
    }
  }

  public createProvenance(observationId: string, description?: string): Provenance {
    const obs = this.registeredObservations.get(observationId);
    if (!obs) {
      throw new ProvenanceError(`Cannot create provenance for unknown observation ID: ${observationId}`);
    }

    return {
      source: this.mapObservationTypeToSource(obs.type),
      evidenceId: obs.id,
      timestamp: obs.timestamp,
      description: description || `Extracted from ${obs.type}`
    };
  }

  public validateProvenance(provenanceList: Provenance[] | undefined) {
    if (!provenanceList || provenanceList.length === 0) {
      throw new ProvenanceError("Missing provenance evidence. Every node must retain provenance.");
    }

    for (const p of provenanceList) {
      if (p.evidenceId && !this.registeredObservations.has(p.evidenceId)) {
        throw new ProvenanceError(`Provenance refers to unregistered evidence ID: ${p.evidenceId}`);
      }
    }
  }

  private mapObservationTypeToSource(type: string): "BROWSER_EVENT" | "DOM" | "API_CALL" | "CSV" | "EXCEL" | "SOP" | "CLARIFICATION" | "HITL_CORRECTION" {
    switch (type) {
      case "BROWSER_EVENT": return "BROWSER_EVENT";
      case "DOM_SNAPSHOT": return "DOM";
      case "API_CALL": return "API_CALL";
      case "CSV_DATA": return "CSV";
      case "EXCEL_DATA": return "EXCEL";
      case "SOP_DOCUMENT": return "SOP";
      case "CLARIFICATION": return "CLARIFICATION";
      case "HITL_CORRECTION": return "HITL_CORRECTION";
      default: throw new Error(`Unknown observation type: ${type}`);
    }
  }
}
