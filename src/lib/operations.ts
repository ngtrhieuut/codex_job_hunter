import { readFile } from 'node:fs/promises';
import {
  validateJobTransition,
  validateOpportunityTransition,
  getWipStatus,
} from '@/src/domain/state-machine';
import type {
  HumanGate,
  JobState,
  OpportunityLifecycleState,
  RawOpportunityRecord,
} from '@/src/domain/types';
import type {
  ApprovalType,
  ApprovalRecord,
  ApplicationRecord,
  DeliveryRecord,
  EconomicOutcomeRecord,
  JobRecord,
  OpportunityRecord,
  ReviewRecord,
} from './app-types';
import { newId, nowIso, slugify } from './ids';
import {
  appendJobActivity,
  appendJobDecision,
  appendJobDecisionResolution,
  checkpointFilesToGitHub,
  createJobWorkspace,
  detectStateConflict,
  githubControlBoardPath,
  readWorkspaceCheckpointFiles,
  repositoryWorkspacePath,
  syncControlBoard,
  syncJobOperationalFiles,
  controlBoardFilePath,
  updateJobStateFile,
} from './job-workspace';
import { getStore } from './store';
import { ingestRawRecords } from './ingestion';

function ensureTransition(
  entity: 'job' | 'opportunity',
  from: string,
  to: string,
  gate?: HumanGate,
): void {
  const result =
    entity === 'job'
      ? validateJobTransition(
          from as JobState,
          to as JobState,
          gate ? { gate, approved: true } : undefined,
        )
      : validateOpportunityTransition(
          from as OpportunityLifecycleState,
          to as OpportunityLifecycleState,
          gate ? { gate, approved: true } : undefined,
        );
  if (!result.valid) throw new Error(result.message);
}

function riskFromOpportunity(opportunity: OpportunityRecord): JobRecord['risk'] {
  const flags = opportunity.latestScore?.riskFlags || [];
  if (flags.some((flag) => ['security_risk', 'scam_risk'].includes(flag))) return 'CRITICAL';
  if (flags.length >= 3) return 'HIGH';
  if (flags.length) return 'MEDIUM';
  return 'LOW';
}

function validateApprovalOutcome(
  approval: ApprovalRecord,
  decision: 'APPROVED' | 'REJECTED',
  job: JobRecord,
  opportunity: OpportunityRecord,
): void {
  if (approval.approvalType === 'APPLY') {
    if (decision === 'APPROVED') {
      ensureTransition('job', job.status, 'APPLY_APPROVED', 'APPLY');
      ensureTransition('opportunity', opportunity.status, 'APPROVED_TO_APPLY', 'APPLY');
    } else {
      ensureTransition('job', job.status, 'SHORTLISTED');
      ensureTransition('opportunity', opportunity.status, 'SHORTLISTED');
    }
  } else if (approval.approvalType === 'PRICE') {
    if (decision === 'APPROVED') ensureTransition('job', job.status, 'NEGOTIATING', 'PRICE');
    else {
      ensureTransition('job', job.status, 'REJECTED');
      ensureTransition('opportunity', opportunity.status, 'CANCELLED');
    }
  } else if (approval.approvalType === 'CONTRACT') {
    if (decision === 'APPROVED') {
      ensureTransition('job', job.status, 'WON', 'CONTRACT');
      ensureTransition('job', 'WON', 'PLANNING');
      ensureTransition('opportunity', opportunity.status, 'ACTIVE', 'CONTRACT');
    } else {
      ensureTransition('job', job.status, 'CLOSED_LOST');
      ensureTransition('opportunity', opportunity.status, 'CANCELLED');
    }
  } else if (approval.approvalType === 'DELIVERY' && decision === 'APPROVED') {
    ensureTransition('job', job.status, 'DELIVERED', 'DELIVERY');
    ensureTransition('opportunity', opportunity.status, 'DELIVERED', 'DELIVERY');
  } else if (approval.approvalType === 'DELIVERY') {
    ensureTransition('job', job.status, 'CHANGES_REQUESTED');
  }
}

