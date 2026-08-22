import { appendFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { JobRecord, OpportunityRecord } from './app-types';
import { nowIso, slugify } from './ids';

export const REQUIRED_WORKSPACE_FILES = [
  'STATE.md',
  'BRIEF.md',
  'TASKS.md',
  'DECISIONS.md',
  'ACTIVITY.md',
  'REVIEW.md',
  'DELIVERY.md',
] as const;

export type RequiredWorkspaceFile = (typeof REQUIRED_WORKSPACE_FILES)[number];

function safeJobCode(jobCode: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(jobCode)) {
    throw new Error(`Unsafe job code: ${jobCode}`);
  }
  return jobCode;
}

function safeWorkspaceFilename(filename: string): string {
  if (
    !REQUIRED_WORKSPACE_FILES.includes(filename as RequiredWorkspaceFile) &&
    filename !== 'artifacts'
  ) {
    throw new Error(`Unsupported workspace filename: ${filename}`);
  }
  return filename;
}

export function workspaceRootPath(): string {
  return path.resolve(process.env.JOBS_ROOT || 'jobs');
}

export function controlBoardFilePath(): string {
  return path.resolve(process.env.CONTROL_BOARD_PATH || 'CONTROL_BOARD.md');
}

function githubWorkspaceRoot(): string {
  return (process.env.GITHUB_JOBS_ROOT || 'jobs').replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
}

export function githubControlBoardPath(): string {
  const configured = process.env.GITHUB_CONTROL_BOARD_PATH || 'CONTROL_BOARD.md';
  if (configured.startsWith('/') || configured.includes('..')) {
    throw new Error(`Unsafe GITHUB_CONTROL_BOARD_PATH: ${configured}`);
  }
  return configured.replaceAll('\\', '/').replace(/^\/+/, '');
}

function yamlValue(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value);
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(String(value));
}

function stateFrontmatter(job: JobRecord, opportunity: OpportunityRecord): string {
  const score = opportunity.latestScore?.overallScore || job.score || 0;
  const value = opportunity.latestScore?.expectedNetRevenue || job.estimatedValueUsd || 0;
  return [
    '---',
    `job_id: ${yamlValue(job.jobCode)}`,
    `source: ${yamlValue(opportunity.source)}`,
    `source_url: ${yamlValue(opportunity.sourceUrl)}`,
    `title: ${yamlValue(job.title)}`,
    `status: ${yamlValue(job.status)}`,
    `priority: ${yamlValue(job.priority)}`,
    'owner: "codex"',
    `created_at: ${yamlValue(job.createdAt)}`,
    `updated_at: ${yamlValue(job.updatedAt)}`,
    `job_score: ${yamlValue(score)}`,
    `estimated_value_usd: ${yamlValue(value)}`,
    `actual_revenue_usd: ${yamlValue(job.actualRevenueUsd)}`,
    `risk: ${yamlValue(job.risk)}`,
    `human_gate: ${yamlValue(job.humanGate)}`,
    `next_action: ${yamlValue(job.nextAction)}`,
    `next_action_owner: ${yamlValue(job.nextActionOwner)}`,
    `blocked_by: ${yamlValue(job.blockedBy)}`,
    `branch_or_pr: ${yamlValue(job.branchOrPr)}`,
    `last_checkpoint_commit: ${yamlValue(job.lastCheckpointCommit)}`,
    '---',
  ].join('\n');
}

function stateBody(job: JobRecord, event: string): string {
  const attention =
    job.humanGate !== 'NONE' ||
    ['BLOCKED_INTERNAL', 'BLOCKED_CLIENT', 'CHANGES_REQUESTED'].includes(job.status);
  return [
    '',
    '# Current State',
    '',
    '## Situation',
    `Job is currently **${job.status}**. ${event}`,
    '',
    '## Last meaningful change',
    `- ${event}`,
    '',
    '## Next action',
    `- ${job.nextAction} (owner: ${job.nextActionOwner})`,
    '',
    '## Attention',
    `- Human decision required: **${attention ? 'Yes' : 'No'}**`,
    `- Blocked: **${job.blockedBy.length ? 'Yes' : 'No'}**`,
    '',
  ].join('\n');
}

