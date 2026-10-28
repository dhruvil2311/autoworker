import { describe, it, expect, vi } from 'vitest';
import { MCPExecutor } from '../mcp-executor.js';
import { RuntimeContext } from '../../context.js';
import type { WorkflowV2Step } from '@ghost/workflow-schema';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

vi.mock('@ghost/observability', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

describe('MCPExecutor Integration', () => {
  it('should resolve connection from context and successfully call MCP tool', async () => {
    const executor = new MCPExecutor();
    
    // Create context with the connection config
    const context = new RuntimeContext({
      inputs: {}, variables: {}, outputs: {}, artifacts: {},
      executionMetadata: { runId: 'run1', tenantId: 't1', workflowVersionId: 'v1' },
      scopes: []
    });
    
    // We point to the mock MCP server, but using the REAL resolution mechanism
    const serverPath = [
      path.resolve(process.cwd(), 'apps/api/test/__fixtures__/mock-mcp-server.ts'),
      path.resolve(process.cwd(), '../../apps/api/test/__fixtures__/mock-mcp-server.ts'),
      path.resolve(__dirname, '../../../../../apps/api/test/__fixtures__/mock-mcp-server.ts'),
    ].find(p => fs.existsSync(p)) || path.resolve(process.cwd(), 'apps/api/test/__fixtures__/mock-mcp-server.ts');

    context.set('__connection_my-mcp-conn', {
      command: 'npx',
      args: ['tsx', serverPath]
    });

    const step: WorkflowV2Step = {
      id: 'step_1',
      description: 'Call MCP Tool',
      target: 'MCP',
      operation: 'CALL_MCP',
      args: {
        capabilityId: 'cap1',
        connectionId: 'my-mcp-conn',
        toolName: 'get_inventory',
        inputs: { sku: 'SKU123' },
        inputSchema: {
          properties: {
            sku: { type: 'string' }
          },
          required: ['sku']
        }
      },
      bind_result_to: 'mcp_res'
    };

    const result = await executor.execute(step, context);
    
    if (result.state !== 'SUCCEEDED') {
      console.error(result.message);
    }
    expect(result.state).toBe('SUCCEEDED');
    expect(result.outputs?.mcp_res).toBeDefined();
    // Assuming the mock server returns the input text or an array
    expect(JSON.stringify(result.outputs?.mcp_res)).toContain('42');
  }, 30000);
});