async function checkpoint(job: JobRecord, event: string, type = 'STATE_CHANGE'): Promise<void> {
  const store = getStore();
  const opportunity = await store.getOpportunity(job.opportunityId);
  if (!opportunity) throw new Error(`Opportunity not found for ${job.jobCode}`);
  await updateJobStateFile(job, opportunity, event);
  await syncJobOperationalFiles(job, opportunity);
  await appendJobActivity(
    job.jobCode,
    type,
    event,
    repositoryWorkspacePath(job.jobCode, 'STATE.md'),
    job.nextAction,
  );
  await store.recordActivity({
    jobId: job.id,
    type,
    summary: event,
    evidence: repositoryWorkspacePath(job.jobCode, 'STATE.md'),
    nextAction: job.nextAction,
  });
  const dashboard = await store.dashboard();
  await syncControlBoard(dashboard);
  if (process.env.GITHUB_TOKEN && process.env.GITHUB_REPOSITORY) {
    const files = await readWorkspaceCheckpointFiles(job.jobCode);
    files.push({
      localPath: controlBoardFilePath(),
      repositoryPath: githubControlBoardPath(),
      content: await readFile(controlBoardFilePath(), 'utf8'),
    });
    await checkpointFilesToGitHub(files, `checkpoint(${job.jobCode}): ${event}`);
  }
}

async function findOrCreateManagedJob(opportunity: OpportunityRecord): Promise<JobRecord> {
  const store = getStore();
  const existing = (await store.listJobs()).find((job) => job.opportunityId === opportunity.id);
  if (existing) return existing;
  const now = nowIso();
  const jobCode = await import('./job-workspace').then(({ allocateJobCode }) =>
    allocateJobCode(opportunity.title),
  );
  const job: JobRecord = {
    id: newId(),
    jobCode,
    opportunityId: opportunity.id,
    title: opportunity.title,
    status: 'SHORTLISTED',
    priority:
      (opportunity.latestScore?.overallScore || 0) >= 85
        ? 'P1'
        : (opportunity.latestScore?.overallScore || 0) >= 75
          ? 'P2'
          : 'P3',
    score: opportunity.latestScore?.overallScore || 0,
    estimatedValueUsd: opportunity.latestScore?.expectedNetRevenue || 0,
    actualRevenueUsd: 0,
    risk: riskFromOpportunity(opportunity),
    agreedScope: {
      summary: opportunity.normalizedSummary,
      acceptanceCriteria: opportunity.inferredAcceptanceCriteria,
    },
    agreedPrice: 0,
    currency: opportunity.currency || 'USD',
    agreedDeadline: opportunity.explicitDeadline,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    nextAction: 'Review opportunity and request Apply Gate if still attractive.',
    nextActionOwner: 'codex',
    humanGate: 'NONE',
    blockedBy: [],
    branchOrPr: null,
    lastCheckpointCommit: null,
    acceptanceCriteria: opportunity.inferredAcceptanceCriteria.map((description) => ({
      id: newId(),
      description,
      verificationMethod: 'Documented evidence or automated test',
      status: 'TODO',
      evidence: null,
    })),
    tasks: [
      {
        id: newId(),
        title: 'Confirm source, scope, and commercial evidence',
        description: null,
        agentRole: 'Project Manager',
        status: 'TODO',
        estimateMinutes: 20,
        actualMinutes: null,
        blockedReason: null,
      },
      {
        id: newId(),
        title: 'Prepare proposal package without external submission',
        description: null,
        agentRole: 'Proposal Agent',
        status: 'TODO',
        estimateMinutes: 30,
        actualMinutes: null,
        blockedReason: null,
      },
      {
        id: newId(),
        title: 'Obtain human approval before external commitment',
        description: null,
        agentRole: 'Owner',
        status: 'TODO',
        estimateMinutes: null,
        actualMinutes: null,
        blockedReason: null,
      },
    ],
    latestReview: null,
    delivery: null,
    economicOutcome: null,
  };
  await store.createJob(job);
  await createJobWorkspace(
    job,
    opportunity,
    'Managed workspace created from shortlisted opportunity.',
  );
  return job;
}

export async function ingestAndPersist(records: RawOpportunityRecord[], source?: string) {
  return ingestRawRecords(records, source);
}

