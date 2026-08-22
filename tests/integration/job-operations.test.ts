import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ingestAndPersist,
  markReadyForReview,
  requestApplyApproval,
  requestDeliveryApproval,
  saveQaResult,
  shortlistOpportunity,
  startJob,
} from '@/src/lib/operations';
import { resetStoreForTests, getStore } from '@/src/lib/store';

let root = '';
let previousDataPath: string | undefined;
let previousJobsRoot: string | undefined;
let previousBoardPath: string | undefined;
let previousAppStore: string | undefined;

const sample = (externalId: string, title: string) => ({
  source: 'manual',
  externalId,
  title,
  description:
    'Fix the reproducible parser bug, add automated tests, and document the expected output.',
  sourceUrl: `https://example.com/${externalId}`,
  budgetMin: 180,
  budgetMax: 300,
  currency: 'USD',
  category: 'python_bugfix',
  technologies: ['Python', 'CSV', 'pytest'],
  acceptanceCriteria: ['The sample input passes', 'The regression test passes'],
});

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'codex-job-hunter-'));
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

describe('durable job operations', () => {
  it('creates isolated workspace and persistent Apply Gate decision state', async () => {
    const result = await ingestAndPersist([sample('job-1', 'Parser fix one')]);
    const opportunity = result.records[0];
    const job = await shortlistOpportunity(opportunity.id);
    await requestApplyApproval(opportunity.id);

    const state = await readFile(path.join(root, 'jobs', job.jobCode, 'STATE.md'), 'utf8');
    const activity = await readFile(path.join(root, 'jobs', job.jobCode, 'ACTIVITY.md'), 'utf8');
    const decisions = await readFile(path.join(root, 'jobs', job.jobCode, 'DECISIONS.md'), 'utf8');
    const stored = await getStore().getJob(job.id);
    const approvals = await getStore().listPendingApprovals();

    expect(state).toContain('status: "REQUIRES_APPLY_APPROVAL"');
    expect(activity).toContain('NEEDS_DECISION');
    expect(decisions).toContain('manual application');
    expect(stored?.humanGate).toBe('APPLY');
    expect(approvals).toHaveLength(1);
    expect(approvals[0].approvalType).toBe('APPLY');
  });

  it('keeps two job workspaces independently inspectable', async () => {
    const result = await ingestAndPersist([
      sample('job-1', 'Parser fix one'),
      sample('job-2', 'Parser fix two'),
    ]);
    const first = await shortlistOpportunity(result.records[0].id);
    const second = await shortlistOpportunity(result.records[1].id);
    const firstState = await readFile(path.join(root, 'jobs', first.jobCode, 'STATE.md'), 'utf8');
    const secondState = await readFile(path.join(root, 'jobs', second.jobCode, 'STATE.md'), 'utf8');

    expect(first.jobCode).not.toBe(second.jobCode);
    expect(firstState).toContain('Parser fix one');
    expect(firstState).not.toContain('Parser fix two');
    expect(secondState).toContain('Parser fix two');
    expect(secondState).not.toContain('Parser fix one');
  });

  it('enforces the default three-job IN_PROGRESS WIP limit', async () => {
    const result = await ingestAndPersist(
      ['alpha', 'beta', 'gamma', 'delta'].map((label) =>
        sample(`job-${label}`, `Parser fix ${label}`),
      ),
    );
    const jobs = [];
    for (const record of result.records) jobs.push(await shortlistOpportunity(record.id));
    for (const job of jobs)
      await getStore().updateJob(job.id, { status: 'PLANNING' }, 'Test setup for WIP enforcement.');
    await startJob(jobs[0].id);
    await startJob(jobs[1].id);
    await startJob(jobs[2].id);
    await expect(startJob(jobs[3].id)).rejects.toThrow('WIP limit reached');
    expect(
      (await getStore().listJobs()).filter((job) => job.status === 'IN_PROGRESS'),
    ).toHaveLength(3);
  });

  it('moves a simulated active job through independent QA to the Delivery Gate', async () => {
    const result = await ingestAndPersist([sample('review-job', 'Reviewable parser fix')]);
    const job = await shortlistOpportunity(result.records[0].id);
    await getStore().updateJob(job.id, { status: 'PLANNING' }, 'Test setup for review lifecycle.');
    await startJob(job.id);
    await markReadyForReview(job.id);
    await saveQaResult(job.id, true, 'Acceptance criteria mapped and tests pass.', [
      'pnpm test',
      'pnpm typecheck',
    ]);
    await requestDeliveryApproval(job.id);

    const stored = await getStore().getJob(job.id);
    const pending = await getStore().listPendingApprovals();
    expect(stored?.status).toBe('REQUIRES_DELIVERY_APPROVAL');
    expect(stored?.latestReview?.verdict).toBe('APPROVED_INTERNAL');
    expect(
      pending.some((approval) => approval.jobId === job.id && approval.approvalType === 'DELIVERY'),
    ).toBe(true);
  });
});
