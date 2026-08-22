import { describe, expect, it } from 'vitest';
import postgres from 'postgres';
import {
  JOB_STORAGE_MARKER,
  PostgresAppStore,
  mapJobRow,
  mapOpportunityRow,
  serializeJobStorage,
} from '@/src/lib/postgres-store';
import type { JobRecord } from '@/src/lib/app-types';
import type { OpportunityRecord, ScoreSnapshot } from '@/src/lib/app-types';
import { newId } from '@/src/lib/ids';

const job: JobRecord = {
  id: '00000000-0000-0000-0000-000000000001',
  jobCode: 'JOB-001',
  opportunityId: '00000000-0000-0000-0000-000000000002',
  title: 'Parser repair',
  status: 'IN_PROGRESS',
  priority: 'P1',
  score: 88.5,
  estimatedValueUsd: 300,
  actualRevenueUsd: 275,
  risk: 'LOW',
  agreedScope: { deliverables: ['fix parser'], nested: { keep: true } },
  agreedPrice: 300,
  currency: 'USD',
  agreedDeadline: '2026-08-30T00:00:00.000Z',
  createdAt: '2026-08-20T00:00:00.000Z',
  updatedAt: '2026-08-21T00:00:00.000Z',
  startedAt: '2026-08-21T01:00:00.000Z',
  completedAt: null,
  nextAction: 'Run the regression suite.',
  nextActionOwner: 'codex',
  humanGate: 'NONE',
  blockedBy: [],
  branchOrPr: 'fix/parser',
  lastCheckpointCommit: 'abc123',
  acceptanceCriteria: [
    {
      id: '00000000-0000-0000-0000-000000000003',
      description: 'Quoted commas parse correctly',
      verificationMethod: 'pnpm test',
      status: 'PASS',
      evidence: 'tests/parser.test.ts',
    },
  ],
  tasks: [
    {
      id: '00000000-0000-0000-0000-000000000004',
      title: 'Add regression test',
      description: null,
      agentRole: 'Builder Agent',
      status: 'DONE',
      estimateMinutes: 30,
      actualMinutes: 25,
      blockedReason: null,
    },
  ],
  latestReview: {
    id: '00000000-0000-0000-0000-000000000005',
    jobId: '00000000-0000-0000-0000-000000000001',
    verdict: 'APPROVED_INTERNAL',
    summary: 'Acceptance criteria verified.',
    criteriaResults: [
      { criterion: 'Quoted commas parse correctly', result: 'PASS', evidence: 'test output' },
    ],
    tests: ['pnpm test'],
    securityFindings: [],
    reviewer: 'QA Agent',
    findings: [],
    requiredChanges: [],
    createdAt: '2026-08-21T02:00:00.000Z',
  },
  delivery: null,
  economicOutcome: null,
};

