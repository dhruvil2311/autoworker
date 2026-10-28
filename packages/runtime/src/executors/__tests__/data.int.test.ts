import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { DataExecutor } from '../data.js';
import { RuntimeContext } from '../../context.js';
import type { WorkflowV2Step } from '@ghost/workflow-schema';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('@ghost/observability', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

describe('DataExecutor Integration', () => {
  const tempDir = path.join(process.cwd(), 'temp_test_data');
  const csvPath = path.join(tempDir, 'sales.csv');
  
  beforeAll(() => {
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
    fs.writeFileSync(csvPath, 'id,amount\n1,100\n2,45\n', 'utf-8');
  });

  afterAll(() => {
    if (fs.existsSync(csvPath)) fs.unlinkSync(csvPath);
    if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
  });

  it('should parse real CSV files', async () => {
    const executor = new DataExecutor();
    const context = new RuntimeContext({
      inputs: {}, variables: {}, outputs: {}, artifacts: {},
      executionMetadata: { runId: 'run1', tenantId: 't1', workflowVersionId: 'v1' },
      scopes: []
    });

    const step: WorkflowV2Step = {
      id: 'step_1',
      description: 'Parse CSV',
      target: 'DATA',
      operation: 'PROCESS_FILE',
      args: { file: csvPath },
      bind_result_to: 'csv_data'
    };

    const result = await executor.execute(step, context);
    
    expect(result.state).toBe('SUCCEEDED');
    expect(result.outputs?.csv_data).toBeDefined();
    expect(result.outputs?.csv_data.length).toBe(2);
    expect(result.outputs?.csv_data[0].amount).toBe('100');
  });

  it('should transform data with AST SUM', async () => {
    const executor = new DataExecutor();
    const context = new RuntimeContext({
      inputs: {},
      variables: {
        records: [
          { amount: '100' },
          { amount: '45' }
        ]
      },
      outputs: {}, artifacts: {},
      executionMetadata: { runId: 'run1', tenantId: 't1', workflowVersionId: 'v1' },
      scopes: []
    });

    const step: WorkflowV2Step = {
      id: 'step_2',
      description: 'Sum amounts',
      target: 'DATA',
      operation: 'TRANSFORM',
      args: {
        formula: {
          op: 'SUM',
          items: { type: 'VAR', name: 'records' },
          field: 'amount'
        },
        variables: { records: '{{records}}' }
      },
      bind_result_to: 'total'
    };

    const result = await executor.execute(step, context);
    
    expect(result.state).toBe('SUCCEEDED');
    expect(result.outputs?.total).toBe(145);
  });
});
