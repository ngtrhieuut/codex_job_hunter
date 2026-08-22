import {
  JOB_STATUSES,
  OPPORTUNITY_STATUSES,
  type AppSettings,
  type AppState,
  type ActivityRecord,
  type ApplicationRecord,
  type ApprovalRecord,
  type DeliveryRecord,
  type EconomicOutcomeRecord,
  type JobRecord,
  type JobTask,
  type JobStatus,
  type OpportunityRecord,
  type OpportunityStatus,
  type ProposalRecord,
  type ReconciliationConflictRecord,
  type ReviewRecord,
  type ScoreSnapshot,
} from './app-types';
import { newId, nowIso } from './ids';
import { loadJsonState, saveJsonState } from './json-store';
import { PostgresAppStore } from './postgres-store';

export interface OpportunityQuery {
  source?: string;
  category?: string;
  status?: string;
  risk?: string;
  minScore?: number;
  sort?: 'score' | 'newest' | 'budget' | 'completion' | 'expectedValue';
}

export interface DashboardSummary {
  humanAction: JobRecord[];
  active: JobRecord[];
  readyForReview: JobRecord[];
  blocked: JobRecord[];
  pipeline: OpportunityRecord[];
  recentlyCompleted: JobRecord[];
  conflicts: ReconciliationConflictRecord[];
}

export interface AppStore {
  getSettings(): Promise<AppSettings>;
  updateSettings(update: Partial<AppSettings>): Promise<AppSettings>;
  listOpportunities(query?: OpportunityQuery): Promise<OpportunityRecord[]>;
  getOpportunity(id: string): Promise<OpportunityRecord | null>;
  upsertOpportunity(input: OpportunityRecord): Promise<OpportunityRecord>;
  setOpportunityStatus(
    id: string,
    status: OpportunityStatus,
    reason: string,
    actor?: 'OWNER' | 'SYSTEM' | 'AGENT',
  ): Promise<OpportunityRecord>;
  saveScore(opportunityId: string, score: ScoreSnapshot): Promise<OpportunityRecord>;
  saveProposal(proposal: ProposalRecord): Promise<ProposalRecord>;
  getProposal(opportunityId: string): Promise<ProposalRecord | null>;
  createApproval(
    approval: Omit<
      ApprovalRecord,
      'id' | 'requestedAt' | 'decidedAt' | 'decision' | 'decisionNote' | 'decisionId'
    >,
  ): Promise<ApprovalRecord>;
  listPendingApprovals(): Promise<ApprovalRecord[]>;
  decideApproval(
    id: string,
    decision: 'APPROVED' | 'REJECTED',
    note: string,
  ): Promise<ApprovalRecord>;
  saveApplication(application: ApplicationRecord): Promise<ApplicationRecord>;
  listJobs(): Promise<JobRecord[]>;
  getJob(id: string): Promise<JobRecord | null>;
  createJob(job: JobRecord): Promise<JobRecord>;
  updateJob(id: string, update: Partial<JobRecord>, reason: string): Promise<JobRecord>;
  updateJobTask(
    jobId: string,
    taskId: string,
    update: Partial<JobTask>,
    reason: string,
  ): Promise<JobRecord>;
  saveReview(review: ReviewRecord): Promise<ReviewRecord>;
  saveDelivery(delivery: DeliveryRecord): Promise<DeliveryRecord>;
  saveEconomicOutcome(outcome: EconomicOutcomeRecord): Promise<EconomicOutcomeRecord>;
  recordActivity(activity: Omit<ActivityRecord, 'id' | 'createdAt'>): Promise<ActivityRecord>;
  saveConflict(
    conflict: Omit<ReconciliationConflictRecord, 'id' | 'detectedAt' | 'resolvedAt'>,
  ): Promise<ReconciliationConflictRecord>;
  listConflicts(): Promise<ReconciliationConflictRecord[]>;
  dashboard(): Promise<DashboardSummary>;
  metrics(): Promise<Record<string, number>>;
  rawState(): Promise<AppState>;
}

