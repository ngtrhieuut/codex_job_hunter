import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { JobRecord, OpportunityRecord } from './app-types';
import { nowIso, slugify } from './ids';

const REQUIRED_FILES = [
  'STATE.md',
  'BRIEF.md',
  'TASKS.md',
  'DECISIONS.md',
  'ACTIVITY.md',
  'REVIEW.md',
  'DELIVERY.md',
] as const;

function jobsRoot(): string {
  return path.resolve(process.env.JOBS_ROOT || 'jobs');
}

function controlBoardPath(): string {
  return path.resolve(process.env.CONTROL_BOARD_PATH || 'CONTROL_BOARD.md');
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

export function workspacePath(jobCode: string): string {
  return path.join(jobsRoot(), jobCode);
}

export async function allocateJobCode(title: string): Promise<string> {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const prefix = `JOB-${date}-`;
  let entries: string[] = [];
  try {
    entries = await readdir(jobsRoot());
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
  for (const filename of REQUIRED_FILES) {
    const target = path.join(directory, filename);
    try {
      await readFile(target, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const template = await readFile(path.join(templateDirectory, filename), 'utf8');
      await writeFile(target, template, 'utf8');
    }
  }
  await writeFile(
    path.join(directory, 'STATE.md'),
    `${stateFrontmatter(job, opportunity)}${stateBody(job, event)}`,
    'utf8',
  );
  await writeFile(
    path.join(directory, 'BRIEF.md'),
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
    path.join(directory, 'ACTIVITY.md'),
    activityEntry('STATE_CHANGE', event, directory, job.nextAction),
    'utf8',
  );
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
    path.join(directory, 'STATE.md'),
    `${stateFrontmatter(job, opportunity)}${stateBody(job, event)}`,
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
    path.join(workspacePath(jobCode), 'ACTIVITY.md'),
    activityEntry(type, summary, evidence, next),
    'utf8',
  );
}

export async function appendJobDecision(jobCode: string, decision: string): Promise<void> {
  await appendFile(
    path.join(workspacePath(jobCode), 'DECISIONS.md'),
    `\n\n## DECISION-${Date.now()} — ${nowIso()}\n- Question: ${decision}\n- Codex recommendation: See the pending approval record in the application.\n- Final decision: pending\n- Decided by: pending\n`,
    'utf8',
  );
}

export async function readWorkspaceStatus(jobCode: string): Promise<string | null> {
  try {
    const state = await readFile(path.join(workspacePath(jobCode), 'STATE.md'), 'utf8');
    return state.match(/^status:\s*["']?([^"'\r\n]+)["']?\s*$/m)?.[1]?.trim() || null;
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
  return `[${jobCode}](jobs/${jobCode}/STATE.md)`;
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

  const content = `# Codex Job Hunter — Control Board

This is the operational index for all jobs. Generated from the local canonical store; append-only job history remains in each workspace.

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

## Operating rules

1. HUMAN ACTION REQUIRED is the highest-attention section.
2. Paid/won jobs outrank speculative jobs.
3. Initial WIP target: no more than 3 jobs in IN_PROGRESS.
4. External application, commercial terms, contract, scope, spend, and delivery remain human-gated.
5. Job detail/history belongs in the job directory; this board is a one-minute summary.
`;
  await writeFile(controlBoardPath(), content, 'utf8');
}

export async function checkpointToGitHub(
  pathname: string,
  content: string,
  message: string,
): Promise<{ synced: boolean; url?: string }> {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!token || !repository) return { synced: false };
  const branch = process.env.GITHUB_BRANCH || 'main';
  const endpoint = `https://api.github.com/repos/${repository}/contents/${pathname.replaceAll('\\', '/')}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
  let sha: string | undefined;
  const current = await fetch(`${endpoint}?ref=${encodeURIComponent(branch)}`, { headers });
  if (current.ok) {
    const payload = (await current.json()) as { sha?: string };
    sha = payload.sha;
  }
  const response = await fetch(endpoint, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message,
      content: Buffer.from(content, 'utf8').toString('base64'),
      branch,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!response.ok)
    throw new Error(`GitHub checkpoint failed (${response.status}): ${await response.text()}`);
  const payload = (await response.json()) as { content?: { html_url?: string } };
  return { synced: true, url: payload.content?.html_url };
}
