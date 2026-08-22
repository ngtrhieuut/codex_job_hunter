import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ingestAndPersist,
  markReadyForReview,
  markPaid,
  requestApplyApproval,
  saveQaResult,
  shortlistOpportunity,
  startJob,
} from '@/src/lib/operations';
import { resetStoreForTests, getStore } from '@/src/lib/store';
import type { EconomicOutcomeRecord } from '@/src/lib/app-types';

let root = '';
let previousDataPath: string | undefined;
let previousJobsRoot: string | undefined;
let previousBoardPath: string | undefined;
let previousAppStore: string | undefined;

const sample = (externalId: string, title: string) => ({
  source: 'manual',
  externalId,
  title,
  description: `Fix the reproducible parser bug for ${externalId}; add automated tests and document the expected output for this independent workstream.`,
  sourceUrl: `https://example.com/${externalId}`,
  budgetMin: 180,
  budgetMax: 300,
  currency: 'USD',
  category: 'python_bugfix',
  technologies: ['Python', 'CSV', 'pytest'],
  acceptanceCriteria: ['The sample input passes', 'The regression test passes'],
});

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'codex-job-hunter-restart-'));
  previousDataPath = process.env.DATA_STORE_PATH;
  previousJobsRoot = process.env.JOBS_ROOT;
  previousBoardPath = process.env.CONTROL_BOARD_PATH;
  previousAppStore = process.env.APP_STORE;
  process.env.APP_STORE = 'json';
  process.env.DATA_STORE_PATH = path.join(root, 'store.json');
  process.env.JOBS_ROOT = path.join(root, 'jobs');
  process.env.CONTROL_BOARD_PATH = path.join(root, 'CONTROL_BOARD.md');
  resetStoreForTests();
});

afterEach(async () => {
  resetStoreForTests();
  await rm(root, { recursive: true, force: true });
  if (previousDataPath === undefined) delete process.env.DATA_STORE_PATH;
  else process.env.DATA_STORE_PATH = previousDataPath;
  if (previousJobsRoot === undefined) delete process.env.JOBS_ROOT;
  else process.env.JOBS_ROOT = previousJobsRoot;
  if (previousBoardPath === undefined) delete process.env.CONTROL_BOARD_PATH;
  else process.env.CONTROL_BOARD_PATH = previousBoardPath;
  if (previousAppStore === undefined) delete process.env.APP_STORE;
  else process.env.APP_STORE = previousAppStore;
});

describe('restart durability', () => {
  it('preserves multiple jobs and their states after store reinitialization', async () => {
    const result = await ingestAndPersist([
      sample('restart-alpha', 'Restart parser Alpha'),
      sample('restart-beta', 'Restart parser Beta'),
    ]);
    const first = await shortlistOpportunity(result.records[0].id);
    const second = await shortlistOpportunity(result.records[1].id);
    await getStore().updateJob(first.id, { status: 'PLANNING' }, 'Test setup.');
    await startJob(first.id);

    resetStoreForTests();
    const jobs = await getStore().listJobs();
    expect(jobs).toHaveLength(2);
    expect(jobs.find((job) => job.id === first.id)?.status).toBe('IN_PROGRESS');
    expect(jobs.find((job) => job.id === second.id)?.status).toBe('SHORTLISTED');
    expect(await readFile(path.join(root, 'CONTROL_BOARD.md'), 'utf8')).toContain(first.jobCode);
  });

  it('preserves a pending Apply Gate, decision request, and next action', async () => {
    const result = await ingestAndPersist([sample('approval-restart', 'Approval restart')]);
    const job = await shortlistOpportunity(result.records[0].id);
    await requestApplyApproval(result.records[0].id);

    resetStoreForTests();
    const restored = await getStore().getJob(job.id);
    const approvals = await getStore().listPendingApprovals();
    const state = await readFile(path.join(root, 'jobs', job.jobCode, 'STATE.md'), 'utf8');
    const decisions = await readFile(path.join(root, 'jobs', job.jobCode, 'DECISIONS.md'), 'utf8');
    expect(restored?.status).toBe('REQUIRES_APPLY_APPROVAL');
    expect(restored?.humanGate).toBe('APPLY');
    expect(restored?.nextActionOwner).toBe('human');
    expect(approvals[0]?.decision).toBe('PENDING');
    expect(state).toContain('human_gate: "APPLY"');
    expect(decisions).toContain('Final decision: pending');
  });

  it('keeps the three-job WIP block after restart', async () => {
    const result = await ingestAndPersist(
      ['alpha', 'beta', 'gamma', 'delta'].map((label) => sample(`wip-${label}`, `WIP ${label}`)),
    );
    const jobs = [];
    for (const record of result.records) jobs.push(await shortlistOpportunity(record.id));
    for (const job of jobs)
      await getStore().updateJob(job.id, { status: 'PLANNING' }, 'Test setup.');
    await startJob(jobs[0].id);
    await startJob(jobs[1].id);
    await startJob(jobs[2].id);

    resetStoreForTests();
    await expect(startJob(jobs[3].id)).rejects.toThrow('WIP limit reached');
    expect(
      (await getStore().listJobs()).filter((job) => job.status === 'IN_PROGRESS'),
    ).toHaveLength(3);
  });

  it('preserves QA evidence and review state after restart', async () => {
    const result = await ingestAndPersist([sample('qa-restart', 'QA restart')]);
    const job = await shortlistOpportunity(result.records[0].id);
    await getStore().updateJob(job.id, { status: 'PLANNING' }, 'Test setup.');
    await startJob(job.id);
    await markReadyForReview(job.id);
    await saveQaResult(job.id, true, 'QA evidence survived.', ['pnpm test', 'pnpm typecheck']);

    resetStoreForTests();
    const restored = await getStore().getJob(job.id);
    const review = await readFile(path.join(root, 'jobs', job.jobCode, 'REVIEW.md'), 'utf8');
    expect(restored?.status).toBe('READY_FOR_HUMAN_REVIEW');
    expect(restored?.latestReview?.verdict).toBe('APPROVED_INTERNAL');
    expect(restored?.latestReview?.tests).toContain('pnpm test');
    expect(review).toContain('QA evidence survived.');
  });

  it('preserves completion and economic outcome records after restart', async () => {
    const result = await ingestAndPersist([sample('economic-restart', 'Economic restart')]);
    const job = await shortlistOpportunity(result.records[0].id);
    const outcome: EconomicOutcomeRecord = {
      id: 'economic-restart-record',
      jobId: job.id,
      grossRevenue: 250,
      platformFees: 25,
      externalCosts: 5,
      netRevenue: 220,
      tokenCount: 12000,
      estimatedAiMinutes: 45,
      actualHumanMinutes: 35,
      revisionsCount: 1,
      paymentStatus: 'PAID',
      paidAt: '2026-08-22T01:00:00.000Z',
      createdAt: '2026-08-22T00:00:00.000Z',
      updatedAt: '2026-08-22T01:00:00.000Z',
    };
    await getStore().saveEconomicOutcome(outcome);

    resetStoreForTests();
    const restored = await getStore().getJob(job.id);
    const metrics = await getStore().metrics();
    expect(restored?.economicOutcome?.netRevenue).toBe(220);
    expect(restored?.economicOutcome?.actualHumanMinutes).toBe(35);
    expect(metrics.grossRevenueUsd).toBe(250);
  });
});
