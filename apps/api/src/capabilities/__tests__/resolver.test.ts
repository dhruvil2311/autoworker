import { describe, it, expect, vi } from "vitest";
import { CapabilityResolver } from "../resolver.js";
import { CapabilityRegistry, CapabilityRegistryEntry } from "../registry.js";
import { SemanticOperation } from "@ghost/workflow-schema";
import { AuthContext } from "@ghost/shared-types";

describe("CapabilityResolver", () => {
  const mockAuth: AuthContext = {
    userId: "test-user-id",
    tenantId: "test-tenant-id",
    role: "owner"
  };

  const mockRegistry = {
    findCapabilities: vi.fn(),
    registerCapability: vi.fn(),
    verifyCapability: vi.fn()
  } as unknown as CapabilityRegistry;

  it("resolves desktop bindings when operation targets desktop entity (e.g. Tally or Excel)", async () => {
    vi.mocked(mockRegistry.findCapabilities).mockResolvedValueOnce([]);

    const resolver = new CapabilityResolver(mockRegistry);
    const operation: SemanticOperation = {
      id: "CREATE_RECORD",
      entity: "Tally",
      inputs: { customer: "Acme Corp", amount: 500 },
      outputs: {},
      sideEffect: "MUTATION",
      risk: "MEDIUM"
    };

    const chain = await resolver.resolve(mockAuth, operation);
    expect(chain.length).toBeGreaterThan(0);
    const desktopBinding = chain.find(b => b.providerType === "DESKTOP");
    expect(desktopBinding).toBeDefined();
    expect(desktopBinding?.capabilityId).toBe("desktop-tally");
  });

  it("resolves registered verified candidates in preferred order", async () => {
    const verifiedCandidates: CapabilityRegistryEntry[] = [
      {
        id: "cap-desktop-1",
        tenantId: "test-tenant-id",
        semanticOperation: "SEARCH_RECORD",
        entityType: "Customer",
        executionType: "DESKTOP",
        providerType: "DESKTOP_UI",
        inputSchema: {},
        outputSchema: {},
        sideEffect: "READ",
        riskLevel: "LOW",
        verificationStatus: "VERIFIED",
        confidence: 0.95,
        metadata: { application: "ERP" }
      },
      {
        id: "cap-api-1",
        tenantId: "test-tenant-id",
        semanticOperation: "SEARCH_RECORD",
        entityType: "Customer",
        executionType: "API",
        providerType: "REST",
        connectionId: "conn-1",
        inputSchema: {},
        outputSchema: {},
        sideEffect: "READ",
        riskLevel: "LOW",
        verificationStatus: "VERIFIED",
        confidence: 0.99,
        metadata: {}
      }
    ];

    vi.mocked(mockRegistry.findCapabilities).mockResolvedValueOnce(verifiedCandidates);

    // Prefer DESKTOP first
    const resolver = new CapabilityResolver(mockRegistry, {
      preferredOrder: ["DESKTOP", "API", "MCP", "HUMAN"]
    });

    const operation: SemanticOperation = {
      id: "SEARCH_RECORD",
      entity: "Customer",
      inputs: { name: "Alice" },
      outputs: {},
      sideEffect: "READ",
      risk: "LOW"
    };

    const chain = await resolver.resolve(mockAuth, operation);
    expect(chain[0]!.providerType).toBe("DESKTOP");
    expect(chain[0]!.capabilityId).toBe("cap-desktop-1");
    expect(chain[1]!.providerType).toBe("API");
    expect(chain[1]!.capabilityId).toBe("cap-api-1");
  });

  it("routes critical risk operations to human verification in the chain", async () => {
    vi.mocked(mockRegistry.findCapabilities).mockResolvedValueOnce([]);

    const resolver = new CapabilityResolver(mockRegistry);
    const criticalOperation: SemanticOperation = {
      id: "DELETE_RECORD",
      entity: "FinancialLedger",
      inputs: { accountId: "12345" },
      outputs: {},
      sideEffect: "MUTATION",
      risk: "CRITICAL"
    };

    const chain = await resolver.resolve(mockAuth, criticalOperation);
    const humanBinding = chain.find(b => b.providerType === "HUMAN");
    expect(humanBinding).toBeDefined();
    expect(humanBinding?.metadata?.reason).toBe("CRITICAL_RISK_POLICY");
  });
});
