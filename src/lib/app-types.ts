export const OPPORTUNITY_STATUSES = [
  'DISCOVERED',
  'NORMALIZED',
  'REJECTED_HARD_FILTER',
  'SCORED',
  'SHORTLISTED',
  'REQUIRES_APPLY_APPROVAL',
  'APPROVED_TO_APPLY',
  'APPLY_APPROVED',
  'APPLIED',
  'LOST',
  'WON_PENDING_CONTRACT',
  'ACTIVE',
  'SCOPE_CHANGE_REVIEW',
  'READY_FOR_QA',
  'QA_FAILED',
  'READY_FOR_DELIVERY',
  'DELIVERED',
  'REVISION',
  'ACCEPTED',
  'PAID',
  'CANCELLED',
] as const;

export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const JOB_STATUSES = [
  'DISCOVERED',
  'SCORED',
  'SHORTLISTED',
  'REQUIRES_APPLY_APPROVAL',
  'APPLY_APPROVED',
  'APPLIED',
  'CLIENT_RESPONSE',
  'REQUIRES_COMMERCIAL_DECISION',
  'NEGOTIATING',
  'WON',
  'PLANNING',
  'IN_PROGRESS',
  'BLOCKED_INTERNAL',
  'BLOCKED_CLIENT',
  'REQUIRES_SCOPE_APPROVAL',
  'READY_FOR_INTERNAL_REVIEW',
  'CHANGES_REQUESTED',
  'READY_FOR_HUMAN_REVIEW',
  'REQUIRES_DELIVERY_APPROVAL',
  'DELIVERED',
  'REVISION_REQUESTED',
  'ACCEPTED',
  'PAID',
  'CLOSED_WON',
  'CLOSED_LOST',
  'REJECTED',
  'ARCHIVED',
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ApprovalType =
  | 'APPLY'
  | 'PRICE'
  | 'CONTRACT'
  | 'SCOPE_CHANGE'
  | 'DELIVERY'
  | 'SPEND'
  | 'ACCOUNT_CHANGE';
export type ApprovalDecision = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ScoreSnapshot {
  id: string;
  opportunityId: string;
  scoringVersion: string;
  components: Record<string, number>;
  overallScore: number;
  estimatedAiMinutes: number | null;
  estimatedHumanMinutes: number | null;
  estimatedTokens: number | null;
  completionProbability: number;
  winProbability: number;
  expectedNetRevenue: number;
  expectedRevenuePer1mTokens: number | null;
  assumptions: string[];
  riskFlags: string[];
  explanation: string[];
  createdAt: string;
}

export interface OpportunityRecord {
  id: string;
  source: string;
  externalId: string | null;
  sourceUrl: string | null;
  title: string;
  originalDescription: string;
  normalizedSummary: string;
  category: string;
  technologies: string[];
  deliverables: string[];
  inferredAcceptanceCriteria: string[];
  missingInformation: string[];
  budgetMin: number | null;
  budgetMax: number | null;
  currency: string | null;
  explicitDeadline: string | null;
  discoveredAt: string;
  postedAt: string | null;
  rawMetadata: Record<string, unknown>;
  status: OpportunityStatus;
  hardFilterReason: string | null;
  duplicateOf: string | null;
  createdAt: string;
  updatedAt: string;
  latestScore: ScoreSnapshot | null;
  scoreHistory: ScoreSnapshot[];
}

export interface ProposalRecord {
  id: string;
  opportunityId: string;
  version: number;
  opening: string;
  requirementInterpretation: string;
  implementationPlan: string;
  proofPoints: string[];
  assumptions: string[];
  questions: string[];
  recommendedBid: number | null;
  minimumBid: number | null;
  currency: string | null;
  timelineRecommendation: string | null;
  scopeIncluded: string[];
  scopeExcluded: string[];
  body: string;
  status: 'DRAFT' | 'APPROVED' | 'SUPERSEDED' | 'SUBMITTED';
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalRecord {
  id: string;
  opportunityId: string | null;
  jobId: string | null;
  approvalType: ApprovalType;
  requestedPayload: Record<string, unknown>;
  decision: ApprovalDecision;
  decisionNote: string | null;
  requestedAt: string;
  decidedAt: string | null;
  decisionId?: string | null;
}

export interface ApplicationRecord {
  id: string;
  opportunityId: string;
  proposalId: string | null;
  submittedAt: string | null;
  submittedVia: 'MANUAL' | 'OFFICIAL_API' | 'OTHER_PERMITTED';
  actualBid: number | null;
  currency: string | null;
  status: 'PREPARED' | 'SUBMITTED' | 'LOST' | 'WON' | 'WITHDRAWN';
  externalReference: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobRecord {
  id: string;
  jobCode: string;
  opportunityId: string;
  title: string;
  status: JobStatus;
  priority: 'P1' | 'P2' | 'P3';
  score: number;
  estimatedValueUsd: number;
  actualRevenueUsd: number;
  risk: RiskLevel;
  agreedScope: Record<string, unknown>;
  agreedPrice: number;
  currency: string;
  agreedDeadline: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  nextAction: string;
  nextActionOwner: 'codex' | 'human' | 'client' | 'external';
  humanGate: ApprovalType | 'NONE';
  blockedBy: string[];
  branchOrPr: string | null;
  lastCheckpointCommit: string | null;
  acceptanceCriteria: AcceptanceCriterion[];
  tasks: JobTask[];
  latestReview: ReviewRecord | null;
  delivery: DeliveryRecord | null;
  economicOutcome: EconomicOutcomeRecord | null;
}

export interface AcceptanceCriterion {
  id: string;
  description: string;
  verificationMethod: string | null;
  status: 'TODO' | 'PASS' | 'FAIL' | 'WAIVED';
  evidence: string | null;
}

export interface JobTask {
  id: string;
  title: string;
  description: string | null;
  agentRole: string | null;
  status: 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE';
  estimateMinutes: number | null;
  actualMinutes: number | null;
  blockedReason: string | null;
}

export interface ReviewRecord {
  id: string;
  jobId: string;
  verdict: 'NOT_REVIEWED' | 'CHANGES_REQUESTED' | 'APPROVED_INTERNAL' | 'READY_FOR_HUMAN_REVIEW';
  summary: string;
  criteriaResults: Array<{ criterion: string; result: string; evidence: string }>;
  tests: string[];
  securityFindings: string[];
  reviewer: string;
  findings: string[];
  requiredChanges: string[];
  createdAt: string;
}

export interface DeliveryRecord {
  id: string;
  jobId: string;
  version: number;
  summary: string;
  instructions: string;
  testsPerformed: string[];
  limitations: string[];
  artifacts: string[];
  deliveryMessageDraft: string;
  finalApprovalStatus: 'PENDING' | 'APPROVED' | 'DELIVERED';
  status: 'DRAFT' | 'APPROVED' | 'DELIVERED' | 'SUPERSEDED';
  createdAt: string;
  deliveredAt: string | null;
}

export interface EconomicOutcomeRecord {
  id: string;
  jobId: string;
  grossRevenue: number;
  platformFees: number;
  externalCosts: number;
  netRevenue: number;
  tokenCount: number | null;
  estimatedAiMinutes: number | null;
  actualHumanMinutes: number | null;
  revisionsCount: number;
  paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID' | 'REFUNDED';
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DecisionRecord {
  id: string;
  approvalId: string | null;
  opportunityId: string | null;
  jobId: string | null;
  question: string;
  recommendation: string;
  alternatives: string[];
  finalDecision: 'PENDING' | 'APPROVED' | 'REJECTED';
  ownerDecisionNote: string | null;
  decidedBy: 'PENDING' | 'OWNER' | 'CODEX';
  requestedAt: string;
  decidedAt: string | null;
  impact: string | null;
}

export interface ActivityRecord {
  id: string;
  jobId: string;
  type: string;
  summary: string;
  evidence: string;
  nextAction: string;
  createdAt: string;
}

export interface ReconciliationConflictRecord {
  id: string;
  jobId: string | null;
  conflictType:
    | 'DB_STATE_MISMATCH'
    | 'DB_HUMAN_GATE_MISMATCH'
    | 'WORKSPACE_MISSING'
    | 'WORKSPACE_FILE_MISSING'
    | 'GITHUB_WORKSPACE_MISSING'
    | 'CONTROL_BOARD_STALE';
  severity: 'WARNING' | 'BLOCKING';
  details: string;
  detectedAt: string;
  resolvedAt: string | null;
}

export interface AppSettings {
  minimumBudget: number;
  maximumEstimatedAiMinutes: number;
  maximumEstimatedHumanMinutes: number;
  shortlistScoreThreshold: number;
  minimumCompletionProbability: number;
  allowedCategories: string[];
  excludedCategories: string[];
  preferredSources: string[];
  preferredCurrencies: string[];
  riskTolerance: RiskLevel;
  maxActiveJobs: number;
  githubSearchQuery: string;
  githubPerPage: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  minimumBudget: 50,
  maximumEstimatedAiMinutes: 240,
  maximumEstimatedHumanMinutes: 90,
  shortlistScoreThreshold: 75,
  minimumCompletionProbability: 0.65,
  allowedCategories: [],
  excludedCategories: [],
  preferredSources: [],
  preferredCurrencies: ['USD', 'EUR', 'GBP'],
  riskTolerance: 'MEDIUM',
  maxActiveJobs: 3,
  githubSearchQuery: 'is:issue is:open (bounty OR "good first issue") language:TypeScript',
  githubPerPage: 25,
};

export interface AppState {
  version: 2;
  opportunities: OpportunityRecord[];
  scoreSnapshots: ScoreSnapshot[];
  proposals: ProposalRecord[];
  approvals: ApprovalRecord[];
  applications: ApplicationRecord[];
  jobs: JobRecord[];
  reviews: ReviewRecord[];
  deliveries: DeliveryRecord[];
  economicOutcomes: EconomicOutcomeRecord[];
  decisions: DecisionRecord[];
  activities: ActivityRecord[];
  conflicts: ReconciliationConflictRecord[];
  transitions: Array<{
    id: string;
    entityType: 'OPPORTUNITY' | 'JOB' | 'DELIVERY' | 'APPLICATION';
    entityId: string;
    fromState: string | null;
    toState: string;
    actor: 'OWNER' | 'SYSTEM' | 'AGENT';
    reason: string | null;
    createdAt: string;
  }>;
  settings: AppSettings;
}
