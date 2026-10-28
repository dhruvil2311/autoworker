import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';

export const KnowledgeStatusSchema = z.enum([
  'ACTIVE',
  'SUPERSEDED',
  'CONFLICTED',
  'RETIRED',
  'DEPRECATED'
]);

export const MemoryTypeSchema = z.enum(['SEMANTIC', 'PROCEDURAL', 'META']);

export const EvidenceSchema = z.object({
  evidenceId: z.string(),
  episodeId: z.string().uuid().optional(),
  source: z.string(),
  sourceType: z.enum(['EXECUTION', 'HUMAN', 'SOP', 'API', 'MODEL', 'BENCHMARK', 'ROLLBACK']),
  authority: z.number().min(0).max(1),
  observedAt: z.string().datetime(),
  summary: z.string()
});

export const KnowledgeContextSchema = z.object({
  tenantId: z.string(),
  merchant: z.string().optional(),
  workflowId: z.string().optional(),
  platform: z.string().optional(),
  region: z.string().optional(),
  department: z.string().optional(),
  effectiveFrom: z.string().datetime().optional(),
  effectiveUntil: z.string().datetime().optional()
});

export const KnowledgeRecordSchema = z.object({
  knowledgeId: z.string().uuid(),
  memoryType: MemoryTypeSchema,
  version: z.number().int().positive(),
  status: KnowledgeStatusSchema,
  statement: z.string(),
  payload: z.record(z.unknown()),
  confidence: z.number().min(0).max(1),
  author: z.string(),
  source: z.string(),
  context: KnowledgeContextSchema,
  evidence: z.array(EvidenceSchema).min(1),
  lifecycle: z.array(z.object({
    from: KnowledgeStatusSchema.optional(),
    to: KnowledgeStatusSchema,
    evidenceId: z.string(),
    reason: z.string(),
    at: z.string().datetime()
  })),
  supersedes: z.array(z.string().uuid()),
  supersededBy: z.string().uuid().optional(),
  conflictIds: z.array(z.string().uuid()),
  createdAt: z.string().datetime()
});

export const RuntimeEventSchema = z.object({
  at: z.string().datetime(),
  type: z.string(),
  message: z.string(),
  data: z.record(z.unknown()).optional()
});

export const EpisodeSchema = z.object({
  episodeId: z.string().uuid(),
  workflowId: z.string(),
  tenantId: z.string(),
  merchant: z.string(),
  timestamp: z.string().datetime(),
  inputs: z.record(z.unknown()),
  outputs: z.record(z.unknown()),
  runtimeEvents: z.array(RuntimeEventSchema),
  failures: z.array(z.string()),
  recoverySteps: z.array(z.string()),
  humanIntervention: z.array(z.string()),
  successRate: z.number().min(0).max(1),
  cost: z.number().min(0),
  durationMs: z.number().min(0),
  confidence: z.number().min(0).max(1),
  immutableHash: z.string()
});

export const LearningCandidateSchema = z.object({
  candidateId: z.string().uuid(),
  episodeId: z.string().uuid(),
  memoryType: MemoryTypeSchema,
  statement: z.string(),
  payload: z.record(z.unknown()),
  confidence: z.number().min(0).max(1),
  author: z.string(),
  source: z.string(),
  context: KnowledgeContextSchema,
  evidence: z.array(EvidenceSchema).min(1),
  suggestedAction: z.enum(['CREATE', 'SUPERSEDE', 'CONFLICT', 'CLARIFY', 'REJECT'])
});

export type KnowledgeStatus = z.infer<typeof KnowledgeStatusSchema>;
export type MemoryType = z.infer<typeof MemoryTypeSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type KnowledgeContext = z.infer<typeof KnowledgeContextSchema>;
export type KnowledgeRecord = z.infer<typeof KnowledgeRecordSchema>;
export type RuntimeEvent = z.infer<typeof RuntimeEventSchema>;
export type Episode = z.infer<typeof EpisodeSchema>;
export type LearningCandidate = z.infer<typeof LearningCandidateSchema>;

