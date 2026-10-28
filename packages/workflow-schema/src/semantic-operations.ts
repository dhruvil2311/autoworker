export type SemanticOperationType = 
  | "LIST_RECORDS"
  | "GET_RECORD"
  | "SEARCH_RECORD"
  | "CREATE_RECORD"
  | "UPDATE_RECORD"
  | "DELETE_RECORD"
  | "MATCH_ENTITY"
  | "EXTRACT_DATA"
  | "TRANSFORM_DATA"
  | "GENERATE_ARTIFACT"
  | "SEND_MESSAGE"
  | "UPLOAD_FILE"
  | "DOWNLOAD_FILE"
  | "APPROVE_ACTION"
  | "AUTHENTICATE"
  | "CUSTOM_OPERATION";

export type SideEffectClassification = "READ" | "MUTATION" | "UNCERTAIN";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface SemanticOperation {
  id: string; // e.g., UPDATE_RECORD
  entity: string; // e.g., InventoryItem
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  sideEffect: SideEffectClassification;
  risk: RiskLevel;
  postcondition?: string;
}

export type ExecutionProviderType = "MCP" | "API" | "PLATFORM_CONNECTOR" | "DATA" | "BROWSER_DETERMINISTIC" | "BROWSER_SEMANTIC" | "DESKTOP" | "DESKTOP_COMPUTER" | "HUMAN";
export type VerificationStatus = "DISCOVERED" | "PROPOSED" | "VERIFIED" | "REJECTED";

export interface CapabilityBinding {
  capabilityId: string;
  providerType: ExecutionProviderType;
  connectionId?: string;
  metadata?: Record<string, any>;
}

export interface SemanticOperationNode {
  nodeId: string;
  operation: SemanticOperation;
  selectedCapability?: CapabilityBinding;
  fallbackChain?: CapabilityBinding[];
}
