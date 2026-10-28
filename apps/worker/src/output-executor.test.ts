import { describe, it, expect } from "vitest";
import { OutputExecutor } from "./output-executor.js";
import { RuntimeContext } from "@ghost/runtime";
import type { WorkflowV2Step } from "@ghost/workflow-schema";
import { translateToEnglish, getMultiLingualSynonyms, detectLanguage } from "./language-translator.js";

describe("Output Contract & Universal Execution Engine", () => {
  const executor = new OutputExecutor();

  function createContext(outputs: Record<string, any> = {}, inputs: Record<string, any> = {}) {
    return new RuntimeContext({
      inputs,
      variables: {},
      outputs,
      artifacts: {},
      scopes: [],
      executionMetadata: { runId: "test-run-123", tenantId: "test-tenant", workflowVersionId: "wv-1" }
    });
  }

  // TEST A — Extraction
  it("TEST A: Extraction returns actual extracted values", async () => {
    const context = createContext({
      var_customer: "Rahul Shah",
      var_total: "₹4,250.00",
      var_status: "Complete"
    });

    const buildStep: WorkflowV2Step = {
      id: "step_build",
      operation: "BUILD_OUTPUT",
      target: "OUTPUT",
      description: "Extract customer and total",
      args: {
        output_type: "EXTRACTION",
        contract: { output_required: true, output_type: "EXTRACTION", delivery_destination: "CHAT", source_requirements: [], verification_requirements: [] }
      }
    };

    const buildRes = await executor.execute(buildStep, context);
    expect(buildRes.state).toBe("SUCCEEDED");

    const verifyStep: WorkflowV2Step = { id: "step_verify", operation: "VERIFY_OUTPUT", target: "OUTPUT", description: "Verify" };
    const verifyRes = await executor.execute(verifyStep, context);
    expect(verifyRes.state).toBe("SUCCEEDED");

    const deliverStep: WorkflowV2Step = { id: "step_deliver", operation: "DELIVER_OUTPUT", target: "OUTPUT", description: "Deliver" };
    const deliverRes = await executor.execute(deliverStep, context);
    expect(deliverRes.state).toBe("SUCCEEDED");

    const finalResult = context.getState().outputs.universal_execution_result;
    expect(finalResult).toBeDefined();
    expect(finalResult.status).toBe("COMPLETED");
    expect(finalResult.output_data.fields.customer).toBe("Rahul Shah");
    expect(finalResult.output_data.fields.total).toBe("₹4,250.00");
  });

  // TEST B — Comparison
  it("TEST B: Comparison compares two entities and returns explicit differences", async () => {
    const context = createContext({
      order_1001_raw: "Order #1001 Status: Processing Customer: John Total: ₹1,250 Items: 2",
      order_1002_raw: "Order #1002 Status: Complete Customer: Sarah Total: ₹2,100 Items: 3"
    });

    const buildStep: WorkflowV2Step = {
      id: "step_build",
      operation: "BUILD_OUTPUT",
      target: "OUTPUT",
      description: "Compare orders",
      args: {
        output_type: "COMPARISON",
        contract: { output_required: true, output_type: "COMPARISON", delivery_destination: "CHAT", source_requirements: [], verification_requirements: [] }
      }
    };

    const buildRes = await executor.execute(buildStep, context);
    expect(buildRes.state).toBe("SUCCEEDED");

    const verifyStep: WorkflowV2Step = { id: "step_verify", operation: "VERIFY_OUTPUT", target: "OUTPUT", description: "Verify" };
    const verifyRes = await executor.execute(verifyStep, context);
    expect(verifyRes.state).toBe("SUCCEEDED");

    const deliverStep: WorkflowV2Step = { id: "step_deliver", operation: "DELIVER_OUTPUT", target: "OUTPUT", description: "Deliver" };
    await executor.execute(deliverStep, context);

    const finalResult = context.getState().outputs.universal_execution_result;
    expect(finalResult.status).toBe("COMPLETED");
    const comp = finalResult.output_data;
    expect(comp.entities.length).toBe(2);
    expect(comp.differences.length).toBeGreaterThan(0);
    expect(comp.differences.some((d: string) => d.includes("Status differs"))).toBe(true);
    expect(comp.differences.some((d: string) => d.includes("higher"))).toBe(true);
  });

  // TEST C — Calculation
  it("TEST C: Calculation computes combined total with arithmetic verification", async () => {
    const context = createContext({
      refund_1: "1250",
      refund_2: "2100",
      refund_3: "850"
    });

    const buildStep: WorkflowV2Step = {
      id: "step_build",
      operation: "BUILD_OUTPUT",
      target: "OUTPUT",
      description: "Calculate total eligible refunds",
      args: {
        output_type: "CALCULATION",
        contract: { output_required: true, output_type: "CALCULATION", delivery_destination: "CHAT", source_requirements: [], verification_requirements: [] }
      }
    };

    await executor.execute(buildStep, context);
    const verifyStep: WorkflowV2Step = { id: "step_verify", operation: "VERIFY_OUTPUT", target: "OUTPUT", description: "Verify" };
    const verifyRes = await executor.execute(verifyStep, context);
    expect(verifyRes.state).toBe("SUCCEEDED");

    const deliverStep: WorkflowV2Step = { id: "step_deliver", operation: "DELIVER_OUTPUT", target: "OUTPUT", description: "Deliver" };
    await executor.execute(deliverStep, context);

    const finalResult = context.getState().outputs.universal_execution_result;
    expect(finalResult.output_data.result).toBe(4200);
    expect(finalResult.output_data.count).toBe(3);
    expect(finalResult.output_verification.verified).toBe(true);
  });

  // TEST D — Classification
  it("TEST D: Classification labels all entities with explicit reason", async () => {
    const context = createContext({
      order_1: "Order #1001 Status: Complete Total: $250.00 Customer: Alice",
      order_2: "Order #1002 Status: Suspected Fraud Total: $2500.00 Customer: Bob",
      order_3: "Order #1003 Status: On Hold Total: $450.00 Customer: Charlie"
    });

    const buildStep: WorkflowV2Step = {
      id: "step_build",
      operation: "BUILD_OUTPUT",
      target: "OUTPUT",
      description: "Classify orders",
      args: {
        output_type: "CLASSIFICATION",
        contract: { output_required: true, output_type: "CLASSIFICATION", delivery_destination: "CHAT", source_requirements: [], verification_requirements: [] }
      }
    };

    await executor.execute(buildStep, context);
    const verifyStep: WorkflowV2Step = { id: "step_verify", operation: "VERIFY_OUTPUT", target: "OUTPUT", description: "Verify" };
    expect((await executor.execute(verifyStep, context)).state).toBe("SUCCEEDED");

    await executor.execute({ id: "step_deliver", operation: "DELIVER_OUTPUT", target: "OUTPUT", description: "Deliver" }, context);

    const finalResult = context.getState().outputs.universal_execution_result;
    const classifications = finalResult.output_data.classifications;
    expect(classifications.length).toBe(3);
    expect(classifications.find((c: any) => c.entity.includes("1001")).classification).toBe("NORMAL");
    expect(classifications.find((c: any) => c.entity.includes("1002")).classification).toBe("EXCEPTION");
    expect(classifications.find((c: any) => c.entity.includes("1003")).classification).toBe("NEEDS_HUMAN");
  });

  // TEST E — Summary
  it("TEST E: Summary synthesizes concise overview and metrics", async () => {
    const context = createContext({
      order_1: "Order #1001 Status: Complete Total: $120.00",
      order_2: "Order #1002 Status: Processing Total: $240.00"
    });

    const buildStep: WorkflowV2Step = {
      id: "step_build",
      operation: "BUILD_OUTPUT",
      target: "OUTPUT",
      description: "Summarize orders",
      args: {
        output_type: "SUMMARY",
        contract: { output_required: true, output_type: "SUMMARY", delivery_destination: "CHAT", source_requirements: [], verification_requirements: [] }
      }
    };

    await executor.execute(buildStep, context);
    await executor.execute({ id: "step_verify", operation: "VERIFY_OUTPUT", target: "OUTPUT", description: "Verify" }, context);
    await executor.execute({ id: "step_deliver", operation: "DELIVER_OUTPUT", target: "OUTPUT", description: "Deliver" }, context);

    const finalResult = context.getState().outputs.universal_execution_result;
    expect(finalResult.output_data.overview).toContain("Reviewed 2 records");
    expect(finalResult.output_data.key_points.length).toBeGreaterThan(0);
  });

  // TEST F — Text Generation
  it("TEST F: Generation produces actual email content", async () => {
    const context = createContext({
      order_1: "Order #1001 Status: Processing Total: $150.00 Customer: John Doe"
    });

    const buildStep: WorkflowV2Step = {
      id: "step_build",
      operation: "BUILD_OUTPUT",
      target: "OUTPUT",
      description: "Generate email",
      args: {
        output_type: "GENERATED_TEXT",
        contract: { output_required: true, output_type: "GENERATED_TEXT", delivery_destination: "CHAT", source_requirements: [], verification_requirements: [] }
      }
    };

    await executor.execute(buildStep, context);
    await executor.execute({ id: "step_verify", operation: "VERIFY_OUTPUT", target: "OUTPUT", description: "Verify" }, context);
    await executor.execute({ id: "step_deliver", operation: "DELIVER_OUTPUT", target: "OUTPUT", description: "Deliver" }, context);

    const finalResult = context.getState().outputs.universal_execution_result;
    expect(finalResult.output_data.messages[0].subject).toContain("Order #1001");
    expect(finalResult.output_data.messages[0].body).toContain("Dear John Doe");
  });

  // TEST G — File Generation / Report
  it("TEST G: Report produces structured columns and rows", async () => {
    const context = createContext({
      order_1: "Order #1001 Status: Complete Customer: Sarah Total: $450.00",
      order_2: "Order #1002 Status: Pending Customer: Mike Total: $620.00"
    });

    const buildStep: WorkflowV2Step = {
      id: "step_build",
      operation: "BUILD_OUTPUT",
      target: "OUTPUT",
      description: "Create report",
      args: {
        output_type: "GENERATED_REPORT",
        contract: { output_required: true, output_type: "GENERATED_REPORT", delivery_destination: "FILE", source_requirements: [], verification_requirements: [] }
      }
    };

    await executor.execute(buildStep, context);
    await executor.execute({ id: "step_verify", operation: "VERIFY_OUTPUT", target: "OUTPUT", description: "Verify" }, context);
    await executor.execute({ id: "step_deliver", operation: "DELIVER_OUTPUT", target: "OUTPUT", description: "Deliver" }, context);

    const finalResult = context.getState().outputs.universal_execution_result;
    expect(finalResult.output_data.columns).toEqual(["Entity", "Status", "Customer", "Total", "Items"]);
    expect(finalResult.output_data.record_count).toBe(2);
  });

  // TEST H — Multi-output
  it("TEST H: Multi-output produces and tracks all requested deliverables", async () => {
    const context = createContext({
      order_1: "Order #1001 Status: Processing Customer: Alice Total: $1,200.00",
      order_2: "Order #1002 Status: Complete Customer: Bob Total: $2,400.00"
    });

    const buildStep: WorkflowV2Step = {
      id: "step_build",
      operation: "BUILD_OUTPUT",
      target: "OUTPUT",
      description: "Compare, classify, calculate and summarize",
      args: {
        contract: {
          output_required: true,
          output_type: "COMPARISON",
          output_types: ["COMPARISON", "CALCULATION", "CLASSIFICATION", "SUMMARY"],
          delivery_destination: "CHAT",
          source_requirements: [],
          verification_requirements: []
        }
      }
    };

    await executor.execute(buildStep, context);
    await executor.execute({ id: "step_verify", operation: "VERIFY_OUTPUT", target: "OUTPUT", description: "Verify" }, context);
    await executor.execute({ id: "step_deliver", operation: "DELIVER_OUTPUT", target: "OUTPUT", description: "Deliver" }, context);

    const finalResult = context.getState().outputs.universal_execution_result;
    expect(finalResult.output_data.comparison).toBeDefined();
    expect(finalResult.output_data.calculation).toBeDefined();
    expect(finalResult.output_data.classification).toBeDefined();
    expect(finalResult.output_data.summary).toBeDefined();
  });

  // TEST I — Failure Mode: Action Success != Task Success
  it("TEST I: Verification fails if output generation failed or empty", async () => {
    // Empty context: no observations gathered
    const context = createContext({});

    const buildStep: WorkflowV2Step = {
      id: "step_build",
      operation: "BUILD_OUTPUT",
      target: "OUTPUT",
      description: "Compare orders without observations",
      args: {
        output_type: "COMPARISON",
        contract: { output_required: true, output_type: "COMPARISON", delivery_destination: "CHAT", source_requirements: [], verification_requirements: [] }
      }
    };

    await executor.execute(buildStep, context);

    const verifyStep: WorkflowV2Step = { id: "step_verify", operation: "VERIFY_OUTPUT", target: "OUTPUT", description: "Verify" };
    const verifyRes = await executor.execute(verifyStep, context);

    // MUST FAIL VERIFICATION!
    expect(verifyRes.state).toBe("FAILED");
    expect(verifyRes.message).toContain("OUTPUT_VERIFICATION_FAILED");
  });

  // TEST J — Missing Data: Truthful incomplete reporting
  it("TEST J: Missing required evidence is explicitly reported", async () => {
    const context = createContext({
      order_1: "Order #1001 Status: Complete"
      // Note: Only 1 order provided for comparison
    });

    const buildStep: WorkflowV2Step = {
      id: "step_build",
      operation: "BUILD_OUTPUT",
      target: "OUTPUT",
      description: "Compare orders",
      args: {
        output_type: "COMPARISON",
        contract: { output_required: true, output_type: "COMPARISON", delivery_destination: "CHAT", source_requirements: [], verification_requirements: [] }
      }
    };

    await executor.execute(buildStep, context);
    const verifyStep: WorkflowV2Step = { id: "step_verify", operation: "VERIFY_OUTPUT", target: "OUTPUT", description: "Verify" };
    const verifyRes = await executor.execute(verifyStep, context);

    expect(verifyRes.state).toBe("FAILED");
    expect(verifyRes.message).toContain("Comparison requires at least 2 entities");
  });

  // TEST K — Multi-Language Detection & Translation
  it("TEST K: Multi-Language Normalization translates foreign text to English", () => {
    // Polish
    const plTrans = translateToEnglish("Zamówienia w trakcie realizacji - łączna kwota: 1250 zł");
    expect(plTrans.detectedLanguage).toBe("pl");
    expect(plTrans.translated).toContain("Orders");
    expect(plTrans.translated).toContain("Processing");
    expect(plTrans.translated).toContain("Grand Total");

    // German
    const deTrans = translateToEnglish("Bestellungen in bearbeitung - gesamtbetrag: 2100 €");
    expect(deTrans.detectedLanguage).toBe("de");
    expect(deTrans.translated).toContain("Orders");
    expect(deTrans.translated).toContain("Processing");
    expect(deTrans.translated).toContain("Grand Total");

    // French
    const frTrans = translateToEnglish("Commandes en cours - montant total: 850 €");
    expect(frTrans.detectedLanguage).toBe("fr");
    expect(frTrans.translated).toContain("Orders");
    expect(frTrans.translated).toContain("Processing");
    expect(frTrans.translated).toContain("Grand Total");

    // Multi-lingual synonyms generator for locators
    const orderSyns = getMultiLingualSynonyms("orders");
    expect(orderSyns).toContain("zamówienia");
    expect(orderSyns).toContain("bestellungen");
    expect(orderSyns).toContain("commandes");
    expect(orderSyns).toContain("pedidos");
  });

  // TEST L — Dynamic Non-Hardcoded Arbitrary Entities and Mathematical Difference
  it("TEST L: Arbitrary entity comparison calculates genuine differences without mocks", async () => {
    const context = createContext({
      order_8820: "Order #8820 Status: Processing Customer: Carlos Total: $450.00 Items: 1",
      order_9940: "Order #9940 Status: Complete Customer: Diana Total: $1,250.00 Items: 5"
    });

    const buildStep: WorkflowV2Step = {
      id: "step_build",
      operation: "BUILD_OUTPUT",
      target: "OUTPUT",
      description: "Compare arbitrary orders",
      args: {
        output_type: "COMPARISON",
        contract: { output_required: true, output_type: "COMPARISON", delivery_destination: "CHAT", source_requirements: [], verification_requirements: [] }
      }
    };

    await executor.execute(buildStep, context);
    await executor.execute({ id: "step_verify", operation: "VERIFY_OUTPUT", target: "OUTPUT", description: "Verify" }, context);
    await executor.execute({ id: "step_deliver", operation: "DELIVER_OUTPUT", target: "OUTPUT", description: "Deliver" }, context);

    const finalResult = context.getState().outputs.universal_execution_result;
    expect(finalResult.status).toBe("COMPLETED");
    const comp = finalResult.output_data;
    expect(comp.entities[0].name).toBe("Order #8820");
    expect(comp.entities[1].name).toBe("Order #9940");
    expect(comp.differences.some((d: string) => d.includes("Order #9940 is $800.00 higher than Order #8820"))).toBe(true);
    expect(comp.differences.some((d: string) => d.includes("Order #9940 has 4 additional items"))).toBe(true);
    expect(comp.differences.some((d: string) => d.includes("Customer differs (Order #8820: Carlos vs Order #9940: Diana)"))).toBe(true);
    expect(comp.differences.some((d: string) => d.includes("Status differs (Order #8820: Processing vs Order #9940: Complete)"))).toBe(true);
  });

  // TEST M — Universal Connector / Non-Browser Structured Input (API / Spreadsheet / DB)
  it("TEST M: Universal Connector works seamlessly with structured objects from APIs or Spreadsheets", async () => {
    const context = createContext({
      record_1: { name: "Invoice #INV-201", customer: "Acme Corp", total: "€5,000.00", status: "Paid", items: "10" },
      record_2: { name: "Invoice #INV-202", customer: "Beta Global", total: "€7,500.00", status: "Pending", items: "15" }
    });

    const buildStep: WorkflowV2Step = {
      id: "step_build",
      operation: "BUILD_OUTPUT",
      target: "OUTPUT",
      description: "Compare API invoice records",
      args: {
        output_type: "COMPARISON",
        contract: { output_required: true, output_type: "COMPARISON", delivery_destination: "CHAT", source_requirements: [], verification_requirements: [] }
      }
    };

    await executor.execute(buildStep, context);
    const verifyRes = await executor.execute({ id: "step_verify", operation: "VERIFY_OUTPUT", target: "OUTPUT", description: "Verify" }, context);
    expect(verifyRes.state).toBe("SUCCEEDED");

    await executor.execute({ id: "step_deliver", operation: "DELIVER_OUTPUT", target: "OUTPUT", description: "Deliver" }, context);
    const finalResult = context.getState().outputs.universal_execution_result;
    expect(finalResult.output_data.entities[0].name).toBe("Invoice #INV-201");
    expect(finalResult.output_data.entities[1].name).toBe("Invoice #INV-202");
    expect(finalResult.output_data.differences.some((d: string) => d.includes("higher"))).toBe(true);
  });

  // TEST N — Polish Foreign Language Entity Extraction & Comparison
  it("TEST N: Polish order text is normalized to English and compared properly", async () => {
    const context = createContext({
      order_pl: "Zamówienie #3001 Stan: W trakcie realizacji Klient: Tomasz Razem: 1500 zł Pozycje: 2",
      order_en: "Order #3002 Status: Complete Customer: Emily Total: $3,000.00 Items: 4"
    });

    const buildStep: WorkflowV2Step = {
      id: "step_build",
      operation: "BUILD_OUTPUT",
      target: "OUTPUT",
      description: "Compare multi-lingual orders",
      args: {
        output_type: "COMPARISON",
        contract: { output_required: true, output_type: "COMPARISON", delivery_destination: "CHAT", source_requirements: [], verification_requirements: [] }
      }
    };

    await executor.execute(buildStep, context);
    await executor.execute({ id: "step_verify", operation: "VERIFY_OUTPUT", target: "OUTPUT", description: "Verify" }, context);
    await executor.execute({ id: "step_deliver", operation: "DELIVER_OUTPUT", target: "OUTPUT", description: "Deliver" }, context);

    const finalResult = context.getState().outputs.universal_execution_result;
    expect(finalResult.status).toBe("COMPLETED");
    expect(finalResult.translated_to_english).toBe(true);
    expect(finalResult.output_data.entities[0].name).toBe("Order #3001");
    expect(finalResult.output_data.entities[1].name).toBe("Order #3002");
  });
});