export class JsonAppStore implements AppStore {
  private state: AppState | null = null;
  private writeQueue: Promise<unknown> = Promise.resolve();

  private async getState(): Promise<AppState> {
    this.state ??= await loadJsonState();
    return this.state;
  }

  private async write<T>(operation: (state: AppState) => T | Promise<T>): Promise<T> {
    const result = this.writeQueue.then(async () => {
      const state = await this.getState();
      const value = await operation(state);
      await saveJsonState(state);
      return value;
    });
    this.writeQueue = result.catch(() => undefined);
    return result;
  }

  async getSettings(): Promise<AppSettings> {
    return structuredClone((await this.getState()).settings);
  }

  async updateSettings(update: Partial<AppSettings>): Promise<AppSettings> {
    return this.write((state) => {
      state.settings = { ...state.settings, ...update };
      return structuredClone(state.settings);
    });
  }

  async listOpportunities(query: OpportunityQuery = {}): Promise<OpportunityRecord[]> {
    const state = await this.getState();
    const filtered = state.opportunities.filter((opportunity) => {
      if (query.source && opportunity.source !== query.source) return false;
      if (query.category && opportunity.category !== query.category) return false;
      if (query.status && opportunity.status !== query.status) return false;
      if (query.risk && opportunity.latestScore?.riskFlags.includes(query.risk) !== true)
        return false;
      if (
        query.minScore !== undefined &&
        (opportunity.latestScore?.overallScore || 0) < query.minScore
      )
        return false;
      return true;
    });

    const sort = query.sort || 'score';
    return structuredClone(
      filtered.sort((left, right) => {
        if (sort === 'newest') return right.discoveredAt.localeCompare(left.discoveredAt);
        if (sort === 'budget') return (right.budgetMax || 0) - (left.budgetMax || 0);
        if (sort === 'completion') {
          return (
            (right.latestScore?.completionProbability || 0) -
            (left.latestScore?.completionProbability || 0)
          );
        }
        if (sort === 'expectedValue') {
          return (
            (right.latestScore?.expectedNetRevenue || 0) -
            (left.latestScore?.expectedNetRevenue || 0)
          );
        }
        return (right.latestScore?.overallScore || 0) - (left.latestScore?.overallScore || 0);
      }),
    );
  }

  async getOpportunity(id: string): Promise<OpportunityRecord | null> {
    const state = await this.getState();
    const result = state.opportunities.find((opportunity) => opportunity.id === id);
    return result ? structuredClone(result) : null;
  }

  async upsertOpportunity(input: OpportunityRecord): Promise<OpportunityRecord> {
    return this.write((state) => {
      const existingIndex = state.opportunities.findIndex((opportunity) =>
        input.duplicateOf
          ? opportunity.id === input.id
          : opportunity.id === input.id ||
            (opportunity.source === input.source &&
              opportunity.externalId &&
              input.externalId &&
              opportunity.externalId === input.externalId),
      );
      const timestamp = nowIso();
      const next = {
        ...input,
        scoreHistory: input.scoreHistory || (input.latestScore ? [input.latestScore] : []),
        updatedAt: timestamp,
      };
      if (existingIndex === -1) {
        state.opportunities.push(next);
      } else {
        state.opportunities[existingIndex] = {
          ...state.opportunities[existingIndex],
          ...next,
          scoreHistory: next.scoreHistory.length
            ? next.scoreHistory
            : state.opportunities[existingIndex].scoreHistory || [],
          id: state.opportunities[existingIndex].id,
          createdAt: state.opportunities[existingIndex].createdAt,
        };
      }
      return structuredClone(existingIndex === -1 ? next : state.opportunities[existingIndex]);
    });
  }

