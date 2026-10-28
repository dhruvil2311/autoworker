import type { WorkflowV2Step } from "@ghost/workflow-schema";
import type { RuntimeContext } from "../context.js";
import { VariableResolver } from "../context.js";
import type { ExecutionCapability, ExecutionResult } from "./index.js";
import { logger } from "@ghost/observability";
import { MCPClient } from "../mcp/mcp-client.js";
import { z } from "zod";

// --- Exposed Schemas ---
export const McpInputSchema = z.object({
  capabilityId: z.string(),
  connectionId: z.string(),
  toolName: z.string(),
  inputSchema: z.record(z.any()).optional().default({}),
  sideEffect: z.enum(["READ", "MUTATION"]).optional().default("READ"),
  inputs: z.record(z.any()).optional().default({})
});

export const McpResultSchema = z.object({
  mcp_response: z.any()
});

export const McpErrorSchema = z.object({
  code: z.string(),
  message: z.string()
});

export class MCPExecutor implements ExecutionCapability {
  canExecute(step: WorkflowV2Step): boolean {
    return step.target === "MCP" || step.operation === "CALL_MCP";
  }

  async execute(step: WorkflowV2Step, context: RuntimeContext): Promise<ExecutionResult> {
    logger.info({ stepId: step.id, operation: step.operation }, "Executing MCP step");
    
    const resolver = new VariableResolver(context);
    
    const parseResult = McpInputSchema.safeParse(step.args || {});
    if (!parseResult.success) {
      return { state: "FAILED", message: `Capability gap: Invalid args: ${parseResult.error.message}` };
    }

    const { capabilityId, connectionId, toolName, inputSchema, sideEffect, inputs } = parseResult.data;
    
    // Resolve templates in inputs
    const resolvedInputs = resolver.resolve(inputs);

    // Mutation Safety: Prevent blind retries on crash
    const fingerprint = `${context.executionMetadata.runId}_${step.id}`;
    if (sideEffect === "MUTATION") {
      if (context.get(`__uncertain_${fingerprint}`)) {
        return { 
          state: "PAUSED_FOR_HUMAN", 
          hitlReason: "UNVERIFIED_MUTATION_CAPABILITY",
          message: "Previous execution crashed during mutation. Outcome is uncertain."
        };
      }
    }

    // Schema Validation
    const validationError = this.validateSchema(resolvedInputs, inputSchema);
    if (validationError) {
      return { state: "FAILED", message: `Schema validation failed: ${validationError}` };
    }

    // Mark mutation as started/uncertain before we make the network call
    if (sideEffect === "MUTATION") {
      context.set(`__uncertain_${fingerprint}`, true);
    }

    let client: MCPClient | undefined;
    try {
      logger.debug({ capabilityId, connectionId }, "Resolving MCP capability details from context");
      
      const connectionKey = `__connection_${connectionId}`;
      const config = context.get(connectionKey);

      if (!config) {
         return { state: "FAILED", message: `Capability gap: NO_CONNECTION config found for ${connectionId}` };
      }

      // Read command and args from context connection config
      const command = config.command;
      const cmdArgs = config.args || [];
      
      if (!command) {
        return { state: "FAILED", message: `Capability gap: NO_COMMAND provided in connection ${connectionId}` };
      }

      client = new MCPClient({ command, args: cmdArgs }, `mcp-${connectionId}`);
      await client.connect();
      
      const response = await client.callTool(toolName, resolvedInputs);
      
      logger.info({ stepId: step.id }, "MCP tool execution succeeded");

      // Mark mutation as confirmed successful
      if (sideEffect === "MUTATION") {
        context.set(`__uncertain_${fingerprint}`, false);
      }

      if (response.isError) {
        return { state: "FAILED", message: `MCP Error: ${JSON.stringify(response.content)}` };
      }

      return {
        state: "SUCCEEDED",
        outputs: step.bind_result_to ? { [step.bind_result_to]: response.content } : { mcp_response: response.content }
      };
    } catch (e: any) {
      logger.error({ stepId: step.id, error: e.message }, "MCP execution failed");
      
      return {
        state: "FAILED",
        message: e.message
      };
    } finally {
      if (client) {
        await client.close();
      }
    }
  }

  private validateSchema(inputs: Record<string, any>, schema: any): string | null {
    if (!schema || !schema.properties) return null;
    
    // Check required fields
    if (schema.required && Array.isArray(schema.required)) {
      for (const req of schema.required) {
        if (inputs[req] === undefined || inputs[req] === null) {
          return `Missing required field: ${req}`;
        }
      }
    }
    
    // Type checking
    for (const [key, val] of Object.entries(inputs)) {
      const propDef = schema.properties[key];
      if (propDef) {
        if (propDef.type === "string" && typeof val !== "string") return `Field ${key} must be a string`;
        if (propDef.type === "number" && typeof val !== "number") return `Field ${key} must be a number`;
        if (propDef.type === "boolean" && typeof val !== "boolean") return `Field ${key} must be a boolean`;
      } else {
        return `Unexpected field: ${key}`;
      }
    }
    
    return null;
  }
}
