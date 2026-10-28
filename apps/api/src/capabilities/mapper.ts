import { logger } from "@ghost/observability";

export interface DiscoveredTool {
  name: string;
  description?: string;
  inputSchema?: any;
}

export interface SemanticMappingProposal {
  semanticOperation: string;
  entityType: string;
  confidence: number;
}

export class SemanticMapper {
  
  /**
   * Proposes semantic capabilities based on discovered MCP tools.
   * This uses basic heuristics (name matching). In a real implementation, 
   * this would leverage an LLM or complex schema alignment.
   */
  proposeMappings(tool: DiscoveredTool): SemanticMappingProposal[] {
    const proposals: SemanticMappingProposal[] = [];
    const lowerName = tool.name.toLowerCase();
    const lowerDesc = (tool.description || "").toLowerCase();

    // Basic heuristic: check for standard CRUD operations in the tool name
    let operation = "";
    if (lowerName.includes("process") || lowerName.includes("execute") || lowerName.includes("run")) {
      // Ambiguous verbs should not automatically be granted mutation capability
      operation = "UNKNOWN_OPERATION";
    } else if (lowerName.includes("create") || lowerName.includes("add") || lowerName.includes("insert")) {
      operation = "CREATE_RECORD";
    } else if (lowerName.includes("update") || lowerName.includes("edit") || lowerName.includes("modify")) {
      operation = "UPDATE_RECORD";
    } else if (lowerName.includes("delete") || lowerName.includes("remove")) {
      operation = "DELETE_RECORD";
    } else if (lowerName.includes("get") || lowerName.includes("fetch") || lowerName.includes("read")) {
      operation = "GET_RECORD";
    } else if (lowerName.includes("list") || lowerName.includes("search")) {
      operation = "LIST_RECORDS";
    }

    if (operation && operation !== "UNKNOWN_OPERATION") {
      // Very naive entity extraction - assume anything after the action word is the entity
      // E.g., "update_inventory" -> "inventory"
      const parts = lowerName.split("_");
      const entityType = (parts.length > 1 ? parts[1] : "UnknownEntity") ?? "UnknownEntity";
      
      proposals.push({
        semanticOperation: operation,
        entityType,
        confidence: 0.6 // Heuristic confidence
      });
      
      logger.info({ tool: tool.name, proposal: proposals[0] }, "Proposed semantic mapping");
    } else {
      logger.info({ tool: tool.name }, "Tool is ambiguous or unknown, skipped mapping");
    }

    return proposals;
  }
}