  async setOpportunityStatus(
    id: string,
    status: OpportunityStatus,
    reason: string,
    actor: 'OWNER' | 'SYSTEM' | 'AGENT' = 'OWNER',
  ): Promise<OpportunityRecord> {
    if (!OPPORTUNITY_STATUSES.includes(status))
      throw new Error(`Unknown opportunity status: ${status}`);
    return this.write((state) => {
      const opportunity = state.opportunities.find((item) => item.id === id);
      if (!opportunity) throw new Error(`Opportunity not found: ${id}`);
      const previous = opportunity.status;
      opportunity.status = status;
      opportunity.updatedAt = nowIso();
      state.transitions.push({
        id: newId(),
        entityType: 'OPPORTUNITY',
        entityId: id,
        fromState: previous,
        toState: status,
        actor,
        reason,
        createdAt: nowIso(),
      });
      return structuredClone(opportunity);
    });
  }

  async saveScore(opportunityId: string, score: ScoreSnapshot): Promise<OpportunityRecord> {
    return this.write((state) => {
      const opportunity = state.opportunities.find((item) => item.id === opportunityId);
      if (!opportunity) throw new Error(`Opportunity not found: ${opportunityId}`);
      opportunity.latestScore = structuredClone(score);
      if (opportunity.status === 'DISCOVERED' || opportunity.status === 'NORMALIZED') {
        opportunity.status = 'SCORED';
      }
      opportunity.scoreHistory = [
        ...(opportunity.scoreHistory || []).filter((item) => item.id !== score.id),
        structuredClone(score),
      ];
      const scoreIndex = state.scoreSnapshots.findIndex((item) => item.id === score.id);
      if (scoreIndex === -1) state.scoreSnapshots.push(structuredClone(score));
      else state.scoreSnapshots[scoreIndex] = structuredClone(score);
      opportunity.updatedAt = nowIso();
      return structuredClone(opportunity);
    });
  }

  async saveProposal(proposal: ProposalRecord): Promise<ProposalRecord> {
    return this.write((state) => {
      const index = state.proposals.findIndex((item) => item.id === proposal.id);
      if (index === -1) state.proposals.push(proposal);
      else state.proposals[index] = proposal;
      return structuredClone(proposal);
    });
  }

  async getProposal(opportunityId: string): Promise<ProposalRecord | null> {
    const state = await this.getState();
    const proposals = state.proposals.filter(
      (proposal) => proposal.opportunityId === opportunityId,
    );
    return proposals.length
      ? structuredClone(proposals.sort((a, b) => b.version - a.version)[0])
      : null;
  }

  async createApproval(
    approval: Omit<
      ApprovalRecord,
      'id' | 'requestedAt' | 'decidedAt' | 'decision' | 'decisionNote'
    >,
  ): Promise<ApprovalRecord> {
    return this.write((state) => {
      const decisionId = newId();
      const result: ApprovalRecord = {
        ...approval,
        id: newId(),
        decision: 'PENDING',
        decisionNote: null,
        requestedAt: nowIso(),
        decidedAt: null,
        decisionId,
      };
      state.approvals.push(result);
      const payload = approval.requestedPayload || {};
      state.decisions.push({
        id: decisionId,
        approvalId: result.id,
        opportunityId: result.opportunityId,
        jobId: result.jobId,
        question: String(payload.question || payload.summary || 'Owner decision required.'),
        recommendation: String(
          payload.recommendation ||
            'Review the evidence, risks, scope and commercial consequences before deciding.',
        ),
        alternatives: Array.isArray(payload.alternatives)
          ? payload.alternatives.map(String)
          : ['Approve', 'Reject'],
        finalDecision: 'PENDING',
        ownerDecisionNote: null,
        decidedBy: 'PENDING',
        requestedAt: result.requestedAt,
        decidedAt: null,
        impact: payload.impact ? String(payload.impact) : null,
      });
      return structuredClone(result);
    });
  }

  async listPendingApprovals(): Promise<ApprovalRecord[]> {
    const state = await this.getState();
    return structuredClone(state.approvals.filter((approval) => approval.decision === 'PENDING'));
  }

