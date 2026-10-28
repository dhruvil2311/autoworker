#!/usr/bin/env node
/**
 * Mock MCP Server for E2E testing
 * Implements a simple STDIO MCP server with fake inventory capabilities.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  { name: "mock-inventory", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_inventory",
        description: "Fetch current inventory for an item",
        inputSchema: {
          type: "object",
          properties: {
            sku: { type: "string" }
          },
          required: ["sku"]
        }
      },
      {
        name: "update_inventory",
        description: "Update inventory levels for an item",
        inputSchema: {
          type: "object",
          properties: {
            sku: { type: "string" },
            quantity: { type: "number" }
          },
          required: ["sku", "quantity"]
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  if (name === "get_inventory") {
    return {
      content: [
        { type: "text", text: JSON.stringify({ sku: args?.sku, quantity: 42 }) }
      ]
    };
  }

  if (name === "update_inventory") {
    if (args?.quantity < 0) {
      return {
        isError: true,
        content: [{ type: "text", text: "Quantity cannot be negative" }]
      };
    }
    
    return {
      content: [
        { type: "text", text: JSON.stringify({ success: true, sku: args?.sku, new_quantity: args?.quantity }) }
      ]
    };
  }

  throw new Error(`Tool not found: ${name}`);
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Mock MCP Server running on stdio");
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