export async function shortlistOpportunity(opportunityId: string): Promise<JobRecord> {
  const store = getStore();
  const opportunity = await store.getOpportunity(opportunityId);
  if (!opportunity) throw new Error('Opportunity not found.');
  if (opportunity.status !== 'SCORED')
    throw new Error(
      `Only SCORED opportunities can be shortlisted (current: ${opportunity.status}).`,
    );
  ensureTransition('opportunity', opportunity.status, 'SHORTLISTED');
  const updated = await store.setOpportunityStatus(
    opportunityId,
    'SHORTLISTED',
    'Owner selected the opportunity for managed review.',
  );
  const job = await findOrCreateManagedJob(updated);
  await checkpoint(job, 'Opportunity shortlisted and isolated into its own job workspace.');
  return job;
}

export async function rejectOpportunity(opportunityId: string): Promise<void> {
  const store = getStore();
  const opportunity = await store.getOpportunity(opportunityId);
  if (!opportunity) throw new Error('Opportunity not found.');
  if (!['SCORED', 'SHORTLISTED'].includes(opportunity.status)) {
    throw new Error(
      `Only SCORED or SHORTLISTED opportunities can be rejected directly (current: ${opportunity.status}).`,
    );
  }
  ensureTransition('opportunity', opportunity.status, 'CANCELLED');
  await store.setOpportunityStatus(
    opportunityId,
    'CANCELLED',
    'Owner rejected the opportunity after review.',
  );
  const job = (await store.listJobs()).find((item) => item.opportunityId === opportunityId);
  if (!job) {
    await syncControlBoard(await store.dashboard());
    return;
  }
  ensureTransition('job', job.status, 'REJECTED');
  const updated = await store.updateJob(
    job.id,
    {
      status: 'REJECTED',
      humanGate: 'NONE',
      nextAction: 'Retain rejection reason for scoring calibration.',
      nextActionOwner: 'codex',
      completedAt: nowIso(),
    },
    'Owner rejected the opportunity.',
  );
  await checkpoint(updated, 'Opportunity rejected after owner review; no external action taken.');
}

export async function requestApplyApproval(opportunityId: string): Promise<void> {
  const store = getStore();
  const opportunity = await store.getOpportunity(opportunityId);
  if (!opportunity) throw new Error('Opportunity not found.');
  const job = await findOrCreateManagedJob(opportunity);
  ensureTransition('opportunity', opportunity.status, 'REQUIRES_APPLY_APPROVAL');
  ensureTransition('job', job.status, 'REQUIRES_APPLY_APPROVAL');
  const updatedOpportunity = await store.setOpportunityStatus(
    opportunityId,
    'REQUIRES_APPLY_APPROVAL',
    'Prepare a decision-ready Apply Gate; no external submission performed.',
  );
  const updatedJob = await store.updateJob(
    job.id,
    {
      status: 'REQUIRES_APPLY_APPROVAL',
      humanGate: 'APPLY',
      nextAction: 'Owner approves or rejects the prepared application decision.',
      nextActionOwner: 'human',
    },
    'Apply Gate requested.',
  );
  await store.createApproval({
    opportunityId,
    jobId: job.id,
    approvalType: 'APPLY',
    requestedPayload: {
      summary: `Approve manual application for ${updatedOpportunity.title}`,
      score: updatedOpportunity.latestScore?.overallScore || 0,
      expectedValue: updatedOpportunity.latestScore?.expectedNetRevenue || 0,
      externalAction: 'Manual application only after approval',
    },
  });
  await appendJobDecision(
    job.jobCode,
    `Should the owner approve a manual application for "${opportunity.title}"? Recommended: approve only if the score, scope, and truthful proposal evidence remain acceptable; no application will be sent by the system.`,
  );
  await checkpoint(
    updatedJob,
    'Apply Gate requested; external application is paused pending owner decision.',
    'NEEDS_DECISION',
  );
}

