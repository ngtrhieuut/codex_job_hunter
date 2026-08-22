import { readFile } from 'node:fs/promises';
import {
  controlBoardFilePath,
  githubControlBoardPath,
  readWorkspaceFrontmatter,
  repositoryWorkspacePath,
  syncControlBoard,
  workspaceFilePath,
  REQUIRED_WORKSPACE_FILES,
} from './job-workspace';
import type { AppStore } from './store';
import { getStore } from './store';
import type { ReconciliationConflictRecord } from './app-types';

export interface LedgerReader {
  read(repositoryPath: string): Promise<string | null>;
}

export function createGitHubLedgerReader(fetchImpl: typeof fetch = fetch): LedgerReader | null {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const branch = process.env.GITHUB_BRANCH || 'main';
  if (!token || !repository) return null;
  return {
    async read(repositoryPath: string): Promise<string | null> {
      const endpoint = `https://api.github.com/repos/${repository}/contents/${repositoryPath.replaceAll('\\', '/')}`;
      const response = await fetchImpl(`${endpoint}?ref=${encodeURIComponent(branch)}`, {
        headers: {
          Accept: 'application/vnd.github.raw+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`GitHub ledger read failed (${response.status}): ${await response.text()}`);
      }
      return response.text();
    },
  };
}

export interface ReconciliationOptions {
  store?: AppStore;
  ledgerReader?: LedgerReader | null;
  persist?: boolean;
}

function conflict(
  jobId: string | null,
  conflictType: ReconciliationConflictRecord['conflictType'],
  details: string,
  severity: ReconciliationConflictRecord['severity'] = 'BLOCKING',
): Omit<ReconciliationConflictRecord, 'id' | 'detectedAt' | 'resolvedAt'> {
  return { jobId, conflictType, details, severity };
}

export async function reconcileOperationalState(
  options: ReconciliationOptions = {},
): Promise<ReconciliationConflictRecord[]> {
  const store = options.store || getStore();
  const ledgerReader =
    options.ledgerReader === undefined ? createGitHubLedgerReader() : options.ledgerReader;
  const detected: Array<Omit<ReconciliationConflictRecord, 'id' | 'detectedAt' | 'resolvedAt'>> =
    [];
  const jobs = await store.listJobs();

  for (const job of jobs) {
    const frontmatter = await readWorkspaceFrontmatter(job.jobCode);
    if (!frontmatter) {
      detected.push(
        conflict(
          job.id,
          'WORKSPACE_MISSING',
          `Missing local workspace or STATE.md for ${job.jobCode}.`,
        ),
      );
      continue;
    }
    if (frontmatter.status && frontmatter.status !== job.status) {
      detected.push(
        conflict(
          job.id,
          'DB_STATE_MISMATCH',
          `Database status=${job.status}, workspace STATE.md status=${frontmatter.status}.`,
        ),
      );
    }
    if (frontmatter.human_gate && frontmatter.human_gate !== job.humanGate) {
      detected.push(
        conflict(
          job.id,
          'DB_HUMAN_GATE_MISMATCH',
          `Database human_gate=${job.humanGate}, workspace STATE.md human_gate=${frontmatter.human_gate}.`,
        ),
      );
    }
    for (const filename of REQUIRED_WORKSPACE_FILES) {
      try {
        await readFile(workspaceFilePath(job.jobCode, filename), 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        detected.push(
          conflict(
            job.id,
            'WORKSPACE_FILE_MISSING',
            `Missing local ${filename} for ${job.jobCode}.`,
          ),
        );
      }
    }
    if (ledgerReader) {
      const missingRemoteFiles: string[] = [];
      for (const filename of REQUIRED_WORKSPACE_FILES) {
        const repositoryPath = repositoryWorkspacePath(job.jobCode, filename);
        if ((await ledgerReader.read(repositoryPath)) === null) {
          missingRemoteFiles.push(repositoryPath);
        }
      }
      if (missingRemoteFiles.length) {
        detected.push(
          conflict(
            job.id,
            'GITHUB_WORKSPACE_MISSING',
            `GitHub ledger is missing required files: ${missingRemoteFiles.join(', ')}.`,
          ),
        );
      }
    }
  }

  let board: string | null = null;
  try {
    board = await readFile(controlBoardFilePath(), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const currentJobs = jobs.filter(
    (job) => !['CLOSED_WON', 'CLOSED_LOST', 'ARCHIVED'].includes(job.status),
  );
  if (!board) {
    detected.push(conflict(null, 'CONTROL_BOARD_STALE', 'CONTROL_BOARD.md is missing.'));
  } else {
    for (const job of currentJobs) {
      if (!board.includes(job.jobCode) || !board.includes(job.updatedAt)) {
        detected.push(
          conflict(
            job.id,
            'CONTROL_BOARD_STALE',
            `CONTROL_BOARD.md does not expose the current ${job.jobCode} state timestamp ${job.updatedAt}.`,
            'WARNING',
          ),
        );
      }
    }
  }

  const persisted: ReconciliationConflictRecord[] = [];
  for (const item of detected) {
    persisted.push(
      options.persist === false
        ? ({ ...item, id: '', detectedAt: '', resolvedAt: null } as ReconciliationConflictRecord)
        : await store.saveConflict(item),
    );
  }
  return persisted;
}

export async function regenerateControlBoard(store: AppStore = getStore()): Promise<void> {
  await syncControlBoard(await store.dashboard());
}

export function githubLedgerControlBoardPath(): string {
  return githubControlBoardPath();
}
