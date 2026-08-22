import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  checkpointFilesToGitHub,
  controlBoardFilePath,
  readWorkspaceCheckpointFiles,
  repositoryWorkspacePath,
  syncControlBoard,
  workspaceFilePath,
} from '@/src/lib/job-workspace';
import { getStore, resetStoreForTests } from '@/src/lib/store';
import { ingestAndPersist, shortlistOpportunity } from '@/src/lib/operations';

let root = '';
let previousDataPath: string | undefined;
let previousJobsRoot: string | undefined;
let previousBoardPath: string | undefined;
let previousAppStore: string | undefined;
let previousToken: string | undefined;
let previousRepository: string | undefined;
let previousBranch: string | undefined;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'codex-job-hunter-checkpoint-'));
  previousDataPath = process.env.DATA_STORE_PATH;
  previousJobsRoot = process.env.JOBS_ROOT;
  previousBoardPath = process.env.CONTROL_BOARD_PATH;
  previousAppStore = process.env.APP_STORE;
  previousToken = process.env.GITHUB_TOKEN;
  previousRepository = process.env.GITHUB_REPOSITORY;
  previousBranch = process.env.GITHUB_BRANCH;
  process.env.APP_STORE = 'json';
  process.env.DATA_STORE_PATH = path.join(root, 'store.json');
  process.env.JOBS_ROOT = path.join(root, 'isolated-jobs');
  process.env.CONTROL_BOARD_PATH = path.join(root, 'isolated-board.md');
  delete process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_REPOSITORY;
  delete process.env.GITHUB_BRANCH;
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
  if (previousToken === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = previousToken;
  if (previousRepository === undefined) delete process.env.GITHUB_REPOSITORY;
  else process.env.GITHUB_REPOSITORY = previousRepository;
  if (previousBranch === undefined) delete process.env.GITHUB_BRANCH;
  else process.env.GITHUB_BRANCH = previousBranch;
});

describe('GitHub checkpoint coverage', () => {
  it('reads configured local paths and maps every required file to repository paths', async () => {
    const result = await ingestAndPersist([
      {
        source: 'manual',
        externalId: 'coverage-1',
        title: 'Checkpoint coverage',
        description: 'Persist a job checkpoint with tests and delivery evidence.',
        sourceUrl: 'https://example.com/coverage-1',
        budgetMin: 200,
        budgetMax: 300,
        currency: 'USD',
        category: 'testing',
        acceptanceCriteria: ['Checkpoint includes all records'],
      },
    ]);
    const job = await shortlistOpportunity(result.records[0].id);
    const nestedArtifactDirectory = path.join(
      root,
      'isolated-jobs',
      job.jobCode,
      'artifacts',
      'reports',
    );
    await mkdir(nestedArtifactDirectory, { recursive: true });
    await writeFile(path.join(nestedArtifactDirectory, 'evidence.txt'), 'evidence', 'utf8');
    const files = await readWorkspaceCheckpointFiles(job.jobCode);
    const paths = files.map((file) => file.repositoryPath);
    expect(files).toHaveLength(8);
    expect(paths).toEqual(
      expect.arrayContaining([
        repositoryWorkspacePath(job.jobCode, 'STATE.md'),
        repositoryWorkspacePath(job.jobCode, 'BRIEF.md'),
        repositoryWorkspacePath(job.jobCode, 'TASKS.md'),
        repositoryWorkspacePath(job.jobCode, 'DECISIONS.md'),
        repositoryWorkspacePath(job.jobCode, 'ACTIVITY.md'),
        repositoryWorkspacePath(job.jobCode, 'REVIEW.md'),
        repositoryWorkspacePath(job.jobCode, 'DELIVERY.md'),
      ]),
    );
    expect(paths).toContain(`jobs/${job.jobCode}/artifacts/reports/evidence.txt`);
    expect(files[0].localPath).toContain(path.join('isolated-jobs', job.jobCode));
    await syncControlBoard(await getStore().dashboard());
    expect(await readFile(controlBoardFilePath(), 'utf8')).toContain('Checkpoint coverage');
  });

  it('creates one Git Data API commit for all checkpoint files', async () => {
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.GITHUB_REPOSITORY = 'owner/repo';
    process.env.GITHUB_BRANCH = 'main';
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    let blobNumber = 0;
    const fetchMock: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      const method = init?.method || 'GET';
      if (url.includes('/git/ref/heads/')) {
        return new Response(JSON.stringify({ object: { sha: 'parent-sha' } }), { status: 200 });
      }
      if (url.includes('/git/commits/parent-sha')) {
        return new Response(JSON.stringify({ tree: { sha: 'parent-tree' } }), { status: 200 });
      }
      if (method === 'POST' && url.endsWith('/git/blobs')) {
        blobNumber += 1;
        return new Response(JSON.stringify({ sha: `blob-${blobNumber}` }), { status: 201 });
      }
      if (method === 'POST' && url.endsWith('/git/trees')) {
        return new Response(JSON.stringify({ sha: 'tree-sha' }), { status: 201 });
      }
      if (method === 'POST' && url.endsWith('/git/commits')) {
        return new Response(JSON.stringify({ sha: 'checkpoint-commit' }), { status: 201 });
      }
      if (method === 'PATCH' && url.includes('/git/refs/heads/')) {
        return new Response(JSON.stringify({ ref: 'refs/heads/main' }), { status: 200 });
      }
      return new Response('unexpected request', { status: 500 });
    };

    const files = [
      'STATE.md',
      'BRIEF.md',
      'TASKS.md',
      'DECISIONS.md',
      'ACTIVITY.md',
      'REVIEW.md',
      'DELIVERY.md',
      'CONTROL_BOARD.md',
    ].map((filename) => ({
      localPath: filename,
      repositoryPath: `jobs/JOB-001/${filename}`,
      content: `content for ${filename}`,
    }));
    const result = await checkpointFilesToGitHub(files, 'checkpoint(JOB-001): test', fetchMock);
    expect(result.synced).toBe(true);
    expect(result.commitSha).toBe('checkpoint-commit');
    expect(calls.filter((call) => call.url.endsWith('/git/commits')).length).toBe(1);
    expect(calls.filter((call) => call.init?.method === 'PATCH')).toHaveLength(1);
    const treeCall = calls.find((call) => call.url.endsWith('/git/trees'));
    const treePayload = JSON.parse(String(treeCall?.init?.body || '{}')) as {
      tree: Array<{ path: string }>;
    };
    expect(treePayload.tree.map((item) => item.path)).toHaveLength(8);
    expect(treePayload.tree.map((item) => item.path)).toContain('jobs/JOB-001/DECISIONS.md');
    expect(treePayload.tree.map((item) => item.path)).toContain('jobs/JOB-001/DELIVERY.md');
  });

  it('does not silently sync incomplete workspace files', async () => {
    const result = await ingestAndPersist([
      {
        source: 'manual',
        externalId: 'coverage-2',
        title: 'Missing file',
        description: 'A job with a required workspace.',
        sourceUrl: 'https://example.com/coverage-2',
        budgetMin: 200,
        budgetMax: 300,
        currency: 'USD',
        category: 'testing',
      },
    ]);
    const job = await shortlistOpportunity(result.records[0].id);
    await rm(workspaceFilePath(job.jobCode, 'DELIVERY.md'));
    await expect(readWorkspaceCheckpointFiles(job.jobCode)).rejects.toThrow();
  });
});
