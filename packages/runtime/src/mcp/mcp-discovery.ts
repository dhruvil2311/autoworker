import { MCPClient, MCPConnectionConfig } from "./mcp-client.js";
import { logger } from "@ghost/observability";

export class MCPDiscoveryService {
  constructor() {}

  async discoverTools(tenantId: string, connectionId: string, config: MCPConnectionConfig): Promise<void> {
    const client = new MCPClient(config, `discovery-${connectionId}`);
    
    try {
      await client.connect();
      const tools = await client.listTools();
      
      logger.info({ tenantId, connectionId, count: tools.length }, "Discovered MCP tools");
      
      // In a real implementation, this would save to the `mcp_tool_discovery` table
      // For this phase 3.5 architecture demo, we log the result.
      for (const tool of tools) {
        logger.debug({ 
          tool: tool.name, 
          description: tool.description 
        }, "Discovered Tool");
      }
      
      // This is where we would trigger the SemanticMapper to propose capability_mappings
    } catch (err) {
      logger.error({ tenantId, connectionId, err }, "Failed to discover MCP tools");
      throw err;
    } finally {
      await client.close();
    }
  }
}
