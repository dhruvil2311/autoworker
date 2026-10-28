import { describe, it, expect, vi } from "vitest";
import { WorkflowCompiler } from "../src/compiler.js";
import { ExecutionPlanner } from "../src/planner/planner.js";
import { CapabilityResolver } from "../src/capabilities/resolver.js";
import { CapabilityRegistry } from "../src/capabilities/registry.js";
import { InMemoryStore } from "../src/store.js";
import { BusinessProcessSpecification } from "@ghost/bpi";

const mockBPS: BusinessProcessSpecification = {
  id: "bps-boundary",
  status: "APPROVED",
  identity: { name: "Inventory Sync", persona: "Stock Manager", core_system: "Shopify" },
  intent: "Update inventory",
  systems: ["shopify.com"],
  dataFlow: [],
  transformations: [],
  metrics: [],
  variables: {},
  unresolvedGaps: []
};

describe("Architecture Boundary Verification", () => {
  it("generates different ExecutablePlans from the same BPS depending on capabilities", async () => {
    const store = new InMemoryStore();
    const registry = new CapabilityRegistry(store);
    const resolver = new CapabilityResolver(registry);
    const planner = new ExecutionPlanner(resolver);
    const compiler = new WorkflowCompiler({} as any);

    const auth = { userId: "user-1", tenantId: "tenant-1", roles: ["admin"] };

    // SCENARIO 1: MCP capability available
    vi.spyOn(registry, "findCapabilities").mockResolvedValueOnce([
      {
        id: "cap-mcp-1", tenantId: "tenant-1", semanticOperation: "UPDATE_RECORD",
        entityType: "inventory", executionType: "MCP", providerType: "official",
        verificationStatus: "VERIFIED", inputSchema: {}, outputSchema: {},
        sideEffect: "MUTATION", riskLevel: "MEDIUM", confidence: 0.99, metadata: {}
      }
    ]);

    const plan1 = await planner.plan(auth, mockBPS);
    const wf1 = await compiler.compile(mockBPS, { version: "3.5" }, plan1);
    
    expect(plan1.bpsId).toBe("bps-boundary");
    expect(wf1.root_step.children![0].target).toBe("MCP");

    // SCENARIO 2: Only Browser available
    vi.spyOn(registry, "findCapabilities").mockResolvedValueOnce([
      {
        id: "cap-browser-1", tenantId: "tenant-1", semanticOperation: "UPDATE_RECORD",
        entityType: "inventory", executionType: "BROWSER_DETERMINISTIC", providerType: "official",
        verificationStatus: "VERIFIED", inputSchema: {}, outputSchema: {},
        sideEffect: "MUTATION", riskLevel: "MEDIUM", confidence: 0.8, metadata: {}
      }
    ]);

    const plan2 = await planner.plan(auth, mockBPS);
    const wf2 = await compiler.compile(mockBPS, { version: "3.5" }, plan2);

    expect(plan2.bpsId).toBe("bps-boundary");
    expect(wf2.root_step.children![0].target).toBe("BROWSER_DETERMINISTIC");

    // Proof that BPS did not change but bound DSL changed
    expect(wf1.root_step.children![0].target).not.toBe(wf2.root_step.children![0].target);
  });
});
