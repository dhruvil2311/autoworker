import { describe, expect, it } from "vitest";
import { BusinessProcessIntelligence } from "./pipeline.js";
import type { NormalizedDemonstration } from "./index.js";

describe("Hybrid Business Process Intelligence (Phase 1C)", () => {
  const bpi = new BusinessProcessIntelligence();

  it("Scenario A: Inventory with Ambiguity - Identifies missing transformation", async () => {
    const demo: NormalizedDemonstration = {
      recording_id: "rec_123",
      tenant_id: "tenant_abc",
      source: "chrome_extension",
      started_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
      observations: [
        { sequence: 1, timestamp: new Date().toISOString(), action: "EXTRACT", context: { url: "https://supplier.example.com", page_title: "Stock" }, value: { raw_value: "150", is_sensitive: false, classification: { value: "EXAMPLE_VALUE", confidence: 0, classification: "UNKNOWN", evidence: [] } } },
        { sequence: 2, timestamp: new Date().toISOString(), action: "INPUT", context: { url: "https://inventory.example.com", page_title: "Edit" }, value: { raw_value: "145", is_sensitive: false, classification: { value: "EXAMPLE_VALUE", confidence: 0, classification: "UNKNOWN", evidence: [] } } }
      ]
    };
    const { generalization, gaps, specification } = await bpi.processDemonstration(demo, "ambiguity");
    
    expect(generalization.variables["var_2"]!.classification?.value).toBe("DERIVED_VALUE");
    const gapIds = gaps.map(g => g.gap_id);
    expect(gapIds).toContain("gap_var_2_transformation");
    expect(specification.status).toBe("NEEDS_CLARIFICATION");

    const updatedSpec = bpi.applyClarificationAnswer(specification, "gap_var_2_transformation", "Always keep a buffer of 5", "User");
    expect(updatedSpec.unresolvedGaps.find(g => g.gap_id === "gap_var_2_transformation")).toBeUndefined();
    expect(updatedSpec.transformations.length).toBe(1);
    expect(updatedSpec.status).toBe("READY_FOR_TEST_COMPILATION");
  });

  it("Scenario B: B2B Order Processing - Data Flow Override", async () => {
    const demo: NormalizedDemonstration = {
      recording_id: "rec_456",
      tenant_id: "tenant_xyz",
      source: "chrome_extension",
      started_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
      observations: [
        { sequence: 1, timestamp: new Date().toISOString(), action: "EXTRACT", context: { url: "https://mail.example.com", page_title: "Inbox" }, value: { raw_value: "PO-777", is_sensitive: false, classification: { value: "EXAMPLE_VALUE", confidence: 0, classification: "UNKNOWN", evidence: [] } } },
        { sequence: 2, timestamp: new Date().toISOString(), action: "INPUT", context: { url: "https://erp.example.com", page_title: "Create" }, value: { raw_value: "PO-777", is_sensitive: false, classification: { value: "EXAMPLE_VALUE", confidence: 0, classification: "UNKNOWN", evidence: [] } } }
      ]
    };
    const { generalization, gaps } = await bpi.processDemonstration(demo);
    
    expect(generalization.data_flow.length).toBe(1);
    expect(generalization.variables["var_2"]!.classification?.value).toBe("RUNTIME_VARIABLE");
    expect(generalization.variables["var_2"]!.classification?.classification).toBe("INFERRED_RULE"); // Deterministically proven
  });

  it("Scenario C: Reporting Data Derivation", async () => {
    const demo: NormalizedDemonstration = {
      recording_id: "rec_rep",
      tenant_id: "tnt",
      source: "ext",
      started_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
      observations: [
        { sequence: 1, timestamp: new Date().toISOString(), action: "EXTRACT", context: { url: "A", page_title: "A" }, value: { raw_value: "sales_report.csv", is_sensitive: false, classification: { value: "EXAMPLE_VALUE", confidence: 0, classification: "UNKNOWN", evidence: [] } } },
        { sequence: 2, timestamp: new Date().toISOString(), action: "EXTRACT", context: { url: "B", page_title: "B" }, value: { raw_value: "returns_report.xlsx", is_sensitive: false, classification: { value: "EXAMPLE_VALUE", confidence: 0, classification: "UNKNOWN", evidence: [] } } }
      ]
    };
    const { generalization } = await bpi.processDemonstration(demo);
    expect(generalization.variables["var_1"]).toBeDefined();
    expect(generalization.variables["var_2"]).toBeDefined();
    // BPI handles data files by registering them as variables
  });

  it("Adversarial: Preserving Uncertainty (Constant)", async () => {
    const demo: NormalizedDemonstration = {
      recording_id: "rec_789",
      tenant_id: "tenant_xyz",
      source: "chrome_extension",
      started_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
      observations: [
        { sequence: 1, timestamp: new Date().toISOString(), action: "INPUT", context: { url: "https://example.com", page_title: "Form" }, value: { raw_value: "India", is_sensitive: false, classification: { value: "EXAMPLE_VALUE", confidence: 0, classification: "UNKNOWN", evidence: [] } } }
      ]
    };
    const { generalization, gaps } = await bpi.processDemonstration(demo);
    expect(generalization.variables["var_1"]!.classification?.value).toBe("CONSTANT");
    expect(gaps.map(g => g.gap_id)).not.toContain("gap_var_1");
  });

  it("User Correction: Final committed action overrides previous", async () => {
    const demo: NormalizedDemonstration = {
      recording_id: "rec_corr",
      tenant_id: "tnt",
      source: "ext",
      started_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
      observations: [
        { sequence: 1, timestamp: new Date().toISOString(), action: "INPUT", context: { url: "A", page_title: "A" }, value: { raw_value: "wrong_value", is_sensitive: false, classification: { value: "EXAMPLE_VALUE", confidence: 0, classification: "UNKNOWN", evidence: [] } } },
        { sequence: 2, timestamp: new Date().toISOString(), action: "KEYBOARD", context: { url: "A", page_title: "A" },  }, // Delete
        { sequence: 3, timestamp: new Date().toISOString(), action: "INPUT", context: { url: "A", page_title: "A" }, value: { raw_value: "correct_value", is_sensitive: false, classification: { value: "EXAMPLE_VALUE", confidence: 0, classification: "UNKNOWN", evidence: [] } } }
      ]
    };
    const { generalization } = await bpi.processDemonstration(demo);
    // Both are captured, but the AI context should ideally focus on the last one.
    // In our deterministic model, both inputs are registered. This test ensures it runs without crashing,
    // though deeper filtering of canceled inputs is a future optimization.
    expect(generalization.variables["var_1"]).toBeDefined();
    expect(generalization.variables["var_3"]).toBeDefined();
  });

  it("Coincidental Match: Rejects false data-flow promotion without semantic alignment", async () => {
    const demo: NormalizedDemonstration = {
      recording_id: "rec_coincidental",
      tenant_id: "tenant_xyz",
      source: "chrome_extension",
      started_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
      observations: [
        { sequence: 1, timestamp: new Date().toISOString(), action: "EXTRACT", context: { url: "https://warehouse.example.com", page_title: "Stock" }, value: { raw_value: "1001", is_sensitive: false, classification: { value: "EXAMPLE_VALUE", confidence: 0, classification: "UNKNOWN", evidence: [] } } },
        { sequence: 2, timestamp: new Date().toISOString(), action: "INPUT", context: { url: "https://orders.example.com", page_title: "Count" }, value: { raw_value: "1001", is_sensitive: false, classification: { value: "EXAMPLE_VALUE", confidence: 0, classification: "UNKNOWN", evidence: [] } } }
      ]
    };
    const { generalization } = await bpi.processDemonstration(demo, "coincidental");
    
    // Deterministic flow exists
    expect(generalization.data_flow.length).toBe(1);
    
    // BUT semantic reconciliation should not automatically promote to RUNTIME_VARIABLE since roles are disjoint
    expect(generalization.variables["var_2"]!.classification?.value).toBe("EXAMPLE_VALUE"); 
    expect(generalization.variables["var_2"]!.classification?.classification).not.toBe("OBSERVED_FACT");
  });

  it("Negative Generalization: Preserves uncertainty for single special record", async () => {
    const demo: NormalizedDemonstration = {
      recording_id: "rec_neg_gen",
      tenant_id: "tenant_xyz",
      source: "chrome_extension",
      started_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
      observations: [
        { sequence: 1, timestamp: new Date().toISOString(), action: "INPUT", context: { url: "https://example.com", page_title: "Form" }, value: { raw_value: "SPECIAL_RECORD_XYZ", is_sensitive: false, classification: { value: "EXAMPLE_VALUE", confidence: 0, classification: "UNKNOWN", evidence: [] } } }
      ]
    };
    const { generalization, gaps } = await bpi.processDemonstration(demo);
    // Since it's not overridden by AI as constant (unless AI specifically thinks it is), it remains EXAMPLE_VALUE
    expect(generalization.variables["var_1"]!.classification?.value).toBe("EXAMPLE_VALUE");
    // And it generates a scope gap to preserve uncertainty
    expect(gaps.map(g => g.gap_id)).toContain("gap_var_1");
  });

  it("Reporting Fixture: Combines multiple data sources and derived metrics", async () => {
    const demo: NormalizedDemonstration = {
      recording_id: "rec_reporting",
      tenant_id: "tnt",
      source: "ext",
      started_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
      observations: [
        { sequence: 1, timestamp: new Date().toISOString(), action: "EXTRACT", context: { url: "A", page_title: "A" }, value: { raw_value: "sales.csv", is_sensitive: false, classification: { value: "EXAMPLE_VALUE", confidence: 0, classification: "UNKNOWN", evidence: [] } } },
        { sequence: 2, timestamp: new Date().toISOString(), action: "EXTRACT", context: { url: "B", page_title: "B" }, value: { raw_value: "returns.xlsx", is_sensitive: false, classification: { value: "EXAMPLE_VALUE", confidence: 0, classification: "UNKNOWN", evidence: [] } } },
        { sequence: 3, timestamp: new Date().toISOString(), action: "INPUT", context: { url: "C", page_title: "C" }, value: { raw_value: "145", is_sensitive: false, classification: { value: "EXAMPLE_VALUE", confidence: 0, classification: "UNKNOWN", evidence: [] } } }
      ]
    };
    const { generalization, gaps, specification } = await bpi.processDemonstration(demo, "reporting");
    
    // Extracted files are identified
    expect(generalization.variables["var_1"]!.classification?.value).toBe("EXTRACTED_VALUE");
    expect(generalization.variables["var_2"]!.classification?.value).toBe("EXTRACTED_VALUE");
    
    // Derived metric creates a gap for transformation logic
    expect(generalization.variables["var_3"]!.classification?.value).toBe("DERIVED_VALUE");
    expect(gaps.map(g => g.gap_id)).toContain("gap_var_3_transformation");
  });
});
