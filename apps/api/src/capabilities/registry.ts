import { AppStore } from "../store.js";
import { AuthContext } from "@ghost/shared-types";
import { SemanticOperation, ExecutionProviderType, VerificationStatus, SideEffectClassification, RiskLevel } from "@ghost/workflow-schema";

export interface CapabilityRegistryEntry {
  id: string;
  tenantId: string;
  connectionId?: string;
  semanticOperation: string;
  entityType: string;
  executionType: ExecutionProviderType;
  providerType: string;
  inputSchema: any;
  outputSchema: any;
  sideEffect: SideEffectClassification;
  riskLevel: RiskLevel;
  verificationStatus: VerificationStatus;
  confidence: number;
  metadata: Record<string, any>;
}

export class CapabilityRegistry {
  constructor(private store: AppStore) {}

  async registerCapability(auth: AuthContext, capability: Omit<CapabilityRegistryEntry, "id" | "tenantId">): Promise<CapabilityRegistryEntry> {
    // In a real implementation, we'd add this to AppStore interfaces and query Supabase.
    // For now, we mock the method signature.
    return {
      id: crypto.randomUUID(),
      tenantId: auth.tenantId,
      ...capability
    };
  }

  async findCapabilities(auth: AuthContext, semanticOperation: string, entityType: string): Promise<CapabilityRegistryEntry[]> {
    // Mock implementation for finding capabilities. We would query capability_registry here.
    return [];
  }

  async verifyCapability(auth: AuthContext, id: string): Promise<void> {
    // Updates verification_status to VERIFIED
  }
}