  async decideApproval(
    id: string,
    decision: 'APPROVED' | 'REJECTED',
    note: string,
  ): Promise<ApprovalRecord> {
    return this.write((state) => {
      const approval = state.approvals.find((item) => item.id === id);
      if (!approval) throw new Error(`Approval not found: ${id}`);
      if (approval.decision !== 'PENDING') throw new Error('Approval has already been decided.');
      approval.decision = decision;
      approval.decisionNote = note;
      approval.decidedAt = nowIso();
      const decisionRecord = state.decisions.find((item) => item.approvalId === id);
      if (decisionRecord) {
        decisionRecord.finalDecision = decision;
        decisionRecord.ownerDecisionNote = note;
        decisionRecord.decidedBy = 'OWNER';
        decisionRecord.decidedAt = approval.decidedAt;
      }
      return structuredClone(approval);
    });
  }

  async saveApplication(application: ApplicationRecord): Promise<ApplicationRecord> {
    return this.write((state) => {
      const index = state.applications.findIndex((item) => item.id === application.id);
      if (index === -1) state.applications.push(structuredClone(application));
      else state.applications[index] = structuredClone(application);
      return structuredClone(application);
    });
  }

  async listJobs(): Promise<JobRecord[]> {
    return structuredClone((await this.getState()).jobs);
  }

  async getJob(id: string): Promise<JobRecord | null> {
    const result = (await this.getState()).jobs.find((job) => job.id === id);
    return result ? structuredClone(result) : null;
  }

  async createJob(job: JobRecord): Promise<JobRecord> {
    return this.write((state) => {
      if (state.jobs.some((item) => item.id === job.id || item.jobCode === job.jobCode)) {
        throw new Error(`Job already exists: ${job.jobCode}`);
      }
      state.jobs.push(job);
      return structuredClone(job);
    });
  }

  async updateJob(id: string, update: Partial<JobRecord>, reason: string): Promise<JobRecord> {
    return this.write((state) => {
      const job = state.jobs.find((item) => item.id === id);
      if (!job) throw new Error(`Job not found: ${id}`);
      const previous = job.status;
      Object.assign(job, update, { updatedAt: nowIso() });
      if (previous !== job.status) {
        state.transitions.push({
          id: newId(),
          entityType: 'JOB',
          entityId: id,
          fromState: previous,
          toState: job.status,
          actor: 'OWNER',
          reason,
          createdAt: nowIso(),
        });
      }
      return structuredClone(job);
    });
  }

  async updateJobTask(
    jobId: string,
    taskId: string,
    update: Partial<JobTask>,
    reason: string,
  ): Promise<JobRecord> {
    return this.write((state) => {
      const job = state.jobs.find((item) => item.id === jobId);
      if (!job) throw new Error(`Job not found: ${jobId}`);
      const task = job.tasks.find((item) => item.id === taskId);
      if (!task) throw new Error(`Task not found: ${taskId}`);
      Object.assign(task, update);
      job.updatedAt = nowIso();
      state.activities.push({
        id: newId(),
        jobId,
        type: 'TASK_CHANGE',
        summary: `Task "${task.title}" updated: ${reason}`,
        evidence: `jobs/${job.jobCode}/TASKS.md`,
        nextAction: job.nextAction,
        createdAt: nowIso(),
      });
      return structuredClone(job);
    });
  }

  async saveReview(review: ReviewRecord): Promise<ReviewRecord> {
    return this.write((state) => {
      const index = state.reviews.findIndex((item) => item.id === review.id);
      if (index === -1) state.reviews.push(review);
      else state.reviews[index] = review;
      const job = state.jobs.find((item) => item.id === review.jobId);
      if (job) job.latestReview = structuredClone(review);
      return structuredClone(review);
    });
  }

  async saveDelivery(delivery: DeliveryRecord): Promise<DeliveryRecord> {
    return this.write((state) => {
      const index = state.deliveries.findIndex((item) => item.id === delivery.id);
      if (index === -1) state.deliveries.push(structuredClone(delivery));
      else state.deliveries[index] = structuredClone(delivery);
      const job = state.jobs.find((item) => item.id === delivery.jobId);
      if (job) job.delivery = structuredClone(delivery);
      return structuredClone(delivery);
    });
  }