function activityEntry(type: string, summary: string, evidence: string, next: string): string {
  return [
    '',
    `## ${nowIso()} — CHECKPOINT-${Date.now()}`,
    `Type: ${type}`,
    'Actor: codex',
    `Summary: ${summary}`,
    `Evidence: ${evidence}`,
    `Next: ${next}`,
    '',
  ].join('\n');
}

function taskMarker(status: JobRecord['tasks'][number]['status']): string {
  if (status === 'DONE') return '[x]';
  if (status === 'IN_PROGRESS') return '[-]';
  if (status === 'BLOCKED') return '[!]';
  return '[ ]';
}

function renderTasks(job: JobRecord): string {
  const rows = job.tasks.length
    ? job.tasks
        .map(
          (task) =>
            `- ${taskMarker(task.status)} ${task.title} — owner: ${task.agentRole || 'codex'} — status: ${task.status}${task.blockedReason ? ` — blocker: ${task.blockedReason}` : ''}${task.description ? `\n  Evidence/notes: ${task.description}` : ''}`,
        )
        .join('\n')
    : '- [ ] No tasks recorded yet — owner: codex';
  return `# Job Tasks

Legend: \`[ ]\` pending · \`[-]\` in progress · \`[x]\` done · \`[!]\` blocked

## Current job tasks
${rows}

## Last synchronized
- ${nowIso()}
- Durable runtime status: ${job.status}
`;
}

function renderReview(job: JobRecord): string {
  const review = job.latestReview;
  if (!review) {
    return `# Internal Review

## Review requested
- Reviewer: pending independent QA
- Job status: ${job.status}

## Final verdict
\`NOT_REVIEWED\`

No independent QA result has been recorded yet.
`;
  }
  const criteria = review.criteriaResults.length
    ? review.criteriaResults
        .map((item) => `| ${item.criterion} | ${item.evidence} | ${item.result} |`)
        .join('\n')
    : '| — | — | NOT_CHECKED |';
  return `# Internal Review

## Review requested
- Reviewer: ${review.reviewer}
- Created at: ${review.createdAt}
- Job status: ${job.status}

## Summary
${review.summary}

## Acceptance criteria coverage
| Criterion | Evidence | Result |
|---|---|---|
${criteria}

## Verification
- Tests: ${review.tests.join('; ') || 'None recorded'}
- Security/privacy findings: ${review.securityFindings.join('; ') || 'None recorded'}
- Findings: ${review.findings.join('; ') || 'None recorded'}
- Required changes: ${review.requiredChanges.join('; ') || 'None recorded'}

## Final verdict
\`${review.verdict}\`
`;
}

function renderDelivery(job: JobRecord, opportunity: OpportunityRecord): string {
  const delivery = job.delivery;
  const tests = delivery?.testsPerformed || job.latestReview?.tests || [];
  const limitations = delivery?.limitations || opportunity.missingInformation;
  const artifacts = delivery?.artifacts || [];
  return `# Delivery Package

## Deliverables
${(opportunity.deliverables.length ? opportunity.deliverables : ['Agreed scope only']).map((item) => `- ${item}`).join('\n')}

## Setup / usage
${delivery?.instructions || 'Prepare setup and run instructions before requesting the Delivery Gate.'}

## Verification steps
${(tests.length ? tests : ['Independent QA evidence pending']).map((item) => `- ${item}`).join('\n')}

## Known limitations
${(limitations.length ? limitations : ['None recorded']).map((item) => `- ${item}`).join('\n')}

## Scope exclusions
- External sending remains owner-controlled.
- No unapproved scope, credentials, financial action, or client commitment.

## Evidence / artifacts
${(artifacts.length ? artifacts : ['No artifact links recorded']).map((item) => `- ${item}`).join('\n')}

## Suggested client message
${delivery?.deliveryMessageDraft || 'Draft only. Do not send without the required human Delivery Gate approval.'}

## Final approval
- Human delivery approval: ${delivery?.finalApprovalStatus || 'PENDING'}
- Delivery record status: ${delivery?.status || 'DRAFT'}
- Revenue record: ${job.economicOutcome ? `$${job.economicOutcome.grossRevenue.toFixed(2)} gross / $${job.economicOutcome.netRevenue.toFixed(2)} net` : 'Not recorded'}
`;
}

