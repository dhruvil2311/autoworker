import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { BrowserDeterministicExecutor } from '../browser-deterministic.js';
import { RuntimeContext } from '../../context.js';
import type { WorkflowV2Step } from '@ghost/workflow-schema';
import * as http from 'http';

vi.mock('@ghost/observability', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

describe('BrowserDeterministicExecutor Integration', () => {
  let server: http.Server;
  let testUrl: string;

  beforeAll(async () => {
    return new Promise((resolve) => {
      server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><h1 id="header">Hello Playwright</h1><input id="my-input" /></body></html>');
      });
      server.listen(0, () => {
        const port = (server.address() as any).port;
        testUrl = `http://localhost:${port}`;
        resolve(undefined);
      });
    });
  });

  afterAll(async () => {
    return new Promise((resolve) => {
      server.close(() => resolve(undefined));
    });
  });

  it('should navigate and extract text', async () => {
    const executor = new BrowserDeterministicExecutor();
    const context = new RuntimeContext({
      inputs: {}, variables: {}, outputs: {}, artifacts: {},
      executionMetadata: { runId: 'run1', tenantId: 't1', workflowVersionId: 'v1' },
      scopes: []
    });

    const step: WorkflowV2Step = {
      id: 'step_1',
      description: 'Extract header',
      target: 'BROWSER_DETERMINISTIC',
      operation: 'EXTRACT',
      args: {
        url: testUrl,
        selector: '#header'
      },
      bind_result_to: 'header_text'
    };

    const result = await executor.execute(step, context);
    
    if (result.state !== 'SUCCEEDED') console.error(result.message);
    expect(result.state).toBe('SUCCEEDED');
    expect(result.outputs?.header_text).toBe('Hello Playwright');
  }, 30000);

  it('should type and click without failing', async () => {
    const executor = new BrowserDeterministicExecutor();
    const context = new RuntimeContext({
      inputs: {}, variables: {}, outputs: {}, artifacts: {},
      executionMetadata: { runId: 'run1', tenantId: 't1', workflowVersionId: 'v1' },
      scopes: []
    });

    const step: WorkflowV2Step = {
      id: 'step_2',
      description: 'Type into input',
      target: 'BROWSER_DETERMINISTIC',
      operation: 'TYPE',
      args: {
        url: testUrl,
        selector: '#my-input',
        text: 'Ghost Automation'
      }
    };

    const result = await executor.execute(step, context);
    
    expect(result.state).toBe('SUCCEEDED');
    expect(result.outputs?.success).toBe(true);
  }, 30000);
});