  async saveEconomicOutcome(outcome: EconomicOutcomeRecord): Promise<EconomicOutcomeRecord> {
    return this.write((state) => {
      const index = state.economicOutcomes.findIndex((item) => item.id === outcome.id);
      if (index === -1) state.economicOutcomes.push(structuredClone(outcome));
      else state.economicOutcomes[index] = structuredClone(outcome);
      const job = state.jobs.find((item) => item.id === outcome.jobId);
      if (job) {
        job.economicOutcome = structuredClone(outcome);
        job.actualRevenueUsd = outcome.grossRevenue;
        job.updatedAt = nowIso();
      }
      return structuredClone(outcome);
    });
  }

  async recordActivity(
    activity: Omit<ActivityRecord, 'id' | 'createdAt'>,
  ): Promise<ActivityRecord> {
    return this.write((state) => {
      const result: ActivityRecord = { ...activity, id: newId(), createdAt: nowIso() };
      state.activities.push(result);
      return structuredClone(result);
    });
  }

  async saveConflict(
    conflict: Omit<ReconciliationConflictRecord, 'id' | 'detectedAt' | 'resolvedAt'>,
  ): Promise<ReconciliationConflictRecord> {
    return this.write((state) => {
      const existing = state.conflicts.find(
        (item) =>
          item.jobId === conflict.jobId &&
          item.conflictType === conflict.conflictType &&
          item.resolvedAt === null,
      );
      if (existing) {
        existing.details = conflict.details;
        existing.severity = conflict.severity;
        return structuredClone(existing);
      }
      const result: ReconciliationConflictRecord = {
        ...conflict,
        id: newId(),
        detectedAt: nowIso(),
        resolvedAt: null,
      };
      state.conflicts.push(result);
      return structuredClone(result);
    });
  }

  async listConflicts(): Promise<ReconciliationConflictRecord[]> {
    const state = await this.getState();
    return structuredClone(state.conflicts.filter((item) => item.resolvedAt === null));
  }

  async dashboard(): Promise<DashboardSummary> {
    const state = await this.getState();
    const pendingJobIds = new Set(
      state.approvals
        .filter((approval) => approval.decision === 'PENDING' && approval.jobId)
        .map((approval) => approval.jobId as string),
    );
    const humanAction = state.jobs.filter(
      (job) =>
        pendingJobIds.has(job.id) ||
        [
          'REQUIRES_SCOPE_APPROVAL',
          'REQUIRES_DELIVERY_APPROVAL',
          'READY_FOR_HUMAN_REVIEW',
        ].includes(job.status),
    );
    const active = state.jobs.filter((job) => ['PLANNING', 'IN_PROGRESS'].includes(job.status));
    const readyForReview = state.jobs.filter((job) =>
      ['READY_FOR_INTERNAL_REVIEW', 'READY_FOR_HUMAN_REVIEW'].includes(job.status),
    );
    const blocked = state.jobs.filter((job) =>
      ['BLOCKED_INTERNAL', 'BLOCKED_CLIENT', 'CHANGES_REQUESTED'].includes(job.status),
    );
    const pipeline = state.opportunities.filter((opportunity) =>
      ['SCORED', 'SHORTLISTED', 'REQUIRES_APPLY_APPROVAL'].includes(opportunity.status),
    );
    const recentlyCompleted = state.jobs.filter((job) =>
      ['ACCEPTED', 'PAID', 'CLOSED_WON'].includes(job.status),
    );
    return structuredClone({
      humanAction,
      active,
      readyForReview,
      blocked,
      pipeline,
      recentlyCompleted,
      conflicts: state.conflicts.filter((item) => item.resolvedAt === null),
    });
  }

