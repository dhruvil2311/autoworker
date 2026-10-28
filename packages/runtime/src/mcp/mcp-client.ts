import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { logger } from "@ghost/observability";

export interface MCPConnectionConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export class MCPClient {
  private client: Client;
  private transport: StdioClientTransport | undefined;
  private isConnected = false;

  constructor(private config: MCPConnectionConfig, private name: string) {
    this.client = new Client(
      {
        name: "ghost-mcp-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;
    
    logger.info({ name: this.name, command: this.config.command }, "Connecting to MCP server");
    
    this.transport = new StdioClientTransport({
      command: this.config.command,
      args: this.config.args,
      env: Object.fromEntries(
        Object.entries({ ...process.env, ...this.config.env }).filter(([_, v]) => v !== undefined)
      ) as Record<string, string>
    });

    await this.client.connect(this.transport);
    this.isConnected = true;
    logger.info({ name: this.name }, "Connected to MCP server");
  }

  async listTools() {
    if (!this.isConnected) await this.connect();
    logger.debug({ name: this.name }, "Listing MCP tools");
    const response = await this.client.listTools();
    return response.tools;
  }

  async callTool(toolName: string, args: Record<string, unknown>, timeoutMs: number = 30000) {
    if (!this.isConnected) await this.connect();
    
    logger.info({ name: this.name, tool: toolName, args }, "Calling MCP tool");
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`MCP Tool call timed out after ${timeoutMs}ms`)), timeoutMs)
    );

    const callPromise = this.client.callTool({
      name: toolName,
      arguments: args
    });

    try {
      const response = await Promise.race([callPromise, timeoutPromise]) as any;
      logger.info({ name: this.name, tool: toolName, success: !response.isError }, "MCP tool call completed");
      return response;
    } catch (err) {
      logger.error({ name: this.name, tool: toolName, err }, "MCP tool call failed");
      throw err;
    }
  }

  async close(): Promise<void> {
    if (!this.isConnected) return;
    
    try {
      await this.client.close();
    } catch (err) {
      logger.error({ err }, "Error closing MCP client");
    } finally {
      this.isConnected = false;
      this.transport = undefined;
    }
  }
}