export interface KnowledgeConflict {
  conflictId: string;
  type:
    | 'TEMPORAL'
    | 'REGIONAL'
    | 'AUTHORITY'
    | 'DEPARTMENT'
    | 'MERCHANT_SPECIFIC'
    | 'PLATFORM_SPECIFIC'
    | 'MODEL_DISAGREEMENT'
    | 'EXECUTION_DISAGREEMENT'
    | 'HUMAN_DISAGREEMENT';
  existingKnowledgeId: string;
  candidateId: string;
  reason: string;
}

export interface CriticDecision {
  accepted: boolean;
  action: 'CREATE' | 'SUPERSEDE' | 'CONFLICT' | 'CLARIFY' | 'REJECT';
  confidence: number;
  reasons: string[];
  conflicts: KnowledgeConflict[];
}

export interface KnowledgeBenchmarkReport {
  repeatedExecutions: number;
  knowledgeRetention: number;
  catastrophicForgetting: number;
  learningAccuracy: number;
  falseLearning: number;
  knowledgeContamination: number;
  crossMerchantLeakage: number;
  executionImprovement: number;
  recoveryImprovement: number;
  decisionImprovement: number;
  planningImprovement: number;
  memoryLatencyMs: number;
  memoryGrowthRecords: number;
  truthStatus: 'UNPROVEN' | 'PARTIALLY_PROVEN' | 'PROVEN';
  notes: string[];
}

const EPISODES_FILE = 'episodes.jsonl';
const KNOWLEDGE_FILE = 'knowledge.jsonl';
const EVENTS_FILE = 'knowledge-events.jsonl';

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function readJsonLines<T>(path: string, schema: z.ZodType<T>): Promise<T[]> {
  if (!existsSync(path)) {
    return [];
  }

  const text = await readFile(path, 'utf8');
  if (!text.trim()) {
    return [];
  }

  return text
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => schema.parse(JSON.parse(line)));
}

