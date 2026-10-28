import { describe, it, expect } from "vitest";
import { SemanticMapper, DiscoveredTool } from "../src/capabilities/mapper.js";

describe("Tool Discovery and Mapping", () => {
  const mapper = new SemanticMapper();

  it("maps well-known tools to correct semantic operations", () => {
    const listTool: DiscoveredTool = { name: "list_products" };
    const p1 = mapper.proposeMappings(listTool);
    expect(p1[0].semanticOperation).toBe("LIST_RECORDS");
    expect(p1[0].entityType).toBe("products");

    const getTool: DiscoveredTool = { name: "get_inventory" };
    const p2 = mapper.proposeMappings(getTool);
    expect(p2[0].semanticOperation).toBe("GET_RECORD");
    expect(p2[0].entityType).toBe("inventory");

    const updateTool: DiscoveredTool = { name: "update_inventory" };
    const p3 = mapper.proposeMappings(updateTool);
    expect(p3[0].semanticOperation).toBe("UPDATE_RECORD");
    expect(p3[0].entityType).toBe("inventory");
  });

  it("does not map ambiguous tools to mutations automatically", () => {
    const ambiguousTool: DiscoveredTool = { name: "process_item" };
    const p4 = mapper.proposeMappings(ambiguousTool);
    expect(p4.length).toBe(0); // Should be skipped or mapped to UNKNOWN_OPERATION internally
  });
});
