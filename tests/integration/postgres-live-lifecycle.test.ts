import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  decideApproval,
  ingestAndPersist,
  markAccepted,
  markPaid,
  markReadyForReview,
  markWon,
  recordManualApplication,
  requestApplyApproval,
  requestDeliveryApproval,
  saveQaResult,
  shortlistOpportunity,
  startJob,
} from '@/src/lib/operations';
import postgres from 'postgres';
import { getStore, resetStoreForTestsAsync } from '@/src/lib/store';

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)('live PostgreSQL lifecycle durability', () => {
  let root = '';
  let previousAppStore: string | undefined;
  let previousJobsRoot: string | undefined;
  let previousBoardPath: string | undefined;
  let previousGithubToken: string | undefined;
  let previousGithubRepository: string | undefined;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'codex-job-hunter-postgres-live-'));
    previousAppStore = process.env.APP_STORE;
    previousJobsRoot = process.env.JOBS_ROOT;
    previousBoardPath = process.env.CONTROL_BOARD_PATH;
    previousGithubToken = process.env.GITHUB_TOKEN;
    previousGithubRepository = process.env.GITHUB_REPOSITORY;
    process.env.APP_STORE = 'postgres';
    process.env.JOBS_ROOT = path.join(root, 'jobs');
    process.env.CONTROL_BOARD_PATH = path.join(root, 'CONTROL_BOARD.md');
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_REPOSITORY;
    await resetStoreForTestsAsync();
  });

  afterEach(async () => {
    await resetStoreForTestsAsync();
    await rm(root, { recursive: true, force: true });
    if (previousAppStore === undefined) delete process.env.APP_STORE;
    else process.env.APP_STORE = previousAppStore;
    if (previousJobsRoot === undefined) delete process.env.JOBS_ROOT;
    else process.env.JOBS_ROOT = previousJobsRoot;
    if (previousBoardPath === undefined) delete process.env.CONTROL_BOARD_PATH;
    else process.env.CONTROL_BOARD_PATH = previousBoardPath;
    if (previousGithubToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = previousGithubToken;
    if (previousGithubRepository === undefined) delete process.env.GITHUB_REPOSITORY;
    else process.env.GITHUB_REPOSITORY = previousGithubRepository;
  });

  it('persists the complete gated lifecycle and reads it after a client restart', async () => {
    const externalId = `postgres-live-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const result = await ingestAndPersist([
      {
        source: 'manual',
        externalId,
        sourceUrl: `https://example.com/${externalId}`,
        title: 'Live PostgreSQL lifecycle smoke test',
        description:
          'Fix a reproducible TypeScript parser bug, add a regression test, and document the expected output.',
        budgetMin: 180,
        budgetMax: 300,
        currency: 'USD',
        category: 'typescript_bugfix',
        technologies: ['TypeScript', 'PostgreSQL', 'testing'],
        deliverables: ['Parser fix', 'Regression test', 'Short handoff note'],
        acceptanceCriteria: ['The regression test passes', 'The expected output is documented'],
      },
    ]);
    const opportunity = result.records[0];
    const shortlisted = await shortlistOpportunity(opportunity.id);

    await requestApplyApproval(opportunity.id);
    let approval = (await getStore().listPendingApprovals()).find(
      (item) => item.opportunityId === opportunity.id && item.approvalType === 'APPLY',
    );
    expect(approval).toBeDefined();
    await decideApproval(approval!.id, 'APPROVED', 'Live integration test approval.');
    await recordManualApplication(opportunity.id);

    await markWon(opportunity.id);
    approval = (await getStore().listPendingApprovals()).find(
      (item) => item.opportunityId === opportunity.id && item.approvalType === 'PRICE',
    );
    expect(approval).toBeDefined();
    await decideApproval(approval!.id, 'APPROVED', 'Live integration test price approval.');
    approval = (await getStore().listPendingApprovals()).find(
      (item) => item.opportunityId === opportunity.id && item.approvalType === 'CONTRACT',
    );
    expect(approval).toBeDefined();
    await decideApproval(approval!.id, 'APPROVED', 'Live integration test contract approval.');

    let job = await getStore().getJob(shortlisted.id);
    expect(job?.status).toBe('PLANNING');
    await startJob(shortlisted.id);
    await markReadyForReview(shortlisted.id);
    await saveQaResult(shortlisted.id, true, 'Live PostgreSQL QA evidence persisted.', [
      'pnpm test',
      'pnpm typecheck',
    ]);
    await requestDeliveryApproval(shortlisted.id);

    await resetStoreForTestsAsync();
    job = await getStore().getJob(shortlisted.id);
    expect(job?.status).toBe('REQUIRES_DELIVERY_APPROVAL');
    expect(job?.latestReview?.verdict).toBe('APPROVED_INTERNAL');
    expect(job?.delivery?.status).toBe('DRAFT');
    approval = (await getStore().listPendingApprovals()).find(
      (item) => item.opportunityId === opportunity.id && item.approvalType === 'DELIVERY',
    );
    expect(approval).toBeDefined();
    await decideApproval(approval!.id, 'APPROVED', 'Live integration test delivery approval.');
    await markAccepted(shortlisted.id);
    await markPaid(shortlisted.id, 220);

    await resetStoreForTestsAsync();
    const restored = await getStore().getJob(shortlisted.id);
    const restoredOpportunity = await getStore().getOpportunity(opportunity.id);
    expect(restored?.status).toBe('PAID');
    expect(restored?.economicOutcome?.netRevenue).toBe(220);
    expect(restoredOpportunity?.status).toBe('PAID');
    expect(
      await readFile(path.join(root, 'jobs', shortlisted.jobCode, 'STATE.md'), 'utf8'),
    ).toContain('status: "PAID"');

    const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
    try {
      const rows = await sql`
        SELECT
          (SELECT COUNT(*)::int FROM opportunities WHERE id = ${opportunity.id}) AS opportunities,
          (SELECT COUNT(*)::int FROM jobs WHERE id = ${shortlisted.id}) AS jobs,
          (SELECT COUNT(*)::int FROM applications WHERE opportunity_id = ${opportunity.id}) AS applications,
          (SELECT COUNT(*)::int FROM job_activities WHERE job_id = ${shortlisted.id}) AS activities,
          (SELECT COUNT(*)::int FROM state_transitions WHERE entity_id IN (${opportunity.id}, ${shortlisted.id})) AS transitions
      `;
      expect(Number(rows[0].opportunities)).toBe(1);
      expect(Number(rows[0].jobs)).toBe(1);
      expect(Number(rows[0].applications)).toBe(1);
      expect(Number(rows[0].activities)).toBeGreaterThan(0);
      expect(Number(rows[0].transitions)).toBeGreaterThan(0);
    } finally {
      await sql.begin(async (tx) => {
        const jobs = await tx`SELECT id FROM jobs WHERE opportunity_id = ${opportunity.id}`;
        for (const row of jobs) {
          await tx`DELETE FROM state_transitions WHERE entity_id = ${row.id}`;
          await tx`DELETE FROM agent_runs WHERE job_id = ${row.id}`;
        }
        await tx`DELETE FROM state_transitions WHERE entity_id = ${opportunity.id}`;
        await tx`DELETE FROM agent_runs WHERE opportunity_id = ${opportunity.id}`;
        await tx`DELETE FROM approvals WHERE opportunity_id = ${opportunity.id}`;
        await tx`DELETE FROM jobs WHERE opportunity_id = ${opportunity.id}`;
        await tx`DELETE FROM opportunities WHERE id = ${opportunity.id}`;
      });
      await sql.end({ timeout: 5 });
    }
  }, 300_000);
});
