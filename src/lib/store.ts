import {
  JOB_STATUSES,
  OPPORTUNITY_STATUSES,
  type AppSettings,
  type AppState,
  type ApprovalRecord,
  type JobRecord,
  type JobStatus,
  type OpportunityRecord,
  type OpportunityStatus,
  type ProposalRecord,
  type ReviewRecord,
  type ScoreSnapshot,
} from './app-types';
import { newId, nowIso } from './ids';
import { loadJsonState, saveJsonState } from './json-store';

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
}

export class JsonAppStore {
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
      const next = { ...input, updatedAt: timestamp };
      if (existingIndex === -1) {
        state.opportunities.push(next);
      } else {
        state.opportunities[existingIndex] = {
          ...state.opportunities[existingIndex],
          ...next,
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
      const result: ApprovalRecord = {
        ...approval,
        id: newId(),
        decision: 'PENDING',
        decisionNote: null,
        requestedAt: nowIso(),
        decidedAt: null,
      };
      state.approvals.push(result);
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
      return structuredClone(approval);
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

let singleton: JsonAppStore | null = null;

export function getStore(): JsonAppStore {
  singleton ??= new JsonAppStore();
  return singleton;
}

export function resetStoreForTests(): void {
  singleton = null;
}

export function isKnownJobStatus(status: string): status is JobStatus {
  return JOB_STATUSES.includes(status as JobStatus);
}