  async metrics(): Promise<Record<string, number>> {
    const state = await this.getState();
    const opportunityCount = state.opportunities.length;
    const hardRejected = state.opportunities.filter(
      (item) => item.status === 'REJECTED_HARD_FILTER',
    ).length;
    const shortlisted = state.opportunities.filter((item) =>
      [
        'SHORTLISTED',
        'REQUIRES_APPLY_APPROVAL',
        'APPROVED_TO_APPLY',
        'APPLY_APPROVED',
        'APPLIED',
        'WON_PENDING_CONTRACT',
      ].includes(item.status),
    ).length;
    const applied = state.opportunities.filter((item) => item.status === 'APPLIED').length;
    const won = state.opportunities.filter((item) =>
      ['ACTIVE', 'ACCEPTED', 'PAID', 'CLOSED_WON'].includes(item.status),
    ).length;
    const paid = state.jobs.filter((item) => ['PAID', 'CLOSED_WON'].includes(item.status)).length;
    const delivered = state.jobs.filter((item) =>
      ['DELIVERED', 'REVISION_REQUESTED', 'ACCEPTED', 'PAID', 'CLOSED_WON'].includes(item.status),
    ).length;
    const accepted = state.jobs.filter((item) =>
      ['ACCEPTED', 'PAID', 'CLOSED_WON'].includes(item.status),
    ).length;
    const revenue = state.jobs.reduce((total, job) => total + job.actualRevenueUsd, 0);
    const estimatedTokens = state.opportunities.reduce(
      (total, item) => total + (item.latestScore?.estimatedTokens || 0),
      0,
    );
    const expectedPipelineRevenueUsd = state.opportunities.reduce(
      (total, item) => total + (item.latestScore?.expectedNetRevenue || 0),
      0,
    );
    return {
      discovered: opportunityCount,
      hardRejected,
      shortlisted,
      applied,
      won,
      paid,
      delivered,
      accepted,
      applicationWinRate: applied ? won / applied : 0,
      acceptedDeliveryRate: delivered ? accepted / delivered : 0,
      grossRevenueUsd: revenue,
      estimatedTokens,
      expectedPipelineRevenueUsd,
    };
  }

  async rawState(): Promise<AppState> {
    return structuredClone(await this.getState());
  }
}

let singleton: AppStore | null = null;

function runtimeStoreMode(): 'json' | 'postgres' {
  const configured = (process.env.APP_STORE || '').trim().toLowerCase();
  if (configured && configured !== 'json' && configured !== 'postgres') {
    throw new Error(
      `Unsupported APP_STORE=${configured}; use APP_STORE=json or APP_STORE=postgres.`,
    );
  }
  if (configured === 'postgres') return 'postgres';
  if (configured === 'json') {
    if (
      process.env.NODE_ENV === 'production' &&
      process.env.ALLOW_LOCAL_JSON_PRODUCTION !== 'true'
    ) {
      throw new Error(
        'APP_STORE=json is blocked in production. Configure APP_STORE=postgres with DATABASE_URL, or explicitly set ALLOW_LOCAL_JSON_PRODUCTION=true for a non-durable emergency mode.',
      );
    }
    return 'json';
  }
  if (process.env.NODE_ENV === 'production') return 'postgres';
  return 'json';
}

export function getStore(): AppStore {
  if (!singleton) {
    const mode = runtimeStoreMode();
    if (mode === 'postgres') {
      if (!process.env.DATABASE_URL) {
        throw new Error(
          'Durable runtime store unavailable: APP_STORE=postgres requires DATABASE_URL. The application will not fall back to local JSON.',
        );
      }
      if (
        process.env.NODE_ENV === 'production' &&
        (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY)
      ) {
        throw new Error(
          'Durable operational ledger unavailable: production PostgreSQL mode requires GITHUB_TOKEN and GITHUB_REPOSITORY for GitHub checkpointing.',
        );
      }
      singleton = new PostgresAppStore(process.env.DATABASE_URL);
    } else {
      singleton = new JsonAppStore();
    }
  }
  return singleton;
}

export function resetStoreForTests(): void {
  const current = singleton as (AppStore & { close?: () => Promise<void> }) | null;
  if (current?.close) void current.close();
  singleton = null;
}

export function isKnownJobStatus(status: string): status is JobStatus {
  return JOB_STATUSES.includes(status as JobStatus);
}
