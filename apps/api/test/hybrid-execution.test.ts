import { describe, it, expect, vi, beforeEach } from "vitest";
import { WorkflowCompiler } from "../src/compiler.js";
import { ExecutionPlanner } from "../src/planner/planner.js";
import { CapabilityResolver } from "../src/capabilities/resolver.js";
import { CapabilityRegistry } from "../src/capabilities/registry.js";
import { InMemoryStore } from "../src/store.js";
import { BusinessProcessSpecification } from "@ghost/bpi";

// Mock BPS representing an intent to update inventory
const mockBPS: BusinessProcessSpecification = {
  id: "bps-123",
  status: "APPROVED",
  identity: { name: "Inventory Sync", persona: "Stock Manager", core_system: "Shopify" },
  intent: "Update inventory for recent shipments",
  systems: ["shopify.com"],
  dataFlow: [],
  transformations: [],
  metrics: [],
  variables: {},
  unresolvedGaps: []
};

describe("Phase 3.5 Hybrid Execution Planning", () => {
  let store: InMemoryStore;
  let registry: CapabilityRegistry;
  let resolver: CapabilityResolver;
  let planner: ExecutionPlanner;
  let compiler: WorkflowCompiler;

  beforeEach(() => {
    store = new InMemoryStore();
    registry = new CapabilityRegistry(store);
    resolver = new CapabilityResolver(registry);
    planner = new ExecutionPlanner(resolver);
    compiler = new WorkflowCompiler({} as any);

    // Mock the registry to return an MCP capability for UPDATE_RECORD on inventory
    vi.spyOn(registry, "findCapabilities").mockResolvedValue([
      {
        id: "cap-mcp-1",
        tenantId: "tenant-1",
        semanticOperation: "UPDATE_RECORD",
        entityType: "inventory",
        executionType: "MCP",
        providerType: "official",
        verificationStatus: "VERIFIED",
        inputSchema: {},
        outputSchema: {},
        sideEffect: "MUTATION",
        riskLevel: "MEDIUM",
        confidence: 0.99,
        metadata: {}
      },
      {
        id: "cap-browser-1",
        tenantId: "tenant-1",
        semanticOperation: "UPDATE_RECORD",
        entityType: "inventory",
        executionType: "BROWSER_DETERMINISTIC",
        providerType: "official",
        verificationStatus: "VERIFIED",
        inputSchema: {},
        outputSchema: {},
        sideEffect: "MUTATION",
        riskLevel: "MEDIUM",
        confidence: 0.8,
        metadata: {}
      }
    ]);
  });

  it("should resolve capabilities in the correct fallback hierarchy (MCP > BROWSER)", async () => {
    const auth = { userId: "user-1", tenantId: "tenant-1", roles: ["admin"] };
    
    // 1. Planner generates ExecutablePlan
    const plan = await planner.plan(auth, mockBPS);
    
    expect(plan.steps.length).toBe(1);
    expect(plan.steps[0].semanticOperationId).toBe("UPDATE_RECORD");
    
    // Fallback chain should be MCP -> BROWSER_DETERMINISTIC -> BROWSER_SEMANTIC
    const chain = plan.steps[0].fallbackChain;
    expect(chain[0].providerType).toBe("MCP");
    expect(chain[1].providerType).toBe("BROWSER_DETERMINISTIC");
    expect(chain[2].providerType).toBe("BROWSER_SEMANTIC");

    // 2. Compiler turns ExecutablePlan into WorkflowV2
    const workflow = await compiler.compile(mockBPS, { version: "3.5" }, plan);
    
    expect(workflow.root_step.operation).toBe("SEQUENCE");
    const executionStep = workflow.root_step.children![0];
    
    // Primary execution target should be MCP
    expect(executionStep.target).toBe("MCP");
    expect(executionStep.operation).toBe("CALL_MCP");
    expect(executionStep.args!.capabilityId).toBe("cap-mcp-1");
    
    // Fallbacks are packed into args
    expect(executionStep.args!.fallbackChain.length).toBe(2);
    expect(executionStep.args!.fallbackChain[0].capabilityId).toBe("cap-browser-1");
    
    // Failure policy is set to RUN_FALLBACK
    expect(executionStep.failure_policy!.on_failure).toBe("RUN_FALLBACK");
  });
});
