import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ingestAndPersist, shortlistOpportunity } from '@/src/lib/operations';
import { reconcileOperationalState } from '@/src/lib/reconciliation';
import { resetStoreForTests, getStore } from '@/src/lib/store';
import { workspaceFilePath } from '@/src/lib/job-workspace';

let root = '';
let previousDataPath: string | undefined;
let previousJobsRoot: string | undefined;
let previousBoardPath: string | undefined;
let previousAppStore: string | undefined;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'codex-job-hunter-reconcile-'));
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

describe('operational reconciliation', () => {
  it('flags DB/state/file/board conflicts and persists them for review', async () => {
    const result = await ingestAndPersist([
      {
        source: 'manual',
        externalId: 'conflict-1',
        title: 'Conflict detection',
        description: 'Test reconciliation of a managed job.',
        sourceUrl: 'https://example.com/conflict-1',
        budgetMin: 200,
        budgetMax: 300,
        currency: 'USD',
        category: 'testing',
      },
    ]);
    const job = await shortlistOpportunity(result.records[0].id);
    const statePath = workspaceFilePath(job.jobCode, 'STATE.md');
    const state = await readFile(statePath, 'utf8');
    await writeFile(
      statePath,
      state.replace('status: "SHORTLISTED"', 'status: "IN_PROGRESS"'),
      'utf8',
    );
    await rm(workspaceFilePath(job.jobCode, 'TASKS.md'));
    await writeFile(path.join(root, 'CONTROL_BOARD.md'), '# stale board\n', 'utf8');

    const conflicts = await reconcileOperationalState({ persist: true, ledgerReader: null });
    const types = conflicts.map((item) => item.conflictType);
    expect(types).toContain('DB_STATE_MISMATCH');
    expect(types).toContain('WORKSPACE_FILE_MISSING');
    expect(types).toContain('CONTROL_BOARD_STALE');
    expect((await getStore().listConflicts()).length).toBeGreaterThanOrEqual(3);
  });

  it('flags a missing GitHub ledger workspace without choosing a side', async () => {
    const result = await ingestAndPersist([
      {
        source: 'manual',
        externalId: 'conflict-2',
        title: 'Missing GitHub ledger',
        description: 'Test remote ledger reconciliation.',
        sourceUrl: 'https://example.com/conflict-2',
        budgetMin: 200,
        budgetMax: 300,
        currency: 'USD',
        category: 'testing',
      },
    ]);
    const job = await shortlistOpportunity(result.records[0].id);
    const conflicts = await reconcileOperationalState({
      persist: false,
      ledgerReader: { read: async () => null },
    });
    expect(
      conflicts.some(
        (item) => item.jobId === job.id && item.conflictType === 'GITHUB_WORKSPACE_MISSING',
      ),
    ).toBe(true);
  });
});