export async function recordManualApplication(opportunityId: string): Promise<void> {
  const store = getStore();
  const opportunity = await store.getOpportunity(opportunityId);
  if (!opportunity) throw new Error('Opportunity not found.');
  const job = (await store.listJobs()).find((item) => item.opportunityId === opportunityId);
  if (!job || job.status !== 'APPLY_APPROVED')
    throw new Error('Apply Gate must be approved before recording an application.');
  ensureTransition('opportunity', opportunity.status, 'APPLIED');
  ensureTransition('job', job.status, 'APPLIED');
  await store.setOpportunityStatus(
    opportunityId,
    'APPLIED',
    'Owner recorded a manual application; system did not submit externally.',
  );
  const proposal = await store.getProposal(opportunityId);
  const application: ApplicationRecord = {
    id: newId(),
    opportunityId,
    proposalId: proposal?.id || null,
    submittedAt: nowIso(),
    submittedVia: 'MANUAL',
    actualBid: proposal?.recommendedBid || null,
    currency: opportunity.currency,
    status: 'SUBMITTED',
    externalReference: null,
    notes: 'Recorded by owner; Codex Job Hunter did not submit externally.',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await store.saveApplication(application);
  const updated = await store.updateJob(
    job.id,
    {
      status: 'APPLIED',
      humanGate: 'NONE',
      nextAction: 'Record client response or mark lost/won.',
      nextActionOwner: 'human',
    },
    'Manual application recorded.',
  );
  await checkpoint(
    updated,
    'Manual application recorded. No external submission was performed by Codex Job Hunter.',
  );
}

export async function markLost(opportunityId: string): Promise<void> {
  const store = getStore();
  const opportunity = await store.getOpportunity(opportunityId);
  if (!opportunity) throw new Error('Opportunity not found.');
  const job = (await store.listJobs()).find((item) => item.opportunityId === opportunityId);
  if (!job) throw new Error('Managed job not found.');
  ensureTransition('opportunity', opportunity.status, 'LOST');
  ensureTransition('job', job.status, 'CLOSED_LOST');
  await store.setOpportunityStatus(opportunityId, 'LOST', 'Owner recorded a lost outcome.');
  const updated = await store.updateJob(
    job.id,
    {
      status: 'CLOSED_LOST',
      nextAction: 'Archive after retrospective.',
      nextActionOwner: 'codex',
      completedAt: nowIso(),
    },
    'Opportunity lost.',
  );
  await checkpoint(updated, 'Opportunity marked lost and retained for learning.');
}

export async function markWon(opportunityId: string): Promise<void> {
  const store = getStore();
  const opportunity = await store.getOpportunity(opportunityId);
  if (!opportunity) throw new Error('Opportunity not found.');
  const job = (await store.listJobs()).find((item) => item.opportunityId === opportunityId);
  if (!job) throw new Error('Managed job not found.');
  ensureTransition('opportunity', opportunity.status, 'WON_PENDING_CONTRACT');
  ensureTransition('job', job.status, 'REQUIRES_COMMERCIAL_DECISION');
  await store.setOpportunityStatus(
    opportunityId,
    'WON_PENDING_CONTRACT',
    'Client outcome recorded; price/contract still require owner approval.',
  );
  const updated = await store.updateJob(
    job.id,
    {
      status: 'REQUIRES_COMMERCIAL_DECISION',
      humanGate: 'PRICE',
      nextAction: 'Owner confirms final price, scope, deadline, and contract terms.',
      nextActionOwner: 'human',
    },
    'Commercial decision required before activation.',
  );
  await store.createApproval({
    opportunityId,
    jobId: job.id,
    approvalType: 'PRICE',
    requestedPayload: {
      summary: `Confirm commercial terms for ${opportunity.title}`,
      recommendedPrice: opportunity.latestScore?.expectedNetRevenue || 0,
      deadline: opportunity.explicitDeadline,
      scope: opportunity.normalizedSummary,
    },
  });
  await appendJobDecision(
    job.jobCode,
    `Confirm final commercial terms for the won opportunity. Recommended: verify price, scope, timeline and access before any contract acceptance.`,
  );
  await checkpoint(
    updated,
    'Won signal recorded; commercial and contract gates remain pending.',
    'NEEDS_DECISION',
  );
}

export async function decideApproval(
  approvalId: string,
  decision: 'APPROVED' | 'REJECTED',
  note: string,
): Promise<void> {
  const store = getStore();
  const pending = (await store.listPendingApprovals()).find(
    (approval) => approval.id === approvalId,
  );
  if (!pending) throw new Error('Pending approval not found.');
  if (!pending.jobId) {
    await store.decideApproval(approvalId, decision, note);
    return;
  }
  const job = await store.getJob(pending.jobId);
  if (!job) throw new Error('Approval job not found.');
  const opportunity = pending.opportunityId
    ? await store.getOpportunity(pending.opportunityId)
    : null;
  if (!opportunity) throw new Error('Approval opportunity not found.');
  // Validate the complete state-machine outcome before recording the owner
  // decision. This prevents a gate from becoming final when the subsequent
  // job/opportunity transition would be invalid.
  validateApprovalOutcome(pending, decision, job, opportunity);
  await store.decideApproval(approvalId, decision, note);
  await appendJobDecisionResolution(job.jobCode, decision, note);
  if (pending.approvalType === 'APPLY') {
    if (decision === 'APPROVED') {
      await store.setOpportunityStatus(
        opportunity.id,
        'APPROVED_TO_APPLY',
        'Apply Gate approved by owner; external submission remains manual.',
      );
      const updated = await store.updateJob(
        job.id,
        {
          status: 'APPLY_APPROVED',
          humanGate: 'NONE',
          nextAction: 'Owner may submit manually, then record the application.',
          nextActionOwner: 'human',
        },
        'Apply Gate approved.',
      );
      await checkpoint(
        updated,
        'Apply Gate approved. No external application was sent by the system.',
      );
    } else {
      await store.setOpportunityStatus(
        opportunity.id,
        'SHORTLISTED',
        'Owner rejected this application decision.',
      );
      const updated = await store.updateJob(
        job.id,
        {
          status: 'SHORTLISTED',
          humanGate: 'NONE',
          nextAction: 'Archive or revisit if new evidence appears.',
          nextActionOwner: 'codex',
        },
        'Apply Gate rejected.',
      );
      await checkpoint(updated, 'Apply Gate rejected; no external action taken.');
    }
  } else if (pending.approvalType === 'PRICE') {
    if (decision === 'APPROVED') {
      const updated = await store.updateJob(
        job.id,
        {
          status: 'NEGOTIATING',
          humanGate: 'CONTRACT',
          nextAction: 'Owner accepts or rejects the final contract.',
          nextActionOwner: 'human',
        },
        'Price Gate approved.',
      );
      await store.createApproval({
        opportunityId: opportunity.id,
        jobId: job.id,
        approvalType: 'CONTRACT',
        requestedPayload: {
          summary: `Accept the final contract for ${opportunity.title}`,
          consequence: 'Activation will begin only after owner approval.',
        },
      });
      await checkpoint(updated, 'Price Gate approved; Contract Gate requested.', 'NEEDS_DECISION');
    } else {
      await store.setOpportunityStatus(
        opportunity.id,
        'CANCELLED',
        'Owner rejected the commercial terms.',
      );
      const updated = await store.updateJob(
        job.id,
        {
          status: 'REJECTED',
          humanGate: 'NONE',
          nextAction: 'Retain decision for learning.',
          nextActionOwner: 'codex',
          completedAt: nowIso(),
        },
        'Price Gate rejected.',
      );
      await checkpoint(updated, 'Commercial terms rejected; opportunity closed without contract.');
    }
  } else if (pending.approvalType === 'CONTRACT') {
    if (decision === 'APPROVED') {
      await store.setOpportunityStatus(
        opportunity.id,
        'ACTIVE',
        'Contract Gate approved; work may be planned.',
      );
      let updated = await store.updateJob(
        job.id,
        {
          status: 'WON',
          humanGate: 'NONE',
          nextAction: 'Create the implementation plan and confirm access.',
          nextActionOwner: 'codex',
        },
        'Contract Gate approved.',
      );
      updated = await store.updateJob(
        job.id,
        {
          status: 'PLANNING',
          nextAction: 'Create the implementation plan and confirm access.',
          nextActionOwner: 'codex',
        },
        'Won job moved to planning.',
      );
      await checkpoint(updated, 'Contract Gate approved; job activated in PLANNING.');
    } else {
      await store.setOpportunityStatus(
        opportunity.id,
        'CANCELLED',
        'Owner rejected contract acceptance.',
      );
      const updated = await store.updateJob(
        job.id,
        {
          status: 'CLOSED_LOST',
          humanGate: 'NONE',
          nextAction: 'Retain decision for learning.',
          nextActionOwner: 'codex',
          completedAt: nowIso(),
        },
        'Contract Gate rejected.',
      );
      await checkpoint(updated, 'Contract rejected; no contract was accepted.');
    }
  } else if (pending.approvalType === 'DELIVERY') {
    if (decision === 'APPROVED') {
      await store.setOpportunityStatus(
        opportunity.id,
        'DELIVERED',
        'Delivery Gate approved; external sending remains owner-controlled.',
      );
      if (job.delivery) {
        await store.saveDelivery({
          ...job.delivery,
          status: 'APPROVED',
          finalApprovalStatus: 'APPROVED',
        });
      }
      const updated = await store.updateJob(
        job.id,
        {
          status: 'DELIVERED',
          humanGate: 'NONE',
          nextAction: 'Record acceptance, revision, or payment outcome.',
          nextActionOwner: 'human',
        },
        'Delivery Gate approved.',
      );
      await checkpoint(updated, 'Delivery package approved for owner-controlled delivery.');
    } else {
      const updated = await store.updateJob(
        job.id,
        {
          status: 'CHANGES_REQUESTED',
          humanGate: 'NONE',
          nextAction: 'Resolve delivery review findings.',
          nextActionOwner: 'codex',
        },
        'Delivery Gate rejected.',
      );
      await checkpoint(updated, 'Delivery Gate rejected; changes requested.');
    }
  }
}

export async function startJob(jobId: string): Promise<void> {
  const store = getStore();
  const job = await store.getJob(jobId);
  if (!job) throw new Error('Job not found.');
  const settings = await store.getSettings();
  const wip = getWipStatus(
    (await store.listJobs()).map((item) => item.status as JobState),
    settings.maxActiveJobs,
  );
  if (!wip.canStart && job.status !== 'IN_PROGRESS')
    throw new Error(
      `WIP limit reached (${wip.activeCount}/${wip.limit}). Finish or pause an active job first.`,
    );
  ensureTransition('job', job.status, 'IN_PROGRESS');
  const updated = await store.updateJob(
    job.id,
    {
      status: 'IN_PROGRESS',
      startedAt: job.startedAt || nowIso(),
      nextAction: 'Build against acceptance criteria and checkpoint milestones.',
      nextActionOwner: 'codex',
    },
    'Job entered active execution.',
  );
  await checkpoint(updated, 'Job entered IN_PROGRESS within the configured WIP limit.');
}

export async function updateTaskStatus(
  jobId: string,
  taskId: string,
  status: JobRecord['tasks'][number]['status'],
  notes?: string,
): Promise<void> {
  const store = getStore();
  const job = await store.getJob(jobId);
  if (!job) throw new Error('Job not found.');
  const task = job.tasks.find((item) => item.id === taskId);
  if (!task) throw new Error('Task not found.');
  const updated = await store.updateJobTask(
    jobId,
    taskId,
    {
      status,
      blockedReason:
        status === 'BLOCKED' ? notes || task.blockedReason || 'Blocked; review required.' : null,
    },
    notes || `Task status changed to ${status}.`,
  );
  await checkpoint(updated, `Task "${task.title}" moved to ${status}.`);
}

export async function markReadyForReview(jobId: string): Promise<void> {
  const store = getStore();
  const job = await store.getJob(jobId);
  if (!job) throw new Error('Job not found.');
  const conflict = await detectStateConflict(job);
  if (conflict.conflict)
    throw new Error(
      `STATE_CONFLICT: database=${job.status}, workspace=${conflict.workspaceStatus}`,
    );
  ensureTransition('job', job.status, 'READY_FOR_INTERNAL_REVIEW');
  const opportunity = await store.getOpportunity(job.opportunityId);
  if (!opportunity) throw new Error('Opportunity not found.');
  if (opportunity.status === 'ACTIVE') {
    ensureTransition('opportunity', opportunity.status, 'READY_FOR_QA');
    await store.setOpportunityStatus(
      opportunity.id,
      'READY_FOR_QA',
      'Implementation is ready for independent QA.',
    );
  }
  const updated = await store.updateJob(
    job.id,
    {
      status: 'READY_FOR_INTERNAL_REVIEW',
      nextAction: 'Independent QA must map acceptance criteria to evidence.',
      nextActionOwner: 'codex',
    },
    'Implementation ready for internal review.',
  );
  await checkpoint(updated, 'Implementation marked READY_FOR_INTERNAL_REVIEW.');
}

export async function saveQaResult(
  jobId: string,
  passed: boolean,
  summary: string,
  tests: string[],
): Promise<void> {
  const store = getStore();
  const job = await store.getJob(jobId);
  if (!job) throw new Error('Job not found.');
  const opportunity = await store.getOpportunity(job.opportunityId);
  if (!opportunity) throw new Error('Opportunity not found.');
  const review: ReviewRecord = {
    id: newId(),
    jobId,
    verdict: passed ? 'APPROVED_INTERNAL' : 'CHANGES_REQUESTED',
    summary,
    criteriaResults: job.acceptanceCriteria.map((criterion) => ({
      criterion: criterion.description,
      result: passed ? 'PASS' : 'FAIL',
      evidence: criterion.evidence || 'Independent QA record',
    })),
    tests,
    securityFindings: [],
    reviewer: 'QA Agent',
    findings: passed ? [] : [summary],
    requiredChanges: passed ? [] : [summary],
    createdAt: nowIso(),
  };
  await store.saveReview(review);
  if (passed) {
    ensureTransition('job', job.status, 'READY_FOR_HUMAN_REVIEW');
    if (opportunity.status === 'READY_FOR_QA') {
      ensureTransition('opportunity', opportunity.status, 'READY_FOR_DELIVERY');
      await store.setOpportunityStatus(
        opportunity.id,
        'READY_FOR_DELIVERY',
        'Independent QA passed.',
      );
    }
    const updated = await store.updateJob(
      job.id,
      {
        status: 'READY_FOR_HUMAN_REVIEW',
        nextAction: 'Owner reviews delivery package and decides Delivery Gate.',
        nextActionOwner: 'human',
      },
      'Independent QA passed.',
    );
    await checkpoint(updated, 'Independent QA passed; job is ready for human review.', 'REVIEW');
  } else {
    ensureTransition('job', job.status, 'CHANGES_REQUESTED');
    if (opportunity.status === 'READY_FOR_QA') {
      ensureTransition('opportunity', opportunity.status, 'QA_FAILED');
      await store.setOpportunityStatus(
        opportunity.id,
        'QA_FAILED',
        'Independent QA found required changes.',
      );
    }
    const updated = await store.updateJob(
      job.id,
      {
        status: 'CHANGES_REQUESTED',
        nextAction: 'Resolve QA findings and return for review.',
        nextActionOwner: 'codex',
      },
      'Independent QA failed.',
    );
    await checkpoint(updated, 'Independent QA found changes required.', 'REVIEW');
  }
}

export async function requestDeliveryApproval(jobId: string): Promise<void> {
  const store = getStore();
  const job = await store.getJob(jobId);
  if (!job) throw new Error('Job not found.');
  ensureTransition('job', job.status, 'REQUIRES_DELIVERY_APPROVAL');
  const updatedJob = await store.updateJob(
    job.id,
    {
      status: 'REQUIRES_DELIVERY_APPROVAL',
      humanGate: 'DELIVERY',
      nextAction: 'Owner approves the prepared delivery package.',
      nextActionOwner: 'human',
    },
    'Delivery Gate requested.',
  );
  const opportunity = await store.getOpportunity(job.opportunityId);
  if (!opportunity) throw new Error('Opportunity not found.');
  const existingDelivery = updatedJob.delivery;
  const delivery: DeliveryRecord = existingDelivery || {
    id: newId(),
    jobId: job.id,
    version: 1,
    summary: `Delivery package for ${job.title}`,
    instructions: 'Owner reviews the package, then sends it manually only after approval.',
    testsPerformed: updatedJob.latestReview?.tests || [],
    limitations: opportunity.missingInformation,
    artifacts: [],
    deliveryMessageDraft: `Draft only: deliver the agreed scope for "${job.title}" after owner approval.`,
    finalApprovalStatus: 'PENDING',
    status: 'DRAFT',
    createdAt: nowIso(),
    deliveredAt: null,
  };
  await store.saveDelivery(delivery);
  await store.createApproval({
    opportunityId: job.opportunityId,
    jobId: job.id,
    approvalType: 'DELIVERY',
    requestedPayload: {
      summary: `Approve delivery package for ${job.title}`,
      externalSend: 'Still manual and owner-controlled.',
    },
  });
  const updated = await store.getJob(job.id);
  if (!updated) throw new Error('Job not found after update.');
  await appendJobDecision(
    job.jobCode,
    `Approve the prepared delivery package for "${job.title}"? Recommendation: verify QA evidence, limitations and scope before owner-controlled sending.`,
  );
  await checkpoint(
    updated,
    'Delivery Gate requested; final client delivery remains paused.',
    'NEEDS_DECISION',
  );
}

export async function markAccepted(jobId: string): Promise<void> {
  const store = getStore();
  const job = await store.getJob(jobId);
  if (!job) throw new Error('Job not found.');
  const opportunity = await store.getOpportunity(job.opportunityId);
  if (!opportunity) throw new Error('Opportunity not found.');
  ensureTransition('job', job.status, 'ACCEPTED');
  if (opportunity.status === 'DELIVERED') {
    ensureTransition('opportunity', opportunity.status, 'ACCEPTED');
    await store.setOpportunityStatus(
      opportunity.id,
      'ACCEPTED',
      'Owner recorded client acceptance.',
    );
  }
  const updated = await store.updateJob(
    job.id,
    { status: 'ACCEPTED', nextAction: 'Record payment outcome.', nextActionOwner: 'codex' },
    'Client acceptance recorded.',
  );
  await checkpoint(updated, 'Client acceptance recorded.');
}

export async function markPaid(jobId: string, revenue: number): Promise<void> {
  const store = getStore();
  const job = await store.getJob(jobId);
  if (!job) throw new Error('Job not found.');
  const opportunity = await store.getOpportunity(job.opportunityId);
  if (!opportunity) throw new Error('Opportunity not found.');
  ensureTransition('job', job.status, 'PAID');
  if (opportunity.status === 'ACCEPTED') {
    ensureTransition('opportunity', opportunity.status, 'PAID');
    await store.setOpportunityStatus(opportunity.id, 'PAID', 'Owner recorded payment.');
  }
  const updated = await store.updateJob(
    job.id,
    {
      status: 'PAID',
      actualRevenueUsd: Math.max(0, revenue),
      nextAction: 'Close won job after retrospective.',
      nextActionOwner: 'codex',
      completedAt: nowIso(),
    },
    'Payment recorded.',
  );
  const existingOutcome = updated.economicOutcome;
  await store.saveEconomicOutcome({
    id: existingOutcome?.id || newId(),
    jobId,
    grossRevenue: Math.max(0, revenue),
    platformFees: existingOutcome?.platformFees || 0,
    externalCosts: existingOutcome?.externalCosts || 0,
    netRevenue: Math.max(
      0,
      revenue - (existingOutcome?.platformFees || 0) - (existingOutcome?.externalCosts || 0),
    ),
    tokenCount: existingOutcome?.tokenCount || null,
    estimatedAiMinutes: existingOutcome?.estimatedAiMinutes || null,
    actualHumanMinutes: existingOutcome?.actualHumanMinutes || null,
    revisionsCount: existingOutcome?.revisionsCount || 0,
    paymentStatus: 'PAID',
    paidAt: nowIso(),
    createdAt: existingOutcome?.createdAt || nowIso(),
    updatedAt: nowIso(),
  });
  const checkpointJob = await store.getJob(jobId);
  if (!checkpointJob) throw new Error('Job not found after payment outcome update.');
  await checkpoint(checkpointJob, 'Payment recorded; revenue is preserved for learning.');
}
