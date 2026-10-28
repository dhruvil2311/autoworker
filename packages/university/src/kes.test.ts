import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  Evidence,
  KnowledgeEvolutionSystem,
  runKnowledgeBenchmark,
  runKnowledgeRedTeam
} from './kes';

async function tempStore(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'ghost-kes-'));
}

describe('Knowledge Evolution System', () => {
  it('persists immutable episodes and learns tenant-scoped semantic knowledge', async () => {
    const kes = new KnowledgeEvolutionSystem(await tempStore());
    const episode = await kes.recordExecution({
      workflowId: 'refund-approval',
      tenantId: 'tenant-a',
      merchant: 'Acme Shopify',
      inputs: { refundAmount: 750 },
      outputs: {
        learned: [{
          memoryType: 'SEMANTIC',
          statement: 'Refunds over $500 require manager approval.',
          key: 'refund.approval.threshold',
          value: 500,
          confidence: 0.94
        }]
      },
      runtimeEvents: [{ at: new Date().toISOString(), type: 'POLICY_CHECK', message: 'Approval required.' }],
      failures: [],
      recoverySteps: [],
      humanIntervention: ['manager approval'],
      successRate: 1,
      cost: 0.03,
      durationMs: 1000,
      confidence: 0.94
    });

    await kes.learnFromEpisode(episode);
    const episodes = await kes.store.listEpisodes('tenant-a');
    const recalled = await kes.recall({ tenantId: 'tenant-a', merchant: 'Acme Shopify', memoryType: 'SEMANTIC' });
    const crossTenant = await kes.recall({ tenantId: 'tenant-b', merchant: 'Beta Woo' });

    expect(episodes).toHaveLength(1);
    expect(episodes[0]?.immutableHash).toMatch(/^[a-f0-9]{64}$/);
    expect(recalled.some((record) => record.statement.includes('$500'))).toBe(true);
    expect(crossTenant).toHaveLength(0);
  });

  it('rejects poisoned low-authority learning and routes temporary policy to clarification', async () => {
    const report = await runKnowledgeRedTeam(await tempStore());

    expect(report.passed).toBe(true);
    expect(report.attacks.map((attack) => attack.name)).toEqual([
      'Poisoned demonstration',
      'Temporary policy',
      'Cross-tenant contamination'
    ]);
  });

  it('supports evidence-backed rollback without deleting history', async () => {
    const kes = new KnowledgeEvolutionSystem(await tempStore());
    const evidence: Evidence = {
      evidenceId: 'sop:refund-v1',
      source: 'Refund SOP',
      sourceType: 'SOP',
      authority: 0.95,
      observedAt: new Date().toISOString(),
      summary: 'Official policy.'
    };
    const result = await kes.revision.revise({
      candidateId: randomUUID(),
      episodeId: randomUUID(),
      memoryType: 'META',
      statement: 'Model X should not approve finance policies without SOP evidence.',
      payload: { key: 'model-x.finance-policy', value: 'requires-sop' },
      confidence: 0.96,
      author: 'Red Team',
      source: 'benchmark',
      context: { tenantId: 'tenant-a' },
      evidence: [evidence],
      suggestedAction: 'CREATE'
    });
    const created = result.records.at(-1);

    expect(created).toBeDefined();
    const rollback = await kes.revision.rollback(created!.knowledgeId, {
      evidenceId: 'rollback:red-team',
      source: 'Rollback test',
      sourceType: 'ROLLBACK',
      authority: 1,
      observedAt: new Date().toISOString(),
      summary: 'Rollback capability validation.'
    }, 'Retired during rollback validation.');
    const snapshot = await kes.store.compactSnapshot();

    expect(rollback?.status).toBe('RETIRED');
    expect(snapshot.find((record) => record.knowledgeId === created!.knowledgeId)?.version).toBe(2);
  });

  it('reports partial proof only after repeated durable execution and isolation checks', async () => {
    const report = await runKnowledgeBenchmark(await tempStore());

    expect(report.repeatedExecutions).toBeGreaterThanOrEqual(3);
    expect(report.knowledgeRetention).toBe(1);
    expect(report.catastrophicForgetting).toBe(0);
    expect(report.crossMerchantLeakage).toBe(0);
    expect(report.truthStatus).toBe('PARTIALLY_PROVEN');
  });
});