describe('PostgresAppStore deterministic mapping', () => {
  it('round-trips JobRecord fields through the JSON storage envelope', () => {
    const serialized = serializeJobStorage(job);

    expect(serialized).toMatchObject({
      [JOB_STORAGE_MARKER]: {
        version: 1,
        scope: job.agreedScope,
        metadata: {
          score: 88.5,
          actualRevenueUsd: 275,
          latestReview: job.latestReview,
        },
      },
    });

    const mapped = mapJobRow(
      {
        id: job.id,
        job_code: job.jobCode,
        opportunity_id: job.opportunityId,
        title: job.title,
        status: job.status,
        agreed_scope: serialized,
        agreed_price: job.agreedPrice,
        currency: job.currency,
        agreed_deadline: job.agreedDeadline,
        created_at: job.createdAt,
        updated_at: job.updatedAt,
        started_at: job.startedAt,
        completed_at: job.completedAt,
      },
      {
        acceptanceCriteria: job.acceptanceCriteria,
        tasks: job.tasks,
        latestReview: job.latestReview,
      },
    );

    expect(mapped).toEqual(job);
  });

  it('maps PostgreSQL JSON and numeric representations to AppState types', () => {
    const mapped = mapOpportunityRow({
      id: '00000000-0000-0000-0000-000000000010',
      source: 'manual',
      external_id: 'source-10',
      source_url: null,
      title: 'CSV import',
      original_description: 'Import a CSV file.',
      normalized_summary: 'CSV import fix',
      category: 'data_transformation',
      technologies: '["TypeScript","CSV"]',
      deliverables: ['parser'],
      inferred_acceptance_criteria: '["Rows are preserved"]',
      missing_information: '[]',
      budget_min: '100.00',
      budget_max: '250.00',
      currency: 'USD',
      explicit_deadline: null,
      discovered_at: new Date('2026-08-20T00:00:00.000Z'),
      posted_at: null,
      raw_metadata: '{"source":"fixture"}',
      status: 'SCORED',
      hard_filter_reason: null,
      duplicate_of: null,
      created_at: new Date('2026-08-20T00:00:00.000Z'),
      updated_at: new Date('2026-08-21T00:00:00.000Z'),
      latest_score: {
        id: '00000000-0000-0000-0000-000000000011',
        opportunity_id: '00000000-0000-0000-0000-000000000010',
        scoring_version: 'score_v1',
        technical_fit: '90',
        completion_probability: '0.8',
        overall_score: '84.5',
        assumptions: '["clear scope"]',
        risk_flags: '["platform_risk"]',
        explanation: '["good fit"]',
        created_at: new Date('2026-08-21T00:00:00.000Z'),
      },
    });

    expect(mapped.technologies).toEqual(['TypeScript', 'CSV']);
    expect(mapped.budgetMax).toBe(250);
    expect(mapped.latestScore?.overallScore).toBe(84.5);
    expect(mapped.latestScore?.riskFlags).toEqual(['platform_risk']);
    expect(mapped.discoveredAt).toBe('2026-08-20T00:00:00.000Z');
  });

  it('accepts an injected Sql-shaped client without reading DATABASE_URL', () => {
    const fakeSql = Object.assign(
      (() => Promise.resolve([])) as unknown as (...args: unknown[]) => unknown,
      {
        begin: async <T>(callback: (tx: never) => T | Promise<T>) => callback(undefined as never),
        end: async () => undefined,
      },
    );

    const store = new PostgresAppStore(fakeSql as never);
    expect(store).toBeInstanceOf(PostgresAppStore);
  });

  it.skipIf(!process.env.DATABASE_URL)(
    'round-trips an opportunity and score against PostgreSQL',
    async () => {
      const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
      const store = new PostgresAppStore(sql);
      const opportunityId = newId();
      const opportunity: OpportunityRecord = {
        id: opportunityId,
        source: 'manual',
        externalId: `postgres-test-${opportunityId}`,
        sourceUrl: 'https://example.com/postgres-test',
        title: 'PostgreSQL adapter smoke test',
        originalDescription: 'Round-trip one durable opportunity through the PostgreSQL adapter.',
        normalizedSummary: 'PostgreSQL adapter smoke test',
        category: 'testing',
        technologies: ['TypeScript', 'PostgreSQL'],
        deliverables: ['Persisted opportunity'],
        inferredAcceptanceCriteria: ['The score survives a fresh read.'],
        missingInformation: [],
        budgetMin: 100,
        budgetMax: 150,
        currency: 'USD',
        explicitDeadline: null,
        discoveredAt: new Date().toISOString(),
        postedAt: null,
        rawMetadata: { test: true },
        status: 'SCORED',
        hardFilterReason: null,
        duplicateOf: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        latestScore: null,
        scoreHistory: [],
      };
      const score: ScoreSnapshot = {
        id: newId(),
        opportunityId,
        scoringVersion: 'score_v1',
        components: { technical_fit: 90 },
        overallScore: 84,
        estimatedAiMinutes: 20,
        estimatedHumanMinutes: 10,
        estimatedTokens: 1000,
        completionProbability: 0.9,
        winProbability: 0.5,
        expectedNetRevenue: 50,
        expectedRevenuePer1mTokens: 50000,
        assumptions: ['Test fixture only'],
        riskFlags: [],
        explanation: ['Test fixture only'],
        createdAt: new Date().toISOString(),
      };
      try {
        await store.upsertOpportunity(opportunity);
        await store.saveScore(opportunityId, score);
        const restored = await store.getOpportunity(opportunityId);
        expect(restored?.latestScore?.id).toBe(score.id);
        expect(restored?.scoreHistory.map((item) => item.id)).toContain(score.id);
        expect(restored?.rawMetadata).toEqual({ test: true });
        const jsonShape = await sql`
          SELECT
            jsonb_typeof(raw_metadata) AS metadata_type,
            raw_metadata->>'test' AS metadata_test,
            jsonb_typeof(technologies) AS technologies_type
          FROM opportunities
          WHERE id = ${opportunityId}
        `;
        expect(jsonShape[0]?.metadata_type).toBe('object');
        expect(jsonShape[0]?.metadata_test).toBe('true');
        expect(jsonShape[0]?.technologies_type).toBe('array');
      } finally {
        await sql`DELETE FROM opportunities WHERE id = ${opportunityId}`;
        await sql.end({ timeout: 5 });
      }
    },
    30_000,
  );
});
