import { CapabilityRegistry, CapabilityRegistryEntry } from "./registry.js";
import { AuthContext } from "@ghost/shared-types";
import { SemanticOperation, CapabilityBinding, ExecutionProviderType } from "@ghost/workflow-schema";
import { logger } from "@ghost/observability";

export type CapabilityPriority = 
  | "API" 
  | "MCP" 
  | "BROWSER_DETERMINISTIC" 
  | "BROWSER_SEMANTIC" 
  | "DESKTOP" 
  | "DESKTOP_COMPUTER" 
  | "HUMAN";

export interface CapabilityResolverOptions {
  preferredOrder?: CapabilityPriority[];
  desktopFallbackEnabled?: boolean;
}

const DEFAULT_PREFERRED_ORDER: CapabilityPriority[] = [
  "API",
  "MCP",
  "BROWSER_DETERMINISTIC",
  "BROWSER_SEMANTIC",
  "DESKTOP",
  "HUMAN"
];

const KNOWN_DESKTOP_ENTITIES = new Set([
  "excel",
  "tally",
  "sap",
  "erp",
  "outlook",
  "file_explorer",
  "desktop_app"
]);

export class CapabilityResolver {
  private defaultOrder: CapabilityPriority[];

  constructor(
    private registry: CapabilityRegistry,
    options?: CapabilityResolverOptions
  ) {
    this.defaultOrder = options?.preferredOrder ?? DEFAULT_PREFERRED_ORDER;
  }

  /**
   * Resolves a semantic operation into an ordered fallback chain of execution bindings.
   * Configurable hierarchy, defaults to: API -> MCP -> BROWSER -> DESKTOP -> HUMAN
   */
  async resolve(
    auth: AuthContext, 
    operation: SemanticOperation, 
    options?: CapabilityResolverOptions
  ): Promise<CapabilityBinding[]> {
    logger.debug({ operationId: operation.id, entity: operation.entity }, "Resolving capabilities");
    
    const candidates = await this.registry.findCapabilities(auth, operation.id, operation.entity);
    
    // Filter out rejected or unverified capabilities for safe execution
    const validCandidates = candidates.filter(c => c.verificationStatus === "VERIFIED");
    
    const order = options?.preferredOrder ?? this.defaultOrder;
    const chain: CapabilityBinding[] = [];

    const isDesktopEntity = KNOWN_DESKTOP_ENTITIES.has(operation.entity.toLowerCase()) ||
      Boolean(operation.inputs?.application || operation.inputs?.desktop_app);

    for (const capabilityType of order) {
      switch (capabilityType) {
        case "API": {
          const apiCandidates = validCandidates.filter(c => c.executionType === "API");
          for (const c of apiCandidates) {
            chain.push({
              capabilityId: c.id,
              providerType: "API",
              ...(c.connectionId ? { connectionId: c.connectionId } : {})
            });
          }
          break;
        }
        case "MCP": {
          const mcpCandidates = validCandidates.filter(c => c.executionType === "MCP");
          for (const c of mcpCandidates) {
            chain.push({
              capabilityId: c.id,
              providerType: "MCP",
              ...(c.connectionId ? { connectionId: c.connectionId } : {})
            });
          }
          break;
        }
        case "BROWSER_DETERMINISTIC": {
          const browserCandidates = validCandidates.filter(c => c.executionType === "BROWSER_DETERMINISTIC");
          for (const c of browserCandidates) {
            chain.push({
              capabilityId: c.id,
              providerType: "BROWSER_DETERMINISTIC"
            });
          }
          break;
        }
        case "BROWSER_SEMANTIC": {
          // If not specifically a desktop entity and browser is in the priority list, provide browser fallback
          if (!isDesktopEntity) {
            chain.push({
              capabilityId: "fallback-browser-semantic",
              providerType: "BROWSER_SEMANTIC"
            });
          }
          break;
        }
        case "DESKTOP":
        case "DESKTOP_COMPUTER": {
          const desktopCandidates = validCandidates.filter(
            c => c.executionType === "DESKTOP" || c.executionType === "DESKTOP_COMPUTER"
          );
          for (const c of desktopCandidates) {
            chain.push({
              capabilityId: c.id,
              providerType: "DESKTOP",
              ...(c.metadata ? { metadata: c.metadata } : {})
            });
          }

          // If operation targets desktop software and no specific candidate was verified, add desktop fallback binding
          if (desktopCandidates.length === 0 && (isDesktopEntity || options?.desktopFallbackEnabled)) {
            chain.push({
              capabilityId: `desktop-${operation.entity.toLowerCase()}`,
              providerType: "DESKTOP",
              metadata: {
                application: operation.inputs?.application || operation.entity,
                targetStrategy: "UIA"
              }
            });
          }
          break;
        }
        case "HUMAN": {
          // For high/critical risk or as ultimate fallback
          if (operation.risk === "CRITICAL" || chain.length === 0) {
            chain.push({
              capabilityId: "human-intervention-required",
              providerType: "HUMAN",
              metadata: {
                reason: operation.risk === "CRITICAL" ? "CRITICAL_RISK_POLICY" : "NO_CAPABILITY_AVAILABLE"
              }
            });
          }
          break;
        }
      }
    }

    // Ensure at least one fallback exists
    if (chain.length === 0) {
      chain.push({
        capabilityId: "human-fallback",
        providerType: "HUMAN",
        metadata: { reason: "UNRESOLVABLE_OPERATION" }
      });
    }
    
    logger.info({ operationId: operation.id, chainLength: chain.length }, "Resolved capability chain");

    return chain;
  }
}