export function workspacePath(jobCode: string): string {
  return path.join(workspaceRootPath(), safeJobCode(jobCode));
}

export function workspaceFilePath(jobCode: string, filename: RequiredWorkspaceFile): string {
  safeWorkspaceFilename(filename);
  return path.join(workspacePath(jobCode), filename);
}

export function repositoryWorkspacePath(jobCode: string, filename: RequiredWorkspaceFile): string {
  safeWorkspaceFilename(filename);
  return `${githubWorkspaceRoot()}/${safeJobCode(jobCode)}/${filename}`;
}

export async function allocateJobCode(title: string): Promise<string> {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const prefix = `JOB-${date}-`;
  let entries: string[] = [];
  try {
    entries = await readdir(workspaceRootPath());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const sequence =
    entries
      .filter((entry) => entry.startsWith(prefix))
      .map((entry) => Number(entry.slice(prefix.length, prefix.length + 3)))
      .filter(Number.isFinite)
      .reduce((max, value) => Math.max(max, value), 0) + 1;
  return `${prefix}${String(sequence).padStart(3, '0')}-${slugify(title)}`;
}

export async function createJobWorkspace(
  job: JobRecord,
  opportunity: OpportunityRecord,
  event = 'Workspace initialized.',
): Promise<string> {
  const directory = workspacePath(job.jobCode);
  await mkdir(path.join(directory, 'artifacts'), { recursive: true });
  const templateDirectory = path.join(process.cwd(), 'jobs', '_template');
  let wasInitialized = false;
  for (const filename of REQUIRED_WORKSPACE_FILES) {
    const target = workspaceFilePath(job.jobCode, filename);
    try {
      await readFile(target, 'utf8');
      if (filename === 'STATE.md') wasInitialized = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const template = await readFile(path.join(templateDirectory, filename), 'utf8');
      await writeFile(target, template, 'utf8');
    }
  }
  if (!wasInitialized) {
    await writeFile(
      workspaceFilePath(job.jobCode, 'STATE.md'),
      `${stateFrontmatter(job, opportunity)}${stateBody(job, event)}`,
      'utf8',
    );
    await writeFile(
      workspaceFilePath(job.jobCode, 'BRIEF.md'),
      [
        '# Job Brief',
        '',
        '## Source',
        `- Platform/source: ${opportunity.source}`,
        `- URL: ${opportunity.sourceUrl || 'Not provided'}`,
        `- Date discovered: ${opportunity.discoveredAt}`,
        '',
        '## Normalized request',
        opportunity.normalizedSummary || opportunity.originalDescription,
        '',
        '## Objectives',
        ...opportunity.deliverables.map((item) => `- ${item}`),
        '',
        '## Scope included',
        '- Only the explicitly recorded opportunity requirements.',
        '',
        '## Scope excluded',
        '- External application, client messaging, contract acceptance, spending, and final delivery without human approval.',
        '',
        '## Acceptance criteria',
        ...opportunity.inferredAcceptanceCriteria.map((item) => `- [ ] ${item}`),
        '',
        '## Assumptions / unknowns',
        ...opportunity.missingInformation.map((item) => `- ${item}`),
        '',
        '## Evidence / source notes',
        opportunity.sourceUrl || 'No external URL recorded.',
        '',
      ].join('\n'),
      'utf8',
    );
    await appendFile(
      workspaceFilePath(job.jobCode, 'ACTIVITY.md'),
      activityEntry('STATE_CHANGE', event, directory, job.nextAction),
      'utf8',
    );
  }
  await syncJobOperationalFiles(job, opportunity);
  return directory;
}

export async function updateJobStateFile(
  job: JobRecord,
  opportunity: OpportunityRecord,
  event: string,
): Promise<void> {
  const directory = workspacePath(job.jobCode);
  await mkdir(directory, { recursive: true });
  await writeFile(
    workspaceFilePath(job.jobCode, 'STATE.md'),
    `${stateFrontmatter(job, opportunity)}${stateBody(job, event)}`,
    'utf8',
  );
}

export async function syncJobOperationalFiles(
  job: JobRecord,
  opportunity: OpportunityRecord,
): Promise<void> {
  await mkdir(workspacePath(job.jobCode), { recursive: true });
  await writeFile(workspaceFilePath(job.jobCode, 'TASKS.md'), renderTasks(job), 'utf8');
  await writeFile(workspaceFilePath(job.jobCode, 'REVIEW.md'), renderReview(job), 'utf8');
  await writeFile(
    workspaceFilePath(job.jobCode, 'DELIVERY.md'),
    renderDelivery(job, opportunity),
    'utf8',
  );
}

export async function appendJobActivity(
  jobCode: string,
  type: string,
  summary: string,
  evidence: string,
  next: string,
): Promise<void> {
  await appendFile(
    workspaceFilePath(jobCode, 'ACTIVITY.md'),
    activityEntry(type, summary, evidence, next),
    'utf8',
  );
}

export async function appendJobDecision(jobCode: string, decision: string): Promise<void> {
  await appendFile(
    workspaceFilePath(jobCode, 'DECISIONS.md'),
    `\n\n## DECISION-${Date.now()} — ${nowIso()}\n- Question: ${decision}\n- Options considered: Approve or reject after reviewing the evidence.\n- Codex recommendation: See the pending approval record in the application.\n- Final decision: pending\n- Decided by: pending\n- Resulting state/scope change: No gated external action until owner decision.\n`,
    'utf8',
  );
}

export async function appendJobDecisionResolution(
  jobCode: string,
  decision: 'APPROVED' | 'REJECTED',
  note: string,
): Promise<void> {
  await appendFile(
    workspaceFilePath(jobCode, 'DECISIONS.md'),
    `\n\n## DECISION-RESOLUTION-${Date.now()} — ${nowIso()}\n- Final decision: ${decision}\n- Decided by: owner\n- Owner note: ${note}\n- Impact: The application state machine was advanced only through the approved human gate.\n`,
    'utf8',
  );
}

export async function readWorkspaceStatus(jobCode: string): Promise<string | null> {
  try {
    const state = await readFile(workspaceFilePath(jobCode, 'STATE.md'), 'utf8');
    return state.match(/^status:\s*["']?([^"'\r\n]+)["']?\s*$/m)?.[1]?.trim() || null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function readWorkspaceFrontmatter(
  jobCode: string,
): Promise<Record<string, string> | null> {
  try {
    const state = await readFile(workspaceFilePath(jobCode, 'STATE.md'), 'utf8');
    const match = state.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return null;
    const result: Record<string, string> = {};
    for (const line of match[1].split(/\r?\n/)) {
      const separator = line.indexOf(':');
      if (separator === -1) continue;
      result[line.slice(0, separator).trim()] = line
        .slice(separator + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '');
    }
    return result;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function detectStateConflict(
  job: JobRecord,
): Promise<{ conflict: boolean; workspaceStatus: string | null }> {
  const workspaceStatus = await readWorkspaceStatus(job.jobCode);
  return { conflict: Boolean(workspaceStatus && workspaceStatus !== job.status), workspaceStatus };
}

function boardLink(jobCode: string): string {
  return `[${jobCode}](${repositoryWorkspacePath(jobCode, 'STATE.md')})`;
}

function renderJobRows(jobs: JobRecord[]): string {
  if (!jobs.length) return '| — | — | — | — | — | — | — | — | — |';
  return jobs
    .map(
      (job) =>
        `| ${job.priority} | ${boardLink(job.jobCode)} | ${job.status} | ${job.score.toFixed(1)} | $${job.estimatedValueUsd.toFixed(2)} | ${job.risk} | ${job.nextActionOwner} | ${job.nextAction} | ${job.updatedAt} |`,
    )
    .join('\n');
}

export async function syncControlBoard(summary: {
  humanAction: JobRecord[];
  active: JobRecord[];
  readyForReview: JobRecord[];
  blocked: JobRecord[];
  pipeline: OpportunityRecord[];
  recentlyCompleted: JobRecord[];
  conflicts?: Array<{ jobId: string | null; conflictType: string; details: string }>;
}): Promise<void> {
  const humanRows = summary.humanAction.length
    ? summary.humanAction
        .map(
          (job) =>
            `| ${job.priority} | ${boardLink(job.jobCode)} | ${job.humanGate} | ${job.nextAction} | ${job.nextActionOwner} | ${job.updatedAt} |`,
        )
        .join('\n')
    : '| — | — | No pending human decisions | — | — | — |';
  const reviewRows = summary.readyForReview.length
    ? summary.readyForReview
        .map(
          (job) =>
            `| ${boardLink(job.jobCode)} | ${job.latestReview?.verdict || job.status} | Review in app | ${job.latestReview?.summary || 'Pending independent review'} | ${job.updatedAt} |`,
        )
        .join('\n')
    : '| — | — | No jobs awaiting review | — | — |';
  const blockedRows = summary.blocked.length
    ? summary.blocked
        .map(
          (job) =>
            `| ${job.priority} | ${boardLink(job.jobCode)} | ${job.status} | ${job.blockedBy.join('; ') || 'Review required'} | ${job.nextActionOwner} | — | ${job.updatedAt} |`,
        )
        .join('\n')
    : '| — | — | No blocked jobs | — | — | — | — |';
  const pipelineRows = summary.pipeline.length
    ? summary.pipeline
        .map(
          (opportunity, index) =>
            `| ${index + 1} | [${opportunity.title}](opportunities/${opportunity.id}) | ${opportunity.status} | ${(opportunity.latestScore?.overallScore || 0).toFixed(1)} | $${(opportunity.latestScore?.expectedNetRevenue || 0).toFixed(2)} | ${(opportunity.latestScore?.completionProbability || 0).toFixed(2)} | ${opportunity.latestScore?.riskFlags.join(', ') || '—'} | Review / shortlist |`,
        )
        .join('\n')
    : '| — | — | No shortlisted jobs | — | — | — | — | — |';
  const completedRows = summary.recentlyCompleted.length
    ? summary.recentlyCompleted
        .map(
          (job) =>
            `| ${boardLink(job.jobCode)} | ${job.status} | $${job.actualRevenueUsd.toFixed(2)} | — | — | ${job.completedAt || job.updatedAt} |`,
        )
        .join('\n')
    : '| — | No completed jobs yet | — | — | — | — |';
  const conflictRows = summary.conflicts?.length
    ? summary.conflicts
        .map(
          (conflict) =>
            `| ${conflict.jobId || 'system'} | ${conflict.conflictType} | ${conflict.details} |`,
        )
        .join('\n')
    : '| — | No unresolved reconciliation conflicts | — |';

  const content = `# Codex Job Hunter — Control Board

This is the operational index for all jobs. PostgreSQL/Neon is the transactional runtime store in production; GitHub is the auditable operational ledger and recovery surface. Local JSON is development/test-only. Append-only job history remains in each workspace.

## HUMAN ACTION REQUIRED

| Priority | Job | Decision needed | Recommendation / next action | Owner | Updated |
|---|---|---|---|---|---|
${humanRows}

## ACTIVE WORK

| Priority | Job | Status | Score | Value | Risk | Owner | Next action | Updated |
|---|---|---:|---:|---:|---|---|---|---|
${renderJobRows(summary.active)}

## READY FOR REVIEW

| Job | Internal verdict | Human action | Evidence | Updated |
|---|---|---|---|---|
${reviewRows}

## BLOCKED

| Priority | Job | Status | Blocker | Waiting on | Age | Updated |
|---|---|---|---|---|---|---|
${blockedRows}

## PIPELINE / SHORTLIST

| Rank | Opportunity | Status | Score | Est. value | Completion probability | Risk | Recommended action |
|---:|---|---|---:|---:|---:|---|---|
${pipelineRows}

## RECENTLY COMPLETED

| Job | Outcome | Revenue | Human time | Token/AI usage | Closed |
|---|---|---:|---:|---:|---|
${completedRows}

## RECONCILIATION CONFLICTS

| Job | Conflict | Details |
|---|---|---|
${conflictRows}

## Operating rules

1. HUMAN ACTION REQUIRED is the highest-attention section.
2. Paid/won jobs outrank speculative jobs.
3. Initial WIP target: no more than 3 jobs in IN_PROGRESS.
4. External application, commercial terms, contract, scope, spend, and delivery remain human-gated.
5. Job detail/history belongs in the job directory; this board is a one-minute summary.
`;
  await mkdir(path.dirname(controlBoardFilePath()), { recursive: true });
  await writeFile(controlBoardFilePath(), content, 'utf8');
}

export interface CheckpointFile {
  repositoryPath: string;
  localPath: string;
  content: string;
}

export interface GitHubCheckpointResult {
  synced: boolean;
  url?: string;
  commitSha?: string;
  paths: string[];
}

function validateRepositoryPath(repositoryPath: string): string {
  const normalized = repositoryPath.replaceAll('\\', '/').replace(/^\/+/, '');
  if (!normalized || normalized.split('/').some((part) => part === '..' || part === '.')) {
    throw new Error(`Unsafe repository checkpoint path: ${repositoryPath}`);
  }
  return normalized;
}

async function collectArtifactFiles(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries) {
    const localPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectArtifactFiles(localPath)));
    else if (entry.isFile()) files.push(localPath);
  }
  return files;
}

export async function readWorkspaceCheckpointFiles(jobCode: string): Promise<CheckpointFile[]> {
  const files: CheckpointFile[] = [];
  for (const filename of REQUIRED_WORKSPACE_FILES) {
    const localPath = workspaceFilePath(jobCode, filename);
    files.push({
      localPath,
      repositoryPath: repositoryWorkspacePath(jobCode, filename),
      content: await readFile(localPath, 'utf8'),
    });
  }
  const artifactsDirectory = path.join(workspacePath(jobCode), 'artifacts');
  for (const localPath of await collectArtifactFiles(artifactsDirectory)) {
    const relativePath = path.relative(artifactsDirectory, localPath).replaceAll('\\', '/');
    files.push({
      localPath,
      repositoryPath: `${githubWorkspaceRoot()}/${safeJobCode(jobCode)}/artifacts/${relativePath}`,
      content: await readFile(localPath, 'utf8'),
    });
  }
  return files;
}

export async function checkpointFilesToGitHub(
  files: CheckpointFile[],
  message: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GitHubCheckpointResult> {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!token || !repository) return { synced: false, paths: [] };
  const branch = process.env.GITHUB_BRANCH || 'main';
  const baseEndpoint = `https://api.github.com/repos/${repository}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
  const request = async <T>(pathname: string, init?: RequestInit): Promise<T> => {
    const response = await fetchImpl(`${baseEndpoint}${pathname}`, {
      ...init,
      headers: { ...headers, ...(init?.headers || {}) },
    });
    if (!response.ok) {
      throw new Error(`GitHub checkpoint failed (${response.status}): ${await response.text()}`);
    }
    return (await response.json()) as T;
  };

  const ref = await request<{ object: { sha: string } }>(
    `/git/ref/heads/${encodeURIComponent(branch)}`,
  );
  const parentSha = ref.object.sha;
  const parentCommit = await request<{ tree: { sha: string } }>(`/git/commits/${parentSha}`);
  const blobShas: Array<{ path: string; sha: string }> = [];
  for (const file of files) {
    const repositoryPath = validateRepositoryPath(file.repositoryPath);
    const blob = await request<{ sha: string }>('/git/blobs', {
      method: 'POST',
      body: JSON.stringify({
        content: Buffer.from(file.content, 'utf8').toString('base64'),
        encoding: 'base64',
      }),
    });
    blobShas.push({ path: repositoryPath, sha: blob.sha });
  }
  const tree = await request<{ sha: string }>('/git/trees', {
    method: 'POST',
    body: JSON.stringify({
      base_tree: parentCommit.tree.sha,
      tree: blobShas.map((item) => ({ ...item, mode: '100644', type: 'blob' })),
    }),
  });
  const commit = await request<{ sha: string }>('/git/commits', {
    method: 'POST',
    body: JSON.stringify({ message, tree: tree.sha, parents: [parentSha] }),
  });
  await request(`/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });
  return {
    synced: true,
    commitSha: commit.sha,
    url: `https://github.com/${repository}/commit/${commit.sha}`,
    paths: blobShas.map((item) => item.path),
  };
}
