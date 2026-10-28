import { describe, it, expect, vi } from 'vitest';
import { ApiExecutor, ApiInputSchema, ApiResultSchema } from '../api.js';
import { RuntimeContext } from '../../context.js';
import type { WorkflowV2Step } from '@ghost/workflow-schema';
import { logger } from '@ghost/observability';

vi.mock('@ghost/observability', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

describe('ApiExecutor Integration', () => {
  it('should successfully call a real API and validate the result schema', async () => {
    const executor = new ApiExecutor();
    const context = new RuntimeContext({
      inputs: {},
      variables: {},
      outputs: {},
      artifacts: {},
      executionMetadata: { runId: 'run_123', tenantId: 't1', workflowVersionId: 'v1' },
      scopes: []
    });

    const step: WorkflowV2Step = {
      id: 'step_1',
      description: 'Fetch user 1',
      target: 'API',
      operation: 'CALL_API',
      args: {
        url: 'https://jsonplaceholder.typicode.com/todos/1',
        method: 'GET'
      },
      bind_result_to: 'api_result'
    };

    const result = await executor.execute(step, context);
    
    expect(result.state).toBe('SUCCEEDED');
    expect(result.outputs?.api_result).toBeDefined();
    
    // Validate result against the schema
    const parsedResult = ApiResultSchema.safeParse(result.outputs?.api_result);
    expect(parsedResult.success).toBe(true);
    if (parsedResult.success) {
      expect(parsedResult.data.status).toBe(200);
      expect(parsedResult.data.data.userId).toBe(1);
    }
    
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'API_REQUEST_STARTED' }),
      expect.any(String)
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'API_REQUEST_SUCCEEDED' }),
      expect.any(String)
    );
  });

  it('should retry on 5xx errors', async () => {
    const executor = new ApiExecutor();
    const context = new RuntimeContext({
      inputs: {},
      variables: {},
      outputs: {},
      artifacts: {},
      executionMetadata: { runId: 'run_124', tenantId: 't1', workflowVersionId: 'v1' },
      scopes: []
    });

    const step: WorkflowV2Step = {
      id: 'step_2',
      description: 'Fetch failing api',
      target: 'API',
      operation: 'CALL_API',
      args: {
        url: 'https://httpbin.org/status/503',
        method: 'GET',
        retryCount: 1, // small retry to not block tests too long
        timeoutMs: 5000
      }
    };

    const result = await executor.execute(step, context);
    
    // It should fail eventually because the service always returns 503
    expect(result.state).toBe('FAILED');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'API_REQUEST_RETRY' }),
      expect.any(String)
    );
  }, 10000);
});
