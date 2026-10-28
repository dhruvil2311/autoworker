import { describe, expect, it } from "vitest";
import { WorkflowCompiler } from "./compiler.js";
import type { BusinessProcessSpecification } from "@ghost/bpi";

describe("Workflow DSL V2 Compiler (Phase 2A)", () => {
  const mockAiProvider = { 
    generateWorkflowTree: async (intent: string) => {
      if (intent.includes("B2B")) {
        return { 
          id: "mock_root", operation: "SEQUENCE", target: "DATA", description: "Mock root", 
          children: [{ id: "mock_loop", operation: "FOR_EACH", target: "DATA", description: "Loop", args: { collection: "{{orders}}" } }] 
        };
      } else if (intent.includes("Report")) {
        return { 
          id: "mock_root", operation: "SEQUENCE", target: "DATA", description: "Mock root", 
          children: [{ id: "mock_trans", operation: "TRANSFORM", target: "DATA", description: "Transform", args: { formula: "Calculate net sales from sales.csv and returns.xlsx" } }] 
        };
      } else if (intent.includes("Validate fail")) {
        return { 
          id: "mock_root", operation: "SEQUENCE", target: "DATA", description: "Mock root", 
          children: [{ id: "mock_trans", operation: "TRANSFORM", target: "DATA", description: "Transform", args: { formula: "{{missing_var}}" } }] 
        };
      }
      return { id: "mock_root", operation: "SEQUENCE", target: "DATA", description: "Mock root" };
    } 
  } as any;
  const compiler = new WorkflowCompiler(mockAiProvider);
  const options = { version: "2.0.0" };

  it("Compiles B2B Specification to FOR_EACH structure", async () => {
    const spec: BusinessProcessSpecification = {
      id: "bps_b2b_1",
      version: "1.0",
      status: "READY_FOR_TEST_COMPILATION",
      identity: { process_id: "proc_1", name: "B2B Order Processing" },
      intent: "B2B order transfer",
      steps: [],
      systems: ["erp.com"],
      scope: "orders",
      entities: {},
      variables: {
        "var_1": { raw_value: "PO-777", is_sensitive: false, classification: { value: "RUNTIME_VARIABLE", confidence: 1, classification: "OBSERVED_FACT", evidence: [] } }
      },
      dataSources: [],
      dataFlow: [],
      matchingRules: [],
      businessRules: [],
      transformations: [],
      exceptionPolicies: [],
      safetyPolicies: [],
      successCriteria: [],
      assumptions: [],
      unresolvedGaps: [],
      confidence: 0.9
    };

    const workflow = await compiler.compile(spec, options);
    
    expect(workflow.workflow_version).toBe("2.0");
    expect(workflow.variables!.length).toBe(1);
    expect(workflow.variables![0]!.name).toBe("var_1");
    expect(workflow.variables![0]!.default_value).toBeUndefined(); // Runtime variable should not hardcode "PO-777"
    
    // Check root step compilation heuristic
    expect(workflow.root_step.operation).toBe("SEQUENCE");
    const loopStep = workflow.root_step.children?.find(c => c.operation === "FOR_EACH");
    expect(loopStep).toBeDefined();
    expect(loopStep?.args!.collection).toBe("{{orders}}");
  });

  it("Compiles Reporting Specification with DATA target", async () => {
    const spec: BusinessProcessSpecification = {
      id: "bps_report_1",
      version: "1.0",
      status: "READY_FOR_TEST_COMPILATION",
      identity: { process_id: "proc_2", name: "Reporting" },
      intent: "Report generation",
      steps: [],
      systems: [],
      scope: "",
      entities: {},
      variables: {},
      dataSources: [],
      dataFlow: [],
      matchingRules: [],
      businessRules: [],
      transformations: [
        { source_gap: "gap_var_3_transformation", description: "Calculate net sales from sales.csv and returns.xlsx", actor: "User" }
      ],
      exceptionPolicies: [],
      safetyPolicies: [],
      successCriteria: [],
      assumptions: [],
      unresolvedGaps: [],
      confidence: 0.9
    };

    const workflow = await compiler.compile(spec, options);
    const transformStep = workflow.root_step.children?.find(c => c.operation === "TRANSFORM");
    expect(transformStep).toBeDefined();
    expect(transformStep?.target).toBe("DATA"); // Not BROWSER_DETERMINISTIC
    expect(transformStep?.args!.formula).toBe("Calculate net sales from sales.csv and returns.xlsx");
  });

  it("Compiles Inventory Specification securely without hardcoding derived results", async () => {
    const spec: BusinessProcessSpecification = {
      id: "bps_inv",
      version: "1.0",
      status: "READY_FOR_TEST_COMPILATION",
      identity: { process_id: "proc_3", name: "Inventory" },
      intent: "Inventory update",
      steps: [],
      systems: [],
      scope: "",
      entities: {},
      variables: {
        "var_stock": { raw_value: "145", is_sensitive: false, classification: { value: "DERIVED_VALUE", confidence: 1, classification: "OBSERVED_FACT", evidence: [] } }
      },
      dataSources: [],
      dataFlow: [],
      matchingRules: [],
      businessRules: [],
      transformations: [],
      exceptionPolicies: [],
      safetyPolicies: [],
      successCriteria: [],
      assumptions: [],
      unresolvedGaps: [],
      confidence: 0.9
    };

    const workflow = await compiler.compile(spec, options);
    expect(workflow.variables![0]!.name).toBe("var_stock");
    expect(workflow.variables![0]!.default_value).toBeUndefined(); // Should not hardcode 145!
  });

  it("Validates variable scope and catches undefined references", async () => {
    const spec: BusinessProcessSpecification = {
      id: "bps_err",
      version: "1.0",
      status: "READY_FOR_TEST_COMPILATION",
      identity: { process_id: "proc_1", name: "Validate fail" },
      intent: "Validate fail",
      steps: [],
      systems: [],
      scope: "",
      entities: {},
      variables: {},
      dataSources: [],
      dataFlow: [],
      matchingRules: [],
      businessRules: [],
      transformations: [
        { source_gap: "gap_1", description: "Use undefined var {{unknown_var}}", actor: "User" }
      ],
      exceptionPolicies: [],
      safetyPolicies: [],
      successCriteria: [],
      assumptions: [],
      unresolvedGaps: [],
      confidence: 1
    };

    await expect(compiler.compile(spec, options)).rejects.toThrow("Unresolved variable reference 'missing_var'");
  });

  it("Rejects compilation if there are blocking gaps", async () => {
    const spec: BusinessProcessSpecification = {
      id: "bps_blocked",
      version: "1.0",
      status: "NEEDS_CLARIFICATION",
      identity: { process_id: "proc_1", name: "Test" },
      intent: "Test",
      steps: [],
      systems: [],
      scope: "",
      entities: {},
      variables: {},
      dataSources: [],
      dataFlow: [],
      matchingRules: [],
      businessRules: [],
      transformations: [],
      exceptionPolicies: [],
      safetyPolicies: [],
      successCriteria: [],
      assumptions: [],
      unresolvedGaps: [
         { gap_id: "gap_1", category: "SCOPE", description: "test", why_it_matters: "test", risk_level: "HIGH", blocking: true, supporting_evidence: [], discover_during_test: false }
      ],
      confidence: 1
    };

    await expect(compiler.compile(spec, options)).rejects.toThrow("Cannot compile specification bps_blocked: unresolved blocking gaps exist");
  });
});
