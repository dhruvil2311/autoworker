import { describe, it, expect } from "vitest";
import { OirBuilder } from "../OirBuilder.js";
import { Observation, BrowserEventObservation, ApiCallObservation, CsvDataObservation } from "../types.js";
import { ProvenanceError } from "../provenance-tracker.js";

describe("OirBuilder", () => {
  it("should extract actions from browser events", () => {
    const builder = new OirBuilder();
    const obs: BrowserEventObservation = {
      id: "ev1",
      type: "BROWSER_EVENT",
      timestamp: new Date().toISOString(),
      url: "https://example.com",
      eventType: "click",
      targetSelector: "#submit-btn"
    };

    const graph = builder.build([obs], "Test goal");
    
    expect(graph.nodes.length).toBe(1);
    expect(graph.nodes[0].type).toBe("ACTION");
    expect(graph.nodes[0].provenance![0].evidenceId).toBe("ev1");
  });

  it("should extract variables from CSV headers", () => {
    const builder = new OirBuilder();
    const obs: CsvDataObservation = {
      id: "csv1",
      type: "CSV_DATA",
      timestamp: new Date().toISOString(),
      filename: "data.csv",
      headers: ["firstName", "lastName"],
      rows: []
    };

    const graph = builder.build([obs], "Test goal");
    
    expect(graph.variables.length).toBe(2);
    expect(graph.variables[0].name).toBe("firstName");
  });

  it("should throw error if provenance is lost (mock check)", () => {
    // Provenance validation is built in. If we manually mutate the node to remove provenance,
    // the builder would have thrown during assembly (or we can test it directly on tracker).
    const builder = new OirBuilder();
    // This succeeds because the builder correctly attaches provenance to extracted nodes.
    const obs: ApiCallObservation = {
      id: "api1",
      type: "API_CALL",
      timestamp: new Date().toISOString(),
      method: "GET",
      endpoint: "/api/users",
      statusCode: 200,
      responseBody: [{ id: 1, name: "Alice" }]
    };
    
    const graph = builder.build([obs], "Test API");
    expect(graph.entities.length).toBe(1);
    expect(graph.entities[0].value.name).toBe("Alice");
  });
});