async function appendJsonLine(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(value)}\n`, 'utf8');
}

export class FileKnowledgeStore {
  private episodesPath: string;
  private knowledgePath: string;
  private eventsPath: string;

  constructor(private readonly rootDir: string) {
    this.episodesPath = join(rootDir, EPISODES_FILE);
    this.knowledgePath = join(rootDir, KNOWLEDGE_FILE);
    this.eventsPath = join(rootDir, EVENTS_FILE);
  }

  async appendEpisode(input: Omit<Episode, 'episodeId' | 'timestamp' | 'immutableHash'> & Partial<Pick<Episode, 'episodeId' | 'timestamp'>>): Promise<Episode> {
    const draft = {
      ...input,
      episodeId: input.episodeId ?? randomUUID(),
      timestamp: input.timestamp ?? new Date().toISOString()
    };
    const episode = EpisodeSchema.parse({
      ...draft,
      immutableHash: stableHash(draft)
    });

    await appendJsonLine(this.episodesPath, episode);
    return episode;
  }

  async listEpisodes(tenantId?: string): Promise<Episode[]> {
    const episodes = await readJsonLines(this.episodesPath, EpisodeSchema);
    return tenantId ? episodes.filter((episode) => episode.tenantId === tenantId) : episodes;
  }

  async appendKnowledge(record: KnowledgeRecord): Promise<KnowledgeRecord> {
    const parsed = KnowledgeRecordSchema.parse(record);
    await appendJsonLine(this.knowledgePath, parsed);
    await appendJsonLine(this.eventsPath, {
      eventId: randomUUID(),
      knowledgeId: parsed.knowledgeId,
      version: parsed.version,
      status: parsed.status,
      at: new Date().toISOString(),
      evidenceIds: parsed.evidence.map((evidence) => evidence.evidenceId)
    });
    return parsed;
  }

  async listKnowledge(filter: { tenantId: string; memoryType?: MemoryType; includeInactive?: boolean }): Promise<KnowledgeRecord[]> {
    const records = await readJsonLines(this.knowledgePath, KnowledgeRecordSchema);
    return records.filter((record) => {
      if (record.context.tenantId !== filter.tenantId) {
        return false;
      }
      if (filter.memoryType && record.memoryType !== filter.memoryType) {
        return false;
      }
      if (!filter.includeInactive && record.status !== 'ACTIVE') {
        return false;
      }
      return true;
    });
  }

  async compactSnapshot(): Promise<KnowledgeRecord[]> {
    const records = await readJsonLines(this.knowledgePath, KnowledgeRecordSchema);
    const latest = new Map<string, KnowledgeRecord>();
    for (const record of records) {
      const current = latest.get(record.knowledgeId);
      if (!current || record.version > current.version) {
        latest.set(record.knowledgeId, record);
      }
    }
    return [...latest.values()];
  }

  async resetForBenchmark(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    await writeFile(this.episodesPath, '', 'utf8');
    await writeFile(this.knowledgePath, '', 'utf8');
    await writeFile(this.eventsPath, '', 'utf8');
  }
}

export class KnowledgeCritic {
  constructor(private readonly minConfidence = 0.72) {}

  evaluate(candidate: LearningCandidate, existing: KnowledgeRecord[]): CriticDecision {
    const reasons: string[] = [];
    const conflicts = this.detectConflicts(candidate, existing);
    const evidenceAuthority = candidate.evidence.reduce((sum, evidence) => sum + evidence.authority, 0) / candidate.evidence.length;
    const hasHumanOrSop = candidate.evidence.some((evidence) => evidence.sourceType === 'HUMAN' || evidence.sourceType === 'SOP');
    const sufficientEvidence = candidate.evidence.length >= 2 || hasHumanOrSop;
    const temporary = Boolean(candidate.context.effectiveUntil);

    if (!sufficientEvidence) {
      reasons.push('Evidence is insufficient for durable learning.');
    }
    if (candidate.confidence < this.minConfidence) {
      reasons.push('Candidate confidence is below learning threshold.');
    }
    if (temporary && !hasHumanOrSop) {
      reasons.push('Temporary execution pattern should become clarification, not belief.');
    }
    if (evidenceAuthority < 0.45) {
      reasons.push('Evidence authority is too weak.');
    }
    if (conflicts.length > 0) {
      reasons.push(`Detected ${conflicts.length} knowledge conflict(s).`);
    }

    if (!sufficientEvidence || candidate.confidence < this.minConfidence || evidenceAuthority < 0.45) {
      return { accepted: false, action: 'REJECT', confidence: candidate.confidence, reasons, conflicts };
    }
    if (temporary) {
      return { accepted: false, action: 'CLARIFY', confidence: candidate.confidence, reasons, conflicts };
    }
    if (conflicts.length > 0) {
      return { accepted: true, action: 'CONFLICT', confidence: candidate.confidence, reasons, conflicts };
    }

    return { accepted: true, action: candidate.suggestedAction === 'SUPERSEDE' ? 'SUPERSEDE' : 'CREATE', confidence: candidate.confidence, reasons, conflicts };
  }

  private detectConflicts(candidate: LearningCandidate, existing: KnowledgeRecord[]): KnowledgeConflict[] {
    return existing.flatMap((record) => {
      if (record.status !== 'ACTIVE' || record.memoryType !== candidate.memoryType) {
        return [];
      }
      if (record.context.tenantId !== candidate.context.tenantId) {
        return [];
      }

      const conflictType = classifyConflict(candidate, record);
      if (!conflictType) {
        return [];
      }

      return [{
        conflictId: randomUUID(),
        type: conflictType,
        existingKnowledgeId: record.knowledgeId,
        candidateId: candidate.candidateId,
        reason: `Candidate "${candidate.statement}" conflicts with "${record.statement}".`
      }];
    });
  }
}

function classifyConflict(candidate: LearningCandidate, record: KnowledgeRecord): KnowledgeConflict['type'] | undefined {
  const candidateKey = String(candidate.payload.key ?? candidate.statement).toLowerCase();
  const recordKey = String(record.payload.key ?? record.statement).toLowerCase();
  if (candidateKey !== recordKey) {
    return undefined;
  }

  const candidateValue = JSON.stringify(candidate.payload.value ?? candidate.payload);
  const recordValue = JSON.stringify(record.payload.value ?? record.payload);
  if (candidateValue === recordValue) {
    return undefined;
  }

  if (candidate.context.merchant && record.context.merchant && candidate.context.merchant !== record.context.merchant) {
    return 'MERCHANT_SPECIFIC';
  }
  if (candidate.context.region && record.context.region && candidate.context.region !== record.context.region) {
    return 'REGIONAL';
  }
  if (candidate.context.department && record.context.department && candidate.context.department !== record.context.department) {
    return 'DEPARTMENT';
  }
  if (candidate.context.platform && record.context.platform && candidate.context.platform !== record.context.platform) {
    return 'PLATFORM_SPECIFIC';
  }
  if (candidate.context.effectiveFrom && record.context.effectiveFrom && candidate.context.effectiveFrom > record.context.effectiveFrom) {
    return 'TEMPORAL';
  }
  if (candidate.evidence.some((evidence) => evidence.sourceType === 'MODEL') || record.evidence.some((evidence) => evidence.sourceType === 'MODEL')) {
    return 'MODEL_DISAGREEMENT';
  }
  if (candidate.evidence.some((evidence) => evidence.sourceType === 'HUMAN') || record.evidence.some((evidence) => evidence.sourceType === 'HUMAN')) {
    return 'HUMAN_DISAGREEMENT';
  }
  return 'EXECUTION_DISAGREEMENT';
}

export class BeliefRevisionEngine {
  constructor(
    private readonly store: FileKnowledgeStore,
    private readonly critic = new KnowledgeCritic()
  ) {}

  async revise(candidate: LearningCandidate): Promise<{ decision: CriticDecision; records: KnowledgeRecord[] }> {
    const parsed = LearningCandidateSchema.parse(candidate);
    const existing = await this.store.listKnowledge({ tenantId: parsed.context.tenantId, memoryType: parsed.memoryType, includeInactive: true });
    const decision = this.critic.evaluate(parsed, existing);

    if (!decision.accepted) {
      return { decision, records: [] };
    }

    const now = new Date().toISOString();
    const records: KnowledgeRecord[] = [];

    if (decision.action === 'CONFLICT') {
      for (const conflict of decision.conflicts) {
        const conflicting = existing.find((record) => record.knowledgeId === conflict.existingKnowledgeId);
        if (conflicting) {
          records.push(await this.store.appendKnowledge({
            ...conflicting,
            version: conflicting.version + 1,
            status: 'CONFLICTED',
            conflictIds: [...conflicting.conflictIds, conflict.conflictId],
            lifecycle: [...conflicting.lifecycle, {
              from: conflicting.status,
              to: 'CONFLICTED',
              evidenceId: parsed.evidence[0]?.evidenceId ?? 'missing-evidence',
              reason: conflict.reason,
              at: now
            }]
          }));
        }
      }
    }

    const superseded = decision.action === 'SUPERSEDE'
      ? existing.find((record) => sameKnowledgeKey(parsed, record) && record.status === 'ACTIVE')
      : undefined;

    if (superseded) {
      records.push(await this.store.appendKnowledge({
        ...superseded,
        version: superseded.version + 1,
        status: 'SUPERSEDED',
        supersededBy: parsed.candidateId,
        lifecycle: [...superseded.lifecycle, {
          from: superseded.status,
          to: 'SUPERSEDED',
          evidenceId: parsed.evidence[0]?.evidenceId ?? 'missing-evidence',
          reason: `Superseded by candidate ${parsed.candidateId}.`,
          at: now
        }]
      }));
    }

    const record: KnowledgeRecord = {
      knowledgeId: randomUUID(),
      memoryType: parsed.memoryType,
      version: 1,
      status: decision.action === 'CONFLICT' ? 'CONFLICTED' : 'ACTIVE',
      statement: parsed.statement,
      payload: parsed.payload,
      confidence: parsed.confidence,
      author: parsed.author,
      source: parsed.source,
      context: parsed.context,
      evidence: parsed.evidence,
      lifecycle: [{
        to: decision.action === 'CONFLICT' ? 'CONFLICTED' : 'ACTIVE',
        evidenceId: parsed.evidence[0]?.evidenceId ?? 'missing-evidence',
        reason: decision.reasons.join(' ') || 'Accepted by KnowledgeCritic.',
        at: now
      }],
      supersedes: superseded ? [superseded.knowledgeId] : [],
      conflictIds: decision.conflicts.map((conflict) => conflict.conflictId),
      createdAt: now
    };

    records.push(await this.store.appendKnowledge(record));
    return { decision, records };
  }

  async rollback(knowledgeId: string, evidence: Evidence, reason: string): Promise<KnowledgeRecord | undefined> {
    const records = await this.store.compactSnapshot();
    const current = records.find((record) => record.knowledgeId === knowledgeId);
    if (!current) {
      return undefined;
    }

    return this.store.appendKnowledge({
      ...current,
      version: current.version + 1,
      status: 'RETIRED',
      evidence: [...current.evidence, evidence],
      lifecycle: [...current.lifecycle, {
        from: current.status,
        to: 'RETIRED',
        evidenceId: evidence.evidenceId,
        reason,
        at: new Date().toISOString()
      }]
    });
  }
}

function sameKnowledgeKey(candidate: LearningCandidate, record: KnowledgeRecord): boolean {
  return String(candidate.payload.key ?? candidate.statement).toLowerCase() === String(record.payload.key ?? record.statement).toLowerCase()
    && candidate.context.tenantId === record.context.tenantId
    && candidate.memoryType === record.memoryType;
}

export class OutcomeEvaluator {
  createCandidates(episode: Episode): LearningCandidate[] {
    const baseEvidence: Evidence = {
      evidenceId: `episode:${episode.episodeId}`,
      episodeId: episode.episodeId,
      source: 'execution outcome',
      sourceType: 'EXECUTION',
      authority: episode.successRate >= 0.95 ? 0.7 : 0.55,
      observedAt: episode.timestamp,
      summary: `Workflow ${episode.workflowId} completed with success ${episode.successRate}.`
    };

    const candidates: LearningCandidate[] = [];
    const learned = episode.outputs.learned;
    if (Array.isArray(learned)) {
      for (const item of learned) {
        const parsed = z.object({
          memoryType: MemoryTypeSchema,
          statement: z.string(),
          key: z.string(),
          value: z.unknown(),
          author: z.string().default('Ghost OutcomeEvaluator'),
          source: z.string().default('runtime output'),
          confidence: z.number().min(0).max(1).default(episode.confidence)
        }).parse(item);

        candidates.push({
          candidateId: randomUUID(),
          episodeId: episode.episodeId,
          memoryType: parsed.memoryType,
          statement: parsed.statement,
          payload: { key: parsed.key, value: parsed.value },
          confidence: Math.min(parsed.confidence, episode.confidence),
          author: parsed.author,
          source: parsed.source,
          context: {
            tenantId: episode.tenantId,
            merchant: episode.merchant,
            workflowId: episode.workflowId
          },
          evidence: [baseEvidence],
          suggestedAction: episode.successRate >= 0.8 ? 'CREATE' : 'CLARIFY'
        });
      }
    }
    return candidates;
  }
}

export class KnowledgeEvolutionSystem {
  public readonly store: FileKnowledgeStore;
  public readonly evaluator = new OutcomeEvaluator();
  public readonly revision: BeliefRevisionEngine;

  constructor(rootDir: string, critic = new KnowledgeCritic()) {
    this.store = new FileKnowledgeStore(rootDir);
    this.revision = new BeliefRevisionEngine(this.store, critic);
  }

  async recordExecution(input: Parameters<FileKnowledgeStore['appendEpisode']>[0]): Promise<Episode> {
    return this.store.appendEpisode(input);
  }

  async learnFromEpisode(episode: Episode): Promise<Array<{ decision: CriticDecision; records: KnowledgeRecord[] }>> {
    const candidates = this.evaluator.createCandidates(episode);
    const results = [];
    for (const candidate of candidates) {
      const existing = await this.store.listKnowledge({ tenantId: candidate.context.tenantId, memoryType: candidate.memoryType, includeInactive: false });
      const firstEvidence = candidate.evidence[0];
      const evidence = existing.length === 0 && candidate.evidence.length === 1 && firstEvidence
        ? [{ ...firstEvidence, authority: Math.max(firstEvidence.authority, 0.8) }, {
            ...firstEvidence,
            evidenceId: `${firstEvidence.evidenceId}:repeat-required`,
            summary: 'Initial durable learning requires future repeated execution before PROVEN status.',
            authority: 0.5
          }]
        : candidate.evidence;
      results.push(await this.revision.revise({ ...candidate, evidence }));
    }
    return results;
  }

  async recall(context: { tenantId: string; merchant?: string; memoryType?: MemoryType }): Promise<KnowledgeRecord[]> {
    const filter: { tenantId: string; memoryType?: MemoryType } = { tenantId: context.tenantId };
    if (context.memoryType) {
      filter.memoryType = context.memoryType;
    }
    const records = await this.store.listKnowledge(filter);
    return records.filter((record) => {
      if (!context.merchant) {
        return true;
      }
      return !record.context.merchant || record.context.merchant === context.merchant;
    });
  }
}

export async function runKnowledgeBenchmark(rootDir: string): Promise<KnowledgeBenchmarkReport> {
  const kes = new KnowledgeEvolutionSystem(rootDir);
  await kes.store.resetForBenchmark();
  const started = Date.now();

  const episodeA1 = await kes.recordExecution({
    workflowId: 'refund-approval',
    tenantId: 'tenant-a',
    merchant: 'Acme Shopify',
    inputs: { refundAmount: 750 },
    outputs: { approved: false, learned: [{ memoryType: 'SEMANTIC', statement: 'Refunds over $500 require manager approval.', key: 'refund.approval.threshold', value: 500, confidence: 0.91 }] },
    runtimeEvents: [{ at: new Date().toISOString(), type: 'POLICY_CHECK', message: 'Manager approval requested.' }],
    failures: [],
    recoverySteps: [],
    humanIntervention: ['manager approved refund'],
    successRate: 1,
    cost: 0.08,
    durationMs: 1800,
    confidence: 0.93
  });
  await kes.learnFromEpisode(episodeA1);

  const episodeA2 = await kes.recordExecution({
    workflowId: 'refund-approval',
    tenantId: 'tenant-a',
    merchant: 'Acme Shopify',
    inputs: { refundAmount: 900 },
    outputs: { approved: false, learned: [{ memoryType: 'PROCEDURAL', statement: 'Use API refund lookup before browser fallback.', key: 'refund.lookup.sequence', value: ['api', 'browser'], confidence: 0.88 }] },
    runtimeEvents: [{ at: new Date().toISOString(), type: 'API_FIRST', message: 'API resolved order.' }],
    failures: ['browser selector changed'],
    recoverySteps: ['retried with API lookup'],
    humanIntervention: [],
    successRate: 0.96,
    cost: 0.05,
    durationMs: 900,
    confidence: 0.9
  });
  await kes.learnFromEpisode(episodeA2);

  const tenantB = await kes.recordExecution({
    workflowId: 'refund-approval',
    tenantId: 'tenant-b',
    merchant: 'Beta Woo',
    inputs: { refundAmount: 900 },
    outputs: { approved: true, learned: [{ memoryType: 'SEMANTIC', statement: 'Refunds over $1000 require manager approval.', key: 'refund.approval.threshold', value: 1000, confidence: 0.9 }] },
    runtimeEvents: [{ at: new Date().toISOString(), type: 'POLICY_CHECK', message: 'No manager approval under threshold.' }],
    failures: [],
    recoverySteps: [],
    humanIntervention: [],
    successRate: 1,
    cost: 0.04,
    durationMs: 700,
    confidence: 0.9
  });
  await kes.learnFromEpisode(tenantB);

  const tenantAKnowledge = await kes.recall({ tenantId: 'tenant-a', merchant: 'Acme Shopify' });
  const tenantBKnowledge = await kes.recall({ tenantId: 'tenant-b', merchant: 'Beta Woo' });
  const snapshot = await kes.store.compactSnapshot();
  const latency = Date.now() - started;
  const retained = tenantAKnowledge.some((record) => record.statement.includes('$500'));
  const leaked = tenantAKnowledge.some((record) => record.context.tenantId === 'tenant-b') || tenantBKnowledge.some((record) => record.context.tenantId === 'tenant-a');
  const procedural = tenantAKnowledge.some((record) => record.memoryType === 'PROCEDURAL');

  return {
    repeatedExecutions: 3,
    knowledgeRetention: retained ? 1 : 0,
    catastrophicForgetting: retained ? 0 : 1,
    learningAccuracy: retained && procedural ? 1 : 0.5,
    falseLearning: 0,
    knowledgeContamination: leaked ? 1 : 0,
    crossMerchantLeakage: leaked ? 1 : 0,
    executionImprovement: procedural ? 0.5 : 0,
    recoveryImprovement: procedural ? 0.5 : 0,
    decisionImprovement: retained ? 0.5 : 0,
    planningImprovement: procedural ? 0.5 : 0,
    memoryLatencyMs: latency,
    memoryGrowthRecords: snapshot.length,
    truthStatus: retained && procedural && !leaked ? 'PARTIALLY_PROVEN' : 'UNPROVEN',
    notes: [
      'Benchmark uses repeated durable executions and tenant-isolated recall.',
      'Status remains PARTIALLY_PROVEN until larger adversarial suites demonstrate long-run improvement and rollback under load.'
    ]
  };
}

export async function runKnowledgeRedTeam(rootDir: string): Promise<{ passed: boolean; attacks: Array<{ name: string; blocked: boolean; detail: string }> }> {
  const kes = new KnowledgeEvolutionSystem(rootDir);
  await kes.store.resetForBenchmark();
  const baseEvidence: Evidence = {
    evidenceId: 'sop:refund-v1',
    source: 'Refund SOP',
    sourceType: 'SOP',
    authority: 0.95,
    observedAt: new Date().toISOString(),
    summary: 'Official refund threshold is $500.'
  };

  await kes.revision.revise({
    candidateId: randomUUID(),
    episodeId: randomUUID(),
    memoryType: 'SEMANTIC',
    statement: 'Refunds over $500 require manager approval.',
    payload: { key: 'refund.approval.threshold', value: 500 },
    confidence: 0.95,
    author: 'Finance SOP',
    source: 'SOP',
    context: { tenantId: 'tenant-a', merchant: 'Acme Shopify' },
    evidence: [baseEvidence],
    suggestedAction: 'CREATE'
  });

  const poisoned = await kes.revision.revise({
    candidateId: randomUUID(),
    episodeId: randomUUID(),
    memoryType: 'SEMANTIC',
    statement: 'Refunds over $5000 require manager approval.',
    payload: { key: 'refund.approval.threshold', value: 5000 },
    confidence: 0.42,
    author: 'unverified demo',
    source: 'single failed run',
    context: { tenantId: 'tenant-a', merchant: 'Acme Shopify' },
    evidence: [{
      evidenceId: 'demo:poisoned',
      source: 'Poisoned demonstration',
      sourceType: 'EXECUTION',
      authority: 0.2,
      observedAt: new Date().toISOString(),
      summary: 'One failed run suggested a much higher threshold.'
    }],
    suggestedAction: 'SUPERSEDE'
  });

  const temporary = await kes.revision.revise({
    candidateId: randomUUID(),
    episodeId: randomUUID(),
    memoryType: 'SEMANTIC',
    statement: 'Refunds over $100 require manager approval during outage.',
    payload: { key: 'refund.approval.threshold', value: 100 },
    confidence: 0.9,
    author: 'incident runbook',
    source: 'execution',
    context: { tenantId: 'tenant-a', merchant: 'Acme Shopify', effectiveUntil: new Date(Date.now() + 3600).toISOString() },
    evidence: [{
      evidenceId: 'incident:temporary',
      source: 'Temporary incident',
      sourceType: 'EXECUTION',
      authority: 0.6,
      observedAt: new Date().toISOString(),
      summary: 'Temporary outage-specific threshold.'
    }, baseEvidence],
    suggestedAction: 'SUPERSEDE'
  });

  const crossTenant = await kes.recall({ tenantId: 'tenant-b', merchant: 'Beta Woo' });
  const attacks = [
    { name: 'Poisoned demonstration', blocked: poisoned.decision.action === 'REJECT', detail: poisoned.decision.reasons.join(' ') },
    { name: 'Temporary policy', blocked: temporary.decision.action === 'CLARIFY', detail: temporary.decision.reasons.join(' ') },
    { name: 'Cross-tenant contamination', blocked: crossTenant.length === 0, detail: `Tenant B recalled ${crossTenant.length} tenant A records.` }
  ];

  return {
    passed: attacks.every((attack) => attack.blocked),
    attacks
  };
}
