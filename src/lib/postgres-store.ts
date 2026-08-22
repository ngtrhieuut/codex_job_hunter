import postgres, { type Sql } from 'postgres';
import {
  DEFAULT_SETTINGS,
  JOB_STATUSES,
  OPPORTUNITY_STATUSES,
  type AcceptanceCriterion,
  type ActivityRecord,
  type ApplicationRecord,
  type AppSettings,
  type AppState,
  type ApprovalRecord,
  type ApprovalType,
  type DeliveryRecord,
  type DecisionRecord,
  type EconomicOutcomeRecord,
  type JobRecord,
  type JobStatus,
  type JobTask,
  type OpportunityRecord,
  type OpportunityStatus,
  type ProposalRecord,
  type ReconciliationConflictRecord,
  type ReviewRecord,
  type RiskLevel,
  type ScoreSnapshot,
} from './app-types';
import { newId, nowIso } from './ids';
import type { AppStore, DashboardSummary, OpportunityQuery } from './store';

type DbRow = Record<string, unknown>;

export type PostgresSqlClient = Sql;

export const JOB_STORAGE_MARKER = '__codexJobHunter';

const SETTING_KEYS = [
  'minimumBudget',
  'maximumEstimatedAiMinutes',
  'maximumEstimatedHumanMinutes',
  'shortlistScoreThreshold',
  'minimumCompletionProbability',
  'allowedCategories',
  'excludedCategories',
  'preferredSources',
  'preferredCurrencies',
  'riskTolerance',
  'maxActiveJobs',
  'githubSearchQuery',
  'githubPerPage',
] as const satisfies readonly (keyof AppSettings)[];

const SETTING_DB_KEYS: Record<(typeof SETTING_KEYS)[number], string> = {
  minimumBudget: 'minimum_budget',
  maximumEstimatedAiMinutes: 'maximum_estimated_ai_minutes',
  maximumEstimatedHumanMinutes: 'maximum_estimated_human_minutes',
  shortlistScoreThreshold: 'shortlist_score_threshold',
  minimumCompletionProbability: 'minimum_completion_probability',
  allowedCategories: 'allowed_categories',
  excludedCategories: 'excluded_categories',
  preferredSources: 'preferred_sources',
  preferredCurrencies: 'preferred_currencies',
  riskTolerance: 'risk_tolerance',
  maxActiveJobs: 'max_active_jobs',
  githubSearchQuery: 'github_search_query',
  githubPerPage: 'github_per_page',
};

const SETTING_KEY_BY_DB_KEY = Object.fromEntries(
  SETTING_KEYS.map((key) => [SETTING_DB_KEYS[key], key]),
) as Record<string, (typeof SETTING_KEYS)[number] | undefined>;

const SCORE_COMPONENTS = {
  technical_fit: 'technicalFit',
  completion_probability: 'completionProbability',
  scope_clarity: 'scopeClarity',
  payment_quality: 'paymentQuality',
  verification_quality: 'verificationQuality',
  repeatability: 'repeatability',
  client_quality: 'clientQuality',
  implementation_effort: 'implementationEffort',
  human_attention: 'humanAttention',
  communication_burden: 'communicationBurden',
  revision_risk: 'revisionRisk',
  platform_risk: 'platformRisk',
  security_risk: 'securityRisk',
  scope_creep_risk: 'scopeCreepRisk',
  scam_risk: 'scamRisk',
} as const;

const OPPORTUNITY_SELECT = `
  SELECT
    o.*,
    (
      SELECT row_to_json(score_row)
      FROM (
        SELECT
          s.id,
          s.opportunity_id,
          s.scoring_version,
          s.technical_fit,
          s.completion_probability,
          s.scope_clarity,
          s.payment_quality,
          s.repeatability,
          s.client_quality,
          s.verification_quality,
          s.implementation_effort,
          s.human_attention,
          s.communication_burden,
          s.revision_risk,
          s.platform_risk,
          s.security_risk,
          s.scope_creep_risk,
          s.scam_risk,
          s.overall_score,
          s.estimated_ai_minutes,
          s.estimated_human_minutes,
          s.estimated_tokens,
          s.win_probability,
          s.expected_net_revenue,
          s.expected_revenue_per_1m_tokens,
          s.assumptions,
          s.risk_flags,
          s.explanation,
          s.created_at
        FROM opportunity_scores s
        WHERE s.opportunity_id = o.id
        ORDER BY s.created_at DESC, s.id DESC
        LIMIT 1
      ) AS score_row
    ) AS latest_score
  FROM opportunities o
  WHERE ($1::uuid IS NULL OR o.id = $1)
  ORDER BY o.created_at ASC, o.id ASC
`;

function isRecord(value: unknown): value is DbRow {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): DbRow {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return isRecord(value) ? value : {};
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return (value ?? fallback) as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function jsonParameter(value: unknown): string {
  const serialized = JSON.stringify(value ?? null);
  return serialized === undefined ? 'null' : serialized;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function stringValue(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : stringValue(value);
}

function dateValue(value: unknown, fallback = ''): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return typeof value === 'string' ? value : fallback;
}

function nullableDate(value: unknown): string | null {
  return value === null || value === undefined ? null : dateValue(value) || null;
}

function numberValue(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stringArray(value: unknown): string[] {
  const parsed = parseJson<unknown>(value, []);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === 'string')
    : [];
}

function stringRecord(value: unknown): Record<string, unknown> {
  return clone(asRecord(parseJson(value, {})));
}

function opportunityStatus(value: unknown): OpportunityStatus {
  return OPPORTUNITY_STATUSES.includes(value as OpportunityStatus)
    ? (value as OpportunityStatus)
    : 'DISCOVERED';
}

function jobStatus(value: unknown): JobStatus {
  return JOB_STATUSES.includes(value as JobStatus) ? (value as JobStatus) : 'DISCOVERED';
}

function riskLevel(value: unknown): RiskLevel {
  return ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(String(value))
    ? (value as RiskLevel)
    : 'MEDIUM';
}

function approvalType(value: unknown): ApprovalType {
  return [
    'APPLY',
    'PRICE',
    'CONTRACT',
    'SCOPE_CHANGE',
    'DELIVERY',
    'SPEND',
    'ACCOUNT_CHANGE',
  ].includes(String(value))
    ? (value as ApprovalType)
    : 'APPLY';
}

function approvalDecision(value: unknown): ApprovalRecord['decision'] {
  return ['PENDING', 'APPROVED', 'REJECTED'].includes(String(value))
    ? (value as ApprovalRecord['decision'])
    : 'PENDING';
}

function proposalStatus(value: unknown): ProposalRecord['status'] {
  return ['DRAFT', 'APPROVED', 'SUPERSEDED', 'SUBMITTED'].includes(String(value))
    ? (value as ProposalRecord['status'])
    : 'DRAFT';
}

function nextActionOwner(value: unknown): JobRecord['nextActionOwner'] {
  return ['codex', 'human', 'client', 'external'].includes(String(value))
    ? (value as JobRecord['nextActionOwner'])
    : 'human';
}

function humanGate(value: unknown): JobRecord['humanGate'] {
  return [
    'NONE',
    'APPLY',
    'PRICE',
    'CONTRACT',
    'SCOPE_CHANGE',
    'DELIVERY',
    'SPEND',
    'ACCOUNT_CHANGE',
  ].includes(String(value))
    ? (value as JobRecord['humanGate'])
    : 'NONE';
}

function scoreComponent(components: DbRow, column: keyof typeof SCORE_COMPONENTS): number {
  return numberValue(components[column] ?? components[SCORE_COMPONENTS[column]]);
}

export function mapScoreRow(input: unknown): ScoreSnapshot {
  const row = asRecord(input);
  const rawComponents = asRecord(parseJson(row.components, {}));
  const components = Object.fromEntries(
    (Object.keys(SCORE_COMPONENTS) as Array<keyof typeof SCORE_COMPONENTS>).map((column) => [
      column,
      scoreComponent(row[column] === undefined ? rawComponents : row, column),
    ]),
  );
  return {
    id: stringValue(row.id),
    opportunityId: stringValue(row.opportunity_id ?? row.opportunityId),
    scoringVersion: stringValue(row.scoring_version ?? row.scoringVersion),
    components,
    overallScore: numberValue(row.overall_score ?? row.overallScore),
    estimatedAiMinutes: nullableNumber(row.estimated_ai_minutes ?? row.estimatedAiMinutes),
    estimatedHumanMinutes: nullableNumber(row.estimated_human_minutes ?? row.estimatedHumanMinutes),
    estimatedTokens: nullableNumber(row.estimated_tokens ?? row.estimatedTokens),
    completionProbability: numberValue(row.completion_probability ?? row.completionProbability),
    winProbability: numberValue(row.win_probability ?? row.winProbability),
    expectedNetRevenue: numberValue(row.expected_net_revenue ?? row.expectedNetRevenue),
    expectedRevenuePer1mTokens: nullableNumber(
      row.expected_revenue_per_1m_tokens ?? row.expectedRevenuePer1mTokens,
    ),
    assumptions: stringArray(row.assumptions),
    riskFlags: stringArray(row.risk_flags ?? row.riskFlags),
    explanation: stringArray(row.explanation),
    createdAt: dateValue(row.created_at ?? row.createdAt),
  };
}

export function mapOpportunityRow(input: unknown): OpportunityRecord {
  const row = asRecord(input);
  const latestScoreRaw = parseJson(row.latest_score ?? row.latestScore, null);
  const scoreHistoryRaw = parseJson<unknown>(row.score_history ?? row.scoreHistory, []);
  const mappedHistory = Array.isArray(scoreHistoryRaw) ? scoreHistoryRaw.map(mapScoreRow) : [];
  const latestScore = latestScoreRaw
    ? mapScoreRow(latestScoreRaw)
    : mappedHistory.length
      ? mappedHistory[mappedHistory.length - 1]
      : null;
  const scoreHistory = mappedHistory.length
    ? mappedHistory
    : latestScore
      ? [clone(latestScore)]
      : [];
  return {
    id: stringValue(row.id),
    source: stringValue(row.source),
    externalId: nullableString(row.external_id ?? row.externalId),
    sourceUrl: nullableString(row.source_url ?? row.sourceUrl),
    title: stringValue(row.title),
    originalDescription: stringValue(row.original_description ?? row.originalDescription),
    normalizedSummary: stringValue(row.normalized_summary ?? row.normalizedSummary),
    category: stringValue(row.category),
    technologies: stringArray(row.technologies),
    deliverables: stringArray(row.deliverables),
    inferredAcceptanceCriteria: stringArray(
      row.inferred_acceptance_criteria ?? row.inferredAcceptanceCriteria,
    ),
    missingInformation: stringArray(row.missing_information ?? row.missingInformation),
    budgetMin: nullableNumber(row.budget_min ?? row.budgetMin),
    budgetMax: nullableNumber(row.budget_max ?? row.budgetMax),
    currency: nullableString(row.currency),
    explicitDeadline: nullableDate(row.explicit_deadline ?? row.explicitDeadline),
    discoveredAt: dateValue(row.discovered_at ?? row.discoveredAt),
    postedAt: nullableDate(row.posted_at ?? row.postedAt),
    rawMetadata: stringRecord(row.raw_metadata ?? row.rawMetadata),
    status: opportunityStatus(row.status),
    hardFilterReason: nullableString(row.hard_filter_reason ?? row.hardFilterReason),
    duplicateOf: nullableString(row.duplicate_of ?? row.duplicateOf),
    createdAt: dateValue(row.created_at ?? row.createdAt),
    updatedAt: dateValue(row.updated_at ?? row.updatedAt),
    latestScore,
    scoreHistory,
  };
}

export function mapProposalRow(input: unknown): ProposalRecord {
  const row = asRecord(input);
  return {
    id: stringValue(row.id),
    opportunityId: stringValue(row.opportunity_id ?? row.opportunityId),
    version: numberValue(row.version),
    opening: stringValue(row.opening),
    requirementInterpretation: stringValue(
      row.requirement_interpretation ?? row.requirementInterpretation,
    ),
    implementationPlan: stringValue(row.implementation_plan ?? row.implementationPlan),
    proofPoints: stringArray(row.proof_points ?? row.proofPoints),
    assumptions: stringArray(row.assumptions),
    questions: stringArray(row.questions),
    recommendedBid: nullableNumber(row.recommended_bid ?? row.recommendedBid),
    minimumBid: nullableNumber(row.minimum_bid ?? row.minimumBid),
    currency: nullableString(row.currency),
    timelineRecommendation: nullableString(
      row.timeline_recommendation ?? row.timelineRecommendation,
    ),
    scopeIncluded: stringArray(row.scope_included ?? row.scopeIncluded),
    scopeExcluded: stringArray(row.scope_excluded ?? row.scopeExcluded),
    body: stringValue(row.body),
    status: proposalStatus(row.status),
    createdAt: dateValue(row.created_at ?? row.createdAt),
    updatedAt: dateValue(row.updated_at ?? row.updatedAt),
  };
}

export function mapApprovalRow(input: unknown): ApprovalRecord {
  const row = asRecord(input);
  return {
    id: stringValue(row.id),
    opportunityId: nullableString(row.opportunity_id ?? row.opportunityId),
    jobId: nullableString(row.job_id ?? row.jobId),
    approvalType: approvalType(row.approval_type ?? row.approvalType),
    requestedPayload: stringRecord(row.requested_payload ?? row.requestedPayload),
    decision: approvalDecision(row.decision),
    decisionNote: nullableString(row.decision_note ?? row.decisionNote),
    requestedAt: dateValue(row.requested_at ?? row.requestedAt),
    decidedAt: nullableDate(row.decided_at ?? row.decidedAt),
    decisionId: nullableString(row.decision_id ?? row.decisionId),
  };
}

function mapCriterionRow(input: unknown): AcceptanceCriterion {
  const row = asRecord(input);
  return {
    id: stringValue(row.id),
    description: stringValue(row.description),
    verificationMethod: nullableString(row.verification_method ?? row.verificationMethod),
    status: ['TODO', 'PASS', 'FAIL', 'WAIVED'].includes(String(row.status))
      ? (row.status as AcceptanceCriterion['status'])
      : 'TODO',
    evidence: nullableString(row.evidence),
  };
}

function mapTaskRow(input: unknown): JobTask {
  const row = asRecord(input);
  return {
    id: stringValue(row.id),
    title: stringValue(row.title),
    description: nullableString(row.description),
    agentRole: nullableString(row.agent_role ?? row.agentRole),
    status: ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'].includes(String(row.status))
      ? (row.status as JobTask['status'])
      : 'TODO',
    estimateMinutes: nullableNumber(row.estimate_minutes ?? row.estimateMinutes),
    actualMinutes: nullableNumber(row.actual_minutes ?? row.actualMinutes),
    blockedReason: nullableString(row.blocked_reason ?? row.blockedReason),
  };
}

function criteriaResults(value: unknown): ReviewRecord['criteriaResults'] {
  const parsed = parseJson<unknown>(value, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isRecord).map((item) => ({
    criterion: stringValue(item.criterion),
    result: stringValue(item.result),
    evidence: stringValue(item.evidence),
  }));
}

function mapReviewValue(input: unknown, fallbackJobId = ''): ReviewRecord | null {
  if (!isRecord(input)) return null;
  return {
    id: stringValue(input.id),
    jobId: stringValue(input.jobId ?? input.job_id, fallbackJobId),
    verdict: [
      'NOT_REVIEWED',
      'CHANGES_REQUESTED',
      'APPROVED_INTERNAL',
      'READY_FOR_HUMAN_REVIEW',
    ].includes(String(input.verdict))
      ? (input.verdict as ReviewRecord['verdict'])
      : 'NOT_REVIEWED',
    summary: stringValue(input.summary),
    criteriaResults: criteriaResults(input.criteriaResults ?? input.criteria_result),
    tests: stringArray(input.tests ?? input.tests_result),
    securityFindings: stringArray(input.securityFindings ?? input.security_result),
    reviewer: stringValue(input.reviewer, 'QA Agent'),
    findings: stringArray(input.findings),
    requiredChanges: stringArray(input.requiredChanges ?? input.required_changes),
    createdAt: dateValue(input.createdAt ?? input.created_at),
  };
}

export function mapReviewRow(input: unknown): ReviewRecord {
  const row = asRecord(input);
  const documentation = asRecord(parseJson(row.documentation_result, {}));
  const embedded = mapReviewValue(documentation.review, stringValue(row.job_id));
  return (
    embedded ||
    mapReviewValue(
      {
        id: row.id,
        jobId: row.job_id,
        verdict: row.verdict,
        summary: documentation.summary,
        criteriaResults: row.criteria_result,
        tests: row.tests_result,
        securityFindings: row.security_result,
        reviewer: row.reviewer,
        findings: row.findings,
        requiredChanges: row.required_changes,
        createdAt: row.created_at,
      },
      stringValue(row.job_id),
    ) || {
      id: stringValue(row.id),
      jobId: stringValue(row.job_id),
      verdict: 'NOT_REVIEWED',
      summary: '',
      criteriaResults: [],
      tests: [],
      securityFindings: [],
      reviewer: 'QA Agent',
      findings: [],
      requiredChanges: [],
      createdAt: dateValue(row.created_at),
    }
  );
}

function mapEconomicRow(input: unknown): EconomicOutcomeRecord | null {
  if (!input) return null;
  const row = asRecord(input);
  return {
    id: stringValue(row.id),
    jobId: stringValue(row.job_id ?? row.jobId),
    grossRevenue: numberValue(row.gross_revenue ?? row.grossRevenue),
    platformFees: numberValue(row.platform_fees ?? row.platformFees),
    externalCosts: numberValue(row.external_costs ?? row.externalCosts),
    netRevenue: numberValue(row.net_revenue ?? row.netRevenue),
    tokenCount: nullableNumber(row.token_count ?? row.tokenCount),
    estimatedAiMinutes: nullableNumber(row.estimated_ai_minutes ?? row.estimatedAiMinutes),
    actualHumanMinutes: nullableNumber(row.actual_human_minutes ?? row.actualHumanMinutes),
    revisionsCount: numberValue(row.revisions_count ?? row.revisionsCount),
    paymentStatus: ['UNPAID', 'PARTIAL', 'PAID', 'REFUNDED'].includes(
      String(row.payment_status ?? row.paymentStatus),
    )
      ? ((row.payment_status ?? row.paymentStatus) as EconomicOutcomeRecord['paymentStatus'])
      : 'UNPAID',
    paidAt: nullableDate(row.paid_at ?? row.paidAt),
    createdAt: dateValue(row.created_at ?? row.createdAt),
    updatedAt: dateValue(row.updated_at ?? row.updatedAt),
  };
}

function mapDeliveryRow(input: unknown): DeliveryRecord | null {
  if (!input) return null;
  const row = asRecord(input);
  return {
    id: stringValue(row.id),
    jobId: stringValue(row.job_id ?? row.jobId),
    version: numberValue(row.version),
    summary: stringValue(row.summary),
    instructions: stringValue(row.instructions),
    testsPerformed: stringArray(row.tests_performed ?? row.testsPerformed),
    limitations: stringArray(row.limitations),
    artifacts: stringArray(row.artifacts),
    deliveryMessageDraft: stringValue(row.delivery_message_draft ?? row.deliveryMessageDraft),
    finalApprovalStatus: ['PENDING', 'APPROVED', 'DELIVERED'].includes(
      String(row.final_approval_status ?? row.finalApprovalStatus),
    )
      ? ((row.final_approval_status ??
          row.finalApprovalStatus) as DeliveryRecord['finalApprovalStatus'])
      : 'PENDING',
    status: ['DRAFT', 'APPROVED', 'DELIVERED', 'SUPERSEDED'].includes(String(row.status))
      ? (row.status as DeliveryRecord['status'])
      : 'DRAFT',
    createdAt: dateValue(row.created_at ?? row.createdAt),
    deliveredAt: nullableDate(row.delivered_at ?? row.deliveredAt),
  };
}

function mapApplicationRow(input: unknown): ApplicationRecord {
  const row = asRecord(input);
  return {
    id: stringValue(row.id),
    opportunityId: stringValue(row.opportunity_id ?? row.opportunityId),
    proposalId: nullableString(row.proposal_id ?? row.proposalId),
    submittedAt: nullableDate(row.submitted_at ?? row.submittedAt),
    submittedVia: ['MANUAL', 'OFFICIAL_API', 'OTHER_PERMITTED'].includes(
      String(row.submitted_via ?? row.submittedVia),
    )
      ? ((row.submitted_via ?? row.submittedVia) as ApplicationRecord['submittedVia'])
      : 'MANUAL',
    actualBid: nullableNumber(row.actual_bid ?? row.actualBid),
    currency: nullableString(row.currency),
    status: ['PREPARED', 'SUBMITTED', 'LOST', 'WON', 'WITHDRAWN'].includes(String(row.status))
      ? (row.status as ApplicationRecord['status'])
      : 'PREPARED',
    externalReference: nullableString(row.external_reference ?? row.externalReference),
    notes: nullableString(row.notes),
    createdAt: dateValue(row.created_at ?? row.createdAt),
    updatedAt: dateValue(row.updated_at ?? row.updatedAt),
  };
}

function mapDecisionRow(input: unknown): DecisionRecord {
  const row = asRecord(input);
  return {
    id: stringValue(row.id),
    approvalId: nullableString(row.approval_id ?? row.approvalId),
    opportunityId: nullableString(row.opportunity_id ?? row.opportunityId),
    jobId: nullableString(row.job_id ?? row.jobId),
    question: stringValue(row.question),
    recommendation: stringValue(row.recommendation),
    alternatives: stringArray(row.alternatives),
    finalDecision: ['PENDING', 'APPROVED', 'REJECTED'].includes(String(row.final_decision))
      ? (row.final_decision as DecisionRecord['finalDecision'])
      : 'PENDING',
    ownerDecisionNote: nullableString(row.owner_decision_note),
    decidedBy: ['PENDING', 'OWNER', 'CODEX'].includes(String(row.decided_by))
      ? (row.decided_by as DecisionRecord['decidedBy'])
      : 'PENDING',
    requestedAt: dateValue(row.requested_at),
    decidedAt: nullableDate(row.decided_at),
    impact: nullableString(row.impact),
  };
}

function mapActivityRow(input: unknown): ActivityRecord {
  const row = asRecord(input);
  return {
    id: stringValue(row.id),
    jobId: stringValue(row.job_id ?? row.jobId),
    type: stringValue(row.activity_type ?? row.type),
    summary: stringValue(row.summary),
    evidence: stringValue(row.evidence),
    nextAction: stringValue(row.next_action ?? row.nextAction),
    createdAt: dateValue(row.created_at ?? row.createdAt),
  };
}

function mapConflictRow(input: unknown): ReconciliationConflictRecord {
  const row = asRecord(input);
  return {
    id: stringValue(row.id),
    jobId: nullableString(row.job_id ?? row.jobId),
    conflictType: [
      'DB_STATE_MISMATCH',
      'DB_HUMAN_GATE_MISMATCH',
      'WORKSPACE_MISSING',
      'WORKSPACE_FILE_MISSING',
      'GITHUB_WORKSPACE_MISSING',
      'CONTROL_BOARD_STALE',
    ].includes(String(row.conflict_type ?? row.conflictType))
      ? ((row.conflict_type ?? row.conflictType) as ReconciliationConflictRecord['conflictType'])
      : 'DB_STATE_MISMATCH',
    severity: ['WARNING', 'BLOCKING'].includes(String(row.severity))
      ? (row.severity as ReconciliationConflictRecord['severity'])
      : 'BLOCKING',
    details: stringValue(row.details),
    detectedAt: dateValue(row.detected_at ?? row.detectedAt),
    resolvedAt: nullableDate(row.resolved_at ?? row.resolvedAt),
  };
}

interface JobStorageParts {
  agreedScope: Record<string, unknown>;
  metadata: DbRow;
}

export function serializeJobStorage(job: JobRecord): Record<string, unknown> {
  return {
    [JOB_STORAGE_MARKER]: {
      version: 1,
      scope: clone(job.agreedScope),
      metadata: {
        score: job.score,
        estimatedValueUsd: job.estimatedValueUsd,
        actualRevenueUsd: job.actualRevenueUsd,
        priority: job.priority,
        risk: job.risk,
        nextAction: job.nextAction,
        nextActionOwner: job.nextActionOwner,
        humanGate: job.humanGate,
        blockedBy: clone(job.blockedBy),
        branchOrPr: job.branchOrPr,
        lastCheckpointCommit: job.lastCheckpointCommit,
        latestReview: job.latestReview ? clone(job.latestReview) : null,
        delivery: job.delivery ? clone(job.delivery) : null,
        economicOutcome: job.economicOutcome ? clone(job.economicOutcome) : null,
        economic: {
          grossRevenue: job.actualRevenueUsd,
          netRevenue: job.actualRevenueUsd,
        },
      },
    },
  };
}

function deserializeJobStorage(value: unknown): JobStorageParts {
  const root = asRecord(parseJson(value, {}));
  const envelope = asRecord(root[JOB_STORAGE_MARKER]);
  if (numberValue(envelope.version, 0) === 1 && isRecord(envelope.scope)) {
    return {
      agreedScope: clone(envelope.scope),
      metadata: asRecord(envelope.metadata),
    };
  }
  return { agreedScope: root, metadata: {} };
}

interface JobRelatedRows {
  acceptanceCriteria?: readonly unknown[];
  tasks?: readonly unknown[];
  latestReview?: ReviewRecord | null;
  delivery?: DeliveryRecord | null;
  economicOutcome?: EconomicOutcomeRecord | null;
}

export function mapJobRow(input: unknown, related: JobRelatedRows = {}): JobRecord {
  const row = asRecord(input);
  const storage = deserializeJobStorage(row.agreed_scope ?? row.agreedScope);
  const metadata = storage.metadata;
  const economic = related.economicOutcome;
  const metadataEconomic = asRecord(metadata.economic);
  const metadataReview = mapReviewValue(metadata.latestReview, stringValue(row.id));
  const latestReview = related.latestReview !== undefined ? related.latestReview : metadataReview;
  const actualRevenueUsd =
    row.actual_revenue_usd !== undefined || row.actualRevenueUsd !== undefined
      ? numberValue(row.actual_revenue_usd ?? row.actualRevenueUsd)
      : economic
        ? numberValue(economic.grossRevenue)
        : numberValue(metadata.actualRevenueUsd ?? metadataEconomic.grossRevenue);

  return {
    id: stringValue(row.id),
    jobCode: stringValue(row.job_code ?? row.jobCode),
    opportunityId: stringValue(row.opportunity_id ?? row.opportunityId),
    title: stringValue(row.title),
    status: jobStatus(row.status),
    priority: ['P1', 'P2', 'P3'].includes(String(row.priority ?? metadata.priority))
      ? ((row.priority ?? metadata.priority) as JobRecord['priority'])
      : 'P2',
    score: numberValue(row.score ?? metadata.score),
    estimatedValueUsd: numberValue(row.estimated_value_usd ?? metadata.estimatedValueUsd),
    actualRevenueUsd,
    risk: riskLevel(row.risk ?? metadata.risk),
    agreedScope: storage.agreedScope,
    agreedPrice: numberValue(row.agreed_price ?? row.agreedPrice),
    currency: stringValue(row.currency, 'USD'),
    agreedDeadline: nullableDate(row.agreed_deadline ?? row.agreedDeadline),
    createdAt: dateValue(row.created_at ?? row.createdAt),
    updatedAt: dateValue(row.updated_at ?? row.updatedAt),
    startedAt: nullableDate(row.started_at ?? row.startedAt),
    completedAt: nullableDate(row.completed_at ?? row.completedAt),
    nextAction: stringValue(row.next_action ?? metadata.nextAction),
    nextActionOwner: nextActionOwner(row.next_action_owner ?? metadata.nextActionOwner),
    humanGate: humanGate(row.human_gate ?? metadata.humanGate),
    blockedBy: stringArray(row.blocked_by ?? metadata.blockedBy),
    branchOrPr: nullableString(row.branch_or_pr ?? metadata.branchOrPr),
    lastCheckpointCommit: nullableString(
      row.last_checkpoint_commit ?? metadata.lastCheckpointCommit,
    ),
    acceptanceCriteria: (related.acceptanceCriteria || []).map(mapCriterionRow),
    tasks: (related.tasks || []).map(mapTaskRow),
    latestReview: latestReview ? clone(latestReview) : null,
    delivery: related.delivery !== undefined ? related.delivery : mapDeliveryRow(metadata.delivery),
    economicOutcome:
      related.economicOutcome !== undefined
        ? related.economicOutcome
        : mapEconomicRow(metadata.economicOutcome),
  };
}

function rowsOf(value: unknown): DbRow[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

async function opportunityRows(client: Sql, id: string | null = null): Promise<DbRow[]> {
  const rows = await client.unsafe(OPPORTUNITY_SELECT, [id]);
  return rowsOf(rows);
}

async function scoreRows(client: Sql, opportunityId: string | null = null): Promise<DbRow[]> {
  const rows = await client`
    SELECT * FROM opportunity_scores
    WHERE (${opportunityId}::uuid IS NULL OR opportunity_id = ${opportunityId})
    ORDER BY opportunity_id ASC, created_at ASC, id ASC
  `;
  return rowsOf(rows);
}

async function readOpportunities(
  client: Sql,
  id: string | null = null,
): Promise<OpportunityRecord[]> {
  const [baseRows, snapshots] = await Promise.all([
    opportunityRows(client, id),
    scoreRows(client, id),
  ]);
  const historyByOpportunity = new Map<string, DbRow[]>();
  for (const snapshot of snapshots) {
    const key = stringValue(snapshot.opportunity_id);
    const history = historyByOpportunity.get(key) || [];
    history.push(snapshot);
    historyByOpportunity.set(key, history);
  }
  return baseRows.map((row) => {
    const history = historyByOpportunity.get(stringValue(row.id)) || [];
    return mapOpportunityRow({
      ...row,
      score_history: history,
    });
  });
}

async function jobRows(client: Sql, id: string | null = null): Promise<DbRow[]> {
  const rows = await client`
    SELECT *
    FROM jobs
    WHERE (${id}::uuid IS NULL OR jobs.id = ${id})
    ORDER BY created_at ASC, id ASC
  `;
  return rowsOf(rows);
}

async function relatedRows(
  client: Sql,
  table: 'acceptance_criteria' | 'job_tasks' | 'qa_runs' | 'deliveries' | 'economic_outcomes',
  jobId: string | null,
): Promise<DbRow[]> {
  if (table === 'acceptance_criteria') {
    const rows = await client`
      SELECT * FROM acceptance_criteria
      WHERE (${jobId}::uuid IS NULL OR job_id = ${jobId})
      ORDER BY job_id ASC, created_at ASC, id ASC
    `;
    return rowsOf(rows);
  }
  if (table === 'job_tasks') {
    const rows = await client`
      SELECT * FROM job_tasks
      WHERE (${jobId}::uuid IS NULL OR job_id = ${jobId})
      ORDER BY job_id ASC, created_at ASC, id ASC
    `;
    return rowsOf(rows);
  }
  if (table === 'qa_runs') {
    const rows = await client`
      SELECT * FROM qa_runs
      WHERE (${jobId}::uuid IS NULL OR job_id = ${jobId})
      ORDER BY job_id ASC, created_at DESC, id DESC
    `;
    return rowsOf(rows);
  }
  if (table === 'deliveries') {
    const rows = await client`
      SELECT * FROM deliveries
      WHERE (${jobId}::uuid IS NULL OR job_id = ${jobId})
      ORDER BY job_id ASC, version DESC, created_at DESC, id DESC
    `;
    return rowsOf(rows);
  }
  const rows = await client`
    SELECT * FROM economic_outcomes
    WHERE (${jobId}::uuid IS NULL OR job_id = ${jobId})
    ORDER BY job_id ASC, updated_at DESC, created_at DESC, id DESC
  `;
  return rowsOf(rows);
}

async function readJobs(client: Sql, id: string | null = null): Promise<JobRecord[]> {
  const [baseRows, criteriaRows, taskRows, reviewRows, deliveryRows, economicRows] =
    await Promise.all([
      jobRows(client, id),
      relatedRows(client, 'acceptance_criteria', id),
      relatedRows(client, 'job_tasks', id),
      relatedRows(client, 'qa_runs', id),
      relatedRows(client, 'deliveries', id),
      relatedRows(client, 'economic_outcomes', id),
    ]);
  const criteriaByJob = new Map<string, DbRow[]>();
  const tasksByJob = new Map<string, DbRow[]>();
  const latestReviewByJob = new Map<string, ReviewRecord>();
  const latestDeliveryByJob = new Map<string, DeliveryRecord>();
  const economicByJob = new Map<string, EconomicOutcomeRecord>();

  for (const row of criteriaRows) {
    const key = stringValue(row.job_id);
    const values = criteriaByJob.get(key) || [];
    values.push(row);
    criteriaByJob.set(key, values);
  }
  for (const row of taskRows) {
    const key = stringValue(row.job_id);
    const values = tasksByJob.get(key) || [];
    values.push(row);
    tasksByJob.set(key, values);
  }
  for (const row of reviewRows) {
    const key = stringValue(row.job_id);
    if (!latestReviewByJob.has(key)) latestReviewByJob.set(key, mapReviewRow(row));
  }
  for (const row of deliveryRows) {
    const key = stringValue(row.job_id);
    if (!latestDeliveryByJob.has(key)) {
      const delivery = mapDeliveryRow(row);
      if (delivery) latestDeliveryByJob.set(key, delivery);
    }
  }
  for (const row of economicRows) {
    const key = stringValue(row.job_id);
    if (!economicByJob.has(key)) {
      const economic = mapEconomicRow(row);
      if (economic) economicByJob.set(key, economic);
    }
  }

  return baseRows.map((row) => {
    const key = stringValue(row.id);
    const related: JobRelatedRows = {
      acceptanceCriteria: criteriaByJob.get(key) || [],
      tasks: tasksByJob.get(key) || [],
    };
    const delivery = latestDeliveryByJob.get(key);
    if (delivery) related.delivery = delivery;
    const economicOutcome = economicByJob.get(key);
    if (economicOutcome) related.economicOutcome = economicOutcome;
    const review = latestReviewByJob.get(key);
    if (review) related.latestReview = review;
    return mapJobRow(row, related);
  });
}

async function readReviews(client: Sql): Promise<ReviewRecord[]> {
  const rows = await relatedRows(client, 'qa_runs', null);
  return rows.map(mapReviewRow);
}

function settingsFromRows(input: readonly DbRow[]): AppSettings {
  const settings = clone(DEFAULT_SETTINGS);
  for (const row of input) {
    const key = SETTING_KEY_BY_DB_KEY[stringValue(row.key)];
    if (!key) continue;
    const value = parseJson(row.value, undefined);
    if (value !== undefined) (settings as AppSettings)[key] = clone(value) as never;
  }
  return settings;
}

async function readSettingsRows(client: Sql): Promise<DbRow[]> {
  const rows = await client`SELECT key, value FROM system_settings ORDER BY key ASC`;
  return rowsOf(rows);
}

async function insertTransition(
  client: Sql,
  transition: AppState['transitions'][number],
): Promise<void> {
  await client`
    INSERT INTO state_transitions
      (id, entity_type, entity_id, from_state, to_state, actor, reason, metadata, created_at)
    VALUES
      (${transition.id}, ${transition.entityType}, ${transition.entityId}, ${transition.fromState},
       ${transition.toState}, ${transition.actor}, ${transition.reason},
       ${jsonParameter({})}::jsonb, ${transition.createdAt})
  `;
}

function componentForScore(score: ScoreSnapshot, column: keyof typeof SCORE_COMPONENTS): number {
  const components = score.components as Record<string, unknown>;
  return numberValue(components[column] ?? components[SCORE_COMPONENTS[column]]);
}

async function upsertScore(
  client: Sql,
  score: ScoreSnapshot,
  opportunityId: string,
): Promise<void> {
  await client`
    INSERT INTO opportunity_scores
      (id, opportunity_id, scoring_version, technical_fit, completion_probability, scope_clarity,
       payment_quality, repeatability, client_quality, verification_quality, implementation_effort,
       human_attention, communication_burden, revision_risk, platform_risk, security_risk,
       scope_creep_risk, scam_risk, overall_score, estimated_ai_minutes, estimated_human_minutes,
       estimated_tokens, win_probability, expected_net_revenue, expected_revenue_per_1m_tokens,
       assumptions, risk_flags, explanation, created_at)
    VALUES
      (${score.id}, ${opportunityId}, ${score.scoringVersion},
       ${componentForScore(score, 'technical_fit')}, ${componentForScore(score, 'completion_probability')},
       ${componentForScore(score, 'scope_clarity')}, ${componentForScore(score, 'payment_quality')},
       ${componentForScore(score, 'repeatability')}, ${componentForScore(score, 'client_quality')},
       ${componentForScore(score, 'verification_quality')}, ${componentForScore(score, 'implementation_effort')},
       ${componentForScore(score, 'human_attention')}, ${componentForScore(score, 'communication_burden')},
       ${componentForScore(score, 'revision_risk')}, ${componentForScore(score, 'platform_risk')},
       ${componentForScore(score, 'security_risk')}, ${componentForScore(score, 'scope_creep_risk')},
       ${componentForScore(score, 'scam_risk')}, ${score.overallScore}, ${score.estimatedAiMinutes},
       ${score.estimatedHumanMinutes}, ${score.estimatedTokens}, ${score.winProbability},
       ${score.expectedNetRevenue}, ${score.expectedRevenuePer1mTokens},
       ${jsonParameter(score.assumptions)}::jsonb, ${jsonParameter(score.riskFlags)}::jsonb,
       ${jsonParameter(score.explanation)}::jsonb, ${score.createdAt})
    ON CONFLICT (id) DO UPDATE SET
      opportunity_id = EXCLUDED.opportunity_id,
      scoring_version = EXCLUDED.scoring_version,
      technical_fit = EXCLUDED.technical_fit,
      completion_probability = EXCLUDED.completion_probability,
      scope_clarity = EXCLUDED.scope_clarity,
      payment_quality = EXCLUDED.payment_quality,
      repeatability = EXCLUDED.repeatability,
      client_quality = EXCLUDED.client_quality,
      verification_quality = EXCLUDED.verification_quality,
      implementation_effort = EXCLUDED.implementation_effort,
      human_attention = EXCLUDED.human_attention,
      communication_burden = EXCLUDED.communication_burden,
      revision_risk = EXCLUDED.revision_risk,
      platform_risk = EXCLUDED.platform_risk,
      security_risk = EXCLUDED.security_risk,
      scope_creep_risk = EXCLUDED.scope_creep_risk,
      scam_risk = EXCLUDED.scam_risk,
      overall_score = EXCLUDED.overall_score,
      estimated_ai_minutes = EXCLUDED.estimated_ai_minutes,
      estimated_human_minutes = EXCLUDED.estimated_human_minutes,
      estimated_tokens = EXCLUDED.estimated_tokens,
      win_probability = EXCLUDED.win_probability,
      expected_net_revenue = EXCLUDED.expected_net_revenue,
      expected_revenue_per_1m_tokens = EXCLUDED.expected_revenue_per_1m_tokens,
      assumptions = EXCLUDED.assumptions,
      risk_flags = EXCLUDED.risk_flags,
      explanation = EXCLUDED.explanation,
      created_at = EXCLUDED.created_at
  `;
}

async function insertOpportunity(
  client: Sql,
  opportunity: OpportunityRecord,
  existingId: string | null,
): Promise<string> {
  const persistedId = existingId || opportunity.id;
  const normalizedRecord = {
    id: opportunity.id,
    source: opportunity.source,
    externalId: opportunity.externalId,
    sourceUrl: opportunity.sourceUrl,
    title: opportunity.title,
    originalDescription: opportunity.originalDescription,
    normalizedSummary: opportunity.normalizedSummary,
    category: opportunity.category,
    technologies: clone(opportunity.technologies),
    deliverables: clone(opportunity.deliverables),
    inferredAcceptanceCriteria: clone(opportunity.inferredAcceptanceCriteria),
    missingInformation: clone(opportunity.missingInformation),
    budgetMin: opportunity.budgetMin,
    budgetMax: opportunity.budgetMax,
    currency: opportunity.currency,
    explicitDeadline: opportunity.explicitDeadline,
    discoveredAt: opportunity.discoveredAt,
    postedAt: opportunity.postedAt,
    rawMetadata: clone(opportunity.rawMetadata),
  };
  if (existingId) {
    await client`
      UPDATE opportunities SET
        source = ${opportunity.source},
        external_id = ${opportunity.externalId},
        source_url = ${opportunity.sourceUrl},
        title = ${opportunity.title},
        original_description = ${opportunity.originalDescription},
        normalized_summary = ${opportunity.normalizedSummary},
        category = ${opportunity.category},
        technologies = ${jsonParameter(opportunity.technologies)}::jsonb,
        deliverables = ${jsonParameter(opportunity.deliverables)}::jsonb,
        inferred_acceptance_criteria = ${jsonParameter(opportunity.inferredAcceptanceCriteria)}::jsonb,
        missing_information = ${jsonParameter(opportunity.missingInformation)}::jsonb,
        budget_min = ${opportunity.budgetMin},
        budget_max = ${opportunity.budgetMax},
        currency = ${opportunity.currency},
        explicit_deadline = ${opportunity.explicitDeadline},
        discovered_at = ${opportunity.discoveredAt},
        posted_at = ${opportunity.postedAt},
        raw_metadata = ${jsonParameter(opportunity.rawMetadata)}::jsonb,
        normalized_record = ${jsonParameter(normalizedRecord)}::jsonb,
        status = ${opportunity.status},
        hard_filter_reason = ${opportunity.hardFilterReason},
        duplicate_of = ${opportunity.duplicateOf},
        updated_at = ${nowIso()}
      WHERE id = ${existingId}
    `;
  } else {
    await client`
      INSERT INTO opportunities
        (id, source, external_id, source_url, title, original_description, normalized_summary,
         category, technologies, deliverables, inferred_acceptance_criteria, missing_information,
         budget_min, budget_max, currency, explicit_deadline, discovered_at, posted_at,
         raw_metadata, normalized_record, status, hard_filter_reason, duplicate_of, created_at, updated_at)
      VALUES
        (${opportunity.id}, ${opportunity.source}, ${opportunity.externalId}, ${opportunity.sourceUrl},
         ${opportunity.title}, ${opportunity.originalDescription}, ${opportunity.normalizedSummary},
         ${opportunity.category}, ${jsonParameter(opportunity.technologies)}::jsonb,
         ${jsonParameter(opportunity.deliverables)}::jsonb,
         ${jsonParameter(opportunity.inferredAcceptanceCriteria)}::jsonb,
         ${jsonParameter(opportunity.missingInformation)}::jsonb, ${opportunity.budgetMin},
         ${opportunity.budgetMax}, ${opportunity.currency}, ${opportunity.explicitDeadline},
         ${opportunity.discoveredAt}, ${opportunity.postedAt}, ${jsonParameter(opportunity.rawMetadata)}::jsonb,
         ${jsonParameter(normalizedRecord)}::jsonb,
         ${opportunity.status}, ${opportunity.hardFilterReason}, ${opportunity.duplicateOf},
         ${opportunity.createdAt}, ${nowIso()})
    `;
  }
  return persistedId;
}

async function findOpportunityId(
  client: Sql,
  opportunity: OpportunityRecord,
): Promise<string | null> {
  const rows = opportunity.duplicateOf
    ? await client`SELECT id FROM opportunities WHERE id = ${opportunity.id} FOR UPDATE`
    : await client`
        SELECT id FROM opportunities
        WHERE id = ${opportunity.id}
           OR (source = ${opportunity.source}
               AND external_id IS NOT NULL
               AND external_id = ${opportunity.externalId})
        ORDER BY CASE WHEN id = ${opportunity.id} THEN 0 ELSE 1 END
        LIMIT 1
        FOR UPDATE
      `;
  return rowsOf(rows).length ? stringValue(rowsOf(rows)[0].id) : null;
}

async function persistReview(client: Sql, review: ReviewRecord): Promise<void> {
  const existing = await client`SELECT run_number FROM qa_runs WHERE id = ${review.id} FOR UPDATE`;
  const documentation = {
    adapter: 'PostgresAppStore',
    version: 1,
    summary: review.summary,
    review: clone(review),
  };
  if (rowsOf(existing).length) {
    await client`
      UPDATE qa_runs SET
        job_id = ${review.jobId},
        criteria_result = ${jsonParameter(review.criteriaResults)}::jsonb,
        tests_result = ${jsonParameter(review.tests)}::jsonb,
        security_result = ${jsonParameter(review.securityFindings)}::jsonb,
        documentation_result = ${jsonParameter(documentation)}::jsonb,
        verdict = ${review.verdict},
        issues = ${jsonParameter([])}::jsonb,
        reviewer = ${review.reviewer},
        findings = ${jsonParameter(review.findings)}::jsonb,
        required_changes = ${jsonParameter(review.requiredChanges)}::jsonb,
        created_at = ${review.createdAt}
      WHERE id = ${review.id}
    `;
    return;
  }
  const nextRun = await client`
    SELECT COALESCE(MAX(run_number), 0) + 1 AS run_number
    FROM qa_runs
    WHERE job_id = ${review.jobId}
  `;
  const runNumber = numberValue(rowsOf(nextRun)[0]?.run_number, 1);
  await client`
    INSERT INTO qa_runs
      (id, job_id, run_number, criteria_result, tests_result, security_result,
       documentation_result, verdict, issues, created_at, reviewer, findings, required_changes)
    VALUES
      (${review.id}, ${review.jobId}, ${runNumber}, ${jsonParameter(review.criteriaResults)}::jsonb,
       ${jsonParameter(review.tests)}::jsonb, ${jsonParameter(review.securityFindings)}::jsonb,
       ${jsonParameter(documentation)}::jsonb, ${review.verdict}, ${jsonParameter([])}::jsonb,
       ${review.createdAt}, ${review.reviewer}, ${jsonParameter(review.findings)}::jsonb,
       ${jsonParameter(review.requiredChanges)}::jsonb)
  `;
}

async function persistJobChildren(client: Sql, job: JobRecord): Promise<void> {
  await client`DELETE FROM acceptance_criteria WHERE job_id = ${job.id}`;
  for (const criterion of job.acceptanceCriteria) {
    await client`
      INSERT INTO acceptance_criteria
        (id, job_id, description, verification_method, status, evidence, created_at, updated_at)
      VALUES
        (${criterion.id}, ${job.id}, ${criterion.description}, ${criterion.verificationMethod},
         ${criterion.status}, ${criterion.evidence}, ${job.updatedAt}, ${job.updatedAt})
    `;
  }

  await client`DELETE FROM job_tasks WHERE job_id = ${job.id}`;
  for (const task of job.tasks) {
    await client`
      INSERT INTO job_tasks
        (id, job_id, title, description, agent_role, status, estimate_minutes, actual_minutes,
         blocked_reason, created_at, updated_at)
      VALUES
        (${task.id}, ${job.id}, ${task.title}, ${task.description}, ${task.agentRole}, ${task.status},
         ${task.estimateMinutes}, ${task.actualMinutes}, ${task.blockedReason}, ${job.updatedAt},
         ${job.updatedAt})
    `;
  }

  await client`DELETE FROM economic_outcomes WHERE job_id = ${job.id}`;
  if (job.economicOutcome) {
    const outcome = job.economicOutcome;
    await client`
      INSERT INTO economic_outcomes
        (id, job_id, gross_revenue, platform_fees, external_costs, net_revenue,
         token_count, estimated_ai_minutes, actual_human_minutes, revisions_count,
         payment_status, paid_at, created_at, updated_at)
      VALUES
        (${outcome.id}, ${outcome.jobId}, ${outcome.grossRevenue}, ${outcome.platformFees},
         ${outcome.externalCosts}, ${outcome.netRevenue}, ${outcome.tokenCount},
         ${outcome.estimatedAiMinutes}, ${outcome.actualHumanMinutes}, ${outcome.revisionsCount},
         ${outcome.paymentStatus}, ${outcome.paidAt}, ${outcome.createdAt}, ${outcome.updatedAt})
    `;
  }

  if (job.delivery) {
    const delivery = job.delivery;
    await client`
      INSERT INTO deliveries
        (id, job_id, version, summary, instructions, tests_performed, limitations, artifacts,
         delivery_message_draft, final_approval_status, status, created_at, delivered_at)
      VALUES
        (${delivery.id}, ${delivery.jobId}, ${delivery.version}, ${delivery.summary},
         ${delivery.instructions}, ${jsonParameter(delivery.testsPerformed)}::jsonb,
         ${jsonParameter(delivery.limitations)}::jsonb, ${jsonParameter(delivery.artifacts)}::jsonb,
         ${delivery.deliveryMessageDraft}, ${delivery.finalApprovalStatus}, ${delivery.status},
         ${delivery.createdAt}, ${delivery.deliveredAt})
      ON CONFLICT (job_id, version) DO UPDATE SET
        summary = EXCLUDED.summary,
        instructions = EXCLUDED.instructions,
        tests_performed = EXCLUDED.tests_performed,
        limitations = EXCLUDED.limitations,
        artifacts = EXCLUDED.artifacts,
        delivery_message_draft = EXCLUDED.delivery_message_draft,
        final_approval_status = EXCLUDED.final_approval_status,
        status = EXCLUDED.status,
        created_at = EXCLUDED.created_at,
        delivered_at = EXCLUDED.delivered_at
    `;
  }
}

async function persistJobBase(client: Sql, job: JobRecord, insert: boolean): Promise<void> {
  const scope = jsonParameter(serializeJobStorage(job));
  if (insert) {
    await client`
      INSERT INTO jobs
        (id, opportunity_id, job_code, title, agreed_scope, agreed_price, currency,
         agreed_deadline, status, started_at, completed_at, created_at, updated_at,
         priority, score, estimated_value_usd, actual_revenue_usd, risk, next_action,
         next_action_owner, human_gate, blocked_by, branch_or_pr, last_checkpoint_commit)
      VALUES
        (${job.id}, ${job.opportunityId}, ${job.jobCode}, ${job.title}, ${scope}::jsonb,
         ${job.agreedPrice}, ${job.currency}, ${job.agreedDeadline}, ${job.status},
         ${job.startedAt}, ${job.completedAt}, ${job.createdAt}, ${job.updatedAt}, ${job.priority},
         ${job.score}, ${job.estimatedValueUsd}, ${job.actualRevenueUsd}, ${job.risk},
         ${job.nextAction}, ${job.nextActionOwner}, ${job.humanGate},
         ${jsonParameter(job.blockedBy)}::jsonb, ${job.branchOrPr}, ${job.lastCheckpointCommit})
    `;
  } else {
    await client`
      UPDATE jobs SET
        opportunity_id = ${job.opportunityId},
        job_code = ${job.jobCode},
        title = ${job.title},
        agreed_scope = ${scope}::jsonb,
        agreed_price = ${job.agreedPrice},
        currency = ${job.currency},
        agreed_deadline = ${job.agreedDeadline},
        status = ${job.status},
        started_at = ${job.startedAt},
        completed_at = ${job.completedAt},
        updated_at = ${job.updatedAt},
        priority = ${job.priority},
        score = ${job.score},
        estimated_value_usd = ${job.estimatedValueUsd},
        actual_revenue_usd = ${job.actualRevenueUsd},
        risk = ${job.risk},
        next_action = ${job.nextAction},
        next_action_owner = ${job.nextActionOwner},
        human_gate = ${job.humanGate},
        blocked_by = ${jsonParameter(job.blockedBy)}::jsonb,
        branch_or_pr = ${job.branchOrPr},
        last_checkpoint_commit = ${job.lastCheckpointCommit}
      WHERE id = ${job.id}
    `;
  }
}

async function readState(client: Sql): Promise<AppState> {
  const [
    opportunities,
    scoreSnapshotRows,
    proposals,
    approvalRows,
    applicationRows,
    jobs,
    reviews,
    deliveryRows,
    economicRows,
    decisionRows,
    activityRows,
    conflictRows,
    transitionRows,
    settingRows,
  ] = await Promise.all([
    readOpportunities(client),
    scoreRows(client),
    client`SELECT * FROM proposals ORDER BY opportunity_id ASC, version DESC, id ASC`.then(rowsOf),
    client`SELECT * FROM approvals ORDER BY requested_at ASC, id ASC`.then(rowsOf),
    client`SELECT * FROM applications ORDER BY created_at ASC, id ASC`.then(rowsOf),
    readJobs(client),
    readReviews(client),
    relatedRows(client, 'deliveries', null),
    relatedRows(client, 'economic_outcomes', null),
    client`SELECT * FROM job_decisions ORDER BY requested_at ASC, id ASC`.then(rowsOf),
    client`SELECT * FROM job_activities ORDER BY created_at ASC, id ASC`.then(rowsOf),
    client`SELECT * FROM reconciliation_conflicts ORDER BY detected_at ASC, id ASC`.then(rowsOf),
    client`
      SELECT id, entity_type, entity_id, from_state, to_state, actor, reason, created_at
      FROM state_transitions
      ORDER BY created_at ASC, id ASC
    `.then(rowsOf),
    readSettingsRows(client),
  ]);
  return {
    version: 2,
    opportunities,
    scoreSnapshots: scoreSnapshotRows.map(mapScoreRow),
    proposals: proposals.map(mapProposalRow),
    approvals: approvalRows.map(mapApprovalRow),
    applications: applicationRows.map(mapApplicationRow),
    jobs,
    reviews,
    deliveries: deliveryRows
      .map(mapDeliveryRow)
      .filter((row): row is DeliveryRecord => row !== null),
    economicOutcomes: economicRows
      .map(mapEconomicRow)
      .filter((row): row is EconomicOutcomeRecord => row !== null),
    decisions: decisionRows.map(mapDecisionRow),
    activities: activityRows.map(mapActivityRow),
    conflicts: conflictRows.map(mapConflictRow),
    transitions: transitionRows.map((row) => ({
      id: stringValue(row.id),
      entityType: ['OPPORTUNITY', 'JOB', 'DELIVERY', 'APPLICATION'].includes(
        String(row.entity_type),
      )
        ? (row.entity_type as AppState['transitions'][number]['entityType'])
        : 'JOB',
      entityId: stringValue(row.entity_id),
      fromState: nullableString(row.from_state),
      toState: stringValue(row.to_state),
      actor: ['OWNER', 'SYSTEM', 'AGENT'].includes(String(row.actor))
        ? (row.actor as AppState['transitions'][number]['actor'])
        : 'SYSTEM',
      reason: nullableString(row.reason),
      createdAt: dateValue(row.created_at),
    })),
    settings: settingsFromRows(settingRows),
  };
}

function dashboardFromState(state: AppState): DashboardSummary {
  const pendingJobIds = new Set(
    state.approvals
      .filter((approval) => approval.decision === 'PENDING' && approval.jobId)
      .map((approval) => approval.jobId as string),
  );
  return {
    humanAction: state.jobs.filter(
      (job) =>
        pendingJobIds.has(job.id) ||
        [
          'REQUIRES_SCOPE_APPROVAL',
          'REQUIRES_DELIVERY_APPROVAL',
          'READY_FOR_HUMAN_REVIEW',
        ].includes(job.status),
    ),
    active: state.jobs.filter((job) => ['PLANNING', 'IN_PROGRESS'].includes(job.status)),
    readyForReview: state.jobs.filter((job) =>
      ['READY_FOR_INTERNAL_REVIEW', 'READY_FOR_HUMAN_REVIEW'].includes(job.status),
    ),
    blocked: state.jobs.filter((job) =>
      ['BLOCKED_INTERNAL', 'BLOCKED_CLIENT', 'CHANGES_REQUESTED'].includes(job.status),
    ),
    pipeline: state.opportunities.filter((opportunity) =>
      ['SCORED', 'SHORTLISTED', 'REQUIRES_APPLY_APPROVAL'].includes(opportunity.status),
    ),
    recentlyCompleted: state.jobs.filter((job) =>
      ['ACCEPTED', 'PAID', 'CLOSED_WON'].includes(job.status),
    ),
    conflicts: state.conflicts.filter((item) => item.resolvedAt === null),
  };
}

function metricsFromState(state: AppState): Record<string, number> {
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

export class PostgresAppStore implements AppStore {
  private readonly sql: Sql;
  private readonly ownsClient: boolean;

  constructor(clientOrUrl?: PostgresSqlClient | string) {
    if (typeof clientOrUrl === 'string') {
      this.sql = postgres(clientOrUrl);
      this.ownsClient = true;
      return;
    }
    if (clientOrUrl) {
      this.sql = clientOrUrl;
      this.ownsClient = false;
      return;
    }
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('PostgresAppStore requires a Sql client or DATABASE_URL.');
    }
    this.sql = postgres(databaseUrl);
    this.ownsClient = true;
  }

  async close(): Promise<void> {
    if (this.ownsClient) await this.sql.end({ timeout: 5 });
  }

  async getSettings(): Promise<AppSettings> {
    return clone(settingsFromRows(await readSettingsRows(this.sql)));
  }

  async updateSettings(update: Partial<AppSettings>): Promise<AppSettings> {
    return this.sql.begin(async (tx) => {
      const current = settingsFromRows(await readSettingsRows(tx));
      const next = { ...current };
      for (const key of SETTING_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(update, key)) continue;
        const value = update[key];
        if (value === undefined) continue;
        (next as AppSettings)[key] = clone(value) as never;
        await tx`
          INSERT INTO system_settings (key, value, updated_at)
          VALUES (${SETTING_DB_KEYS[key]}, ${jsonParameter(value)}::jsonb, ${nowIso()})
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
        `;
      }
      return clone(next);
    });
  }

  async listOpportunities(query: OpportunityQuery = {}): Promise<OpportunityRecord[]> {
    const opportunities = await readOpportunities(this.sql);
    const filtered = opportunities.filter((opportunity) => {
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
          (right.latestScore?.expectedNetRevenue || 0) - (left.latestScore?.expectedNetRevenue || 0)
        );
      }
      return (right.latestScore?.overallScore || 0) - (left.latestScore?.overallScore || 0);
    });
    return clone(filtered);
  }

  async getOpportunity(id: string): Promise<OpportunityRecord | null> {
    const rows = await readOpportunities(this.sql, id);
    return rows.length ? clone(rows[0]) : null;
  }

  async upsertOpportunity(input: OpportunityRecord): Promise<OpportunityRecord> {
    return this.sql.begin(async (tx) => {
      const existingId = await findOpportunityId(tx, input);
      const persistedId = await insertOpportunity(tx, input, existingId);
      if (input.latestScore) {
        await upsertScore(tx, { ...input.latestScore, opportunityId: persistedId }, persistedId);
      }
      const rows = await readOpportunities(tx, persistedId);
      if (!rows.length) throw new Error(`Opportunity not found after upsert: ${persistedId}`);
      return clone(rows[0]);
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
    return this.sql.begin(async (tx) => {
      const rows = await tx`SELECT status FROM opportunities WHERE id = ${id} FOR UPDATE`;
      const currentRows = rowsOf(rows);
      if (!currentRows.length) throw new Error(`Opportunity not found: ${id}`);
      const previous = nullableString(currentRows[0].status);
      const updatedAt = nowIso();
      await tx`UPDATE opportunities SET status = ${status}, updated_at = ${updatedAt} WHERE id = ${id}`;
      await insertTransition(tx, {
        id: newId(),
        entityType: 'OPPORTUNITY',
        entityId: id,
        fromState: previous,
        toState: status,
        actor,
        reason,
        createdAt: updatedAt,
      });
      const updated = await readOpportunities(tx, id);
      if (!updated.length) throw new Error(`Opportunity not found after status update: ${id}`);
      return clone(updated[0]);
    });
  }

  async saveScore(opportunityId: string, score: ScoreSnapshot): Promise<OpportunityRecord> {
    return this.sql.begin(async (tx) => {
      const current = await opportunityRows(tx, opportunityId);
      if (!current.length) throw new Error(`Opportunity not found: ${opportunityId}`);
      await upsertScore(tx, { ...score, opportunityId }, opportunityId);
      const currentStatus = opportunityStatus(current[0].status);
      if (currentStatus === 'DISCOVERED' || currentStatus === 'NORMALIZED') {
        await tx`UPDATE opportunities SET status = 'SCORED', updated_at = ${nowIso()} WHERE id = ${opportunityId}`;
      }
      const updated = await readOpportunities(tx, opportunityId);
      if (!updated.length)
        throw new Error(`Opportunity not found after score save: ${opportunityId}`);
      return clone(updated[0]);
    });
  }

  async saveProposal(proposal: ProposalRecord): Promise<ProposalRecord> {
    await this.sql`
      INSERT INTO proposals
        (id, opportunity_id, version, opening, requirement_interpretation, implementation_plan,
         proof_points, assumptions, questions, recommended_bid, minimum_bid, currency,
         timeline_recommendation, scope_included, scope_excluded, body, status, created_at, updated_at)
      VALUES
        (${proposal.id}, ${proposal.opportunityId}, ${proposal.version}, ${proposal.opening},
         ${proposal.requirementInterpretation}, ${proposal.implementationPlan},
         ${jsonParameter(proposal.proofPoints)}::jsonb, ${jsonParameter(proposal.assumptions)}::jsonb,
         ${jsonParameter(proposal.questions)}::jsonb, ${proposal.recommendedBid}, ${proposal.minimumBid},
         ${proposal.currency}, ${proposal.timelineRecommendation},
         ${jsonParameter(proposal.scopeIncluded)}::jsonb, ${jsonParameter(proposal.scopeExcluded)}::jsonb,
         ${proposal.body}, ${proposal.status}, ${proposal.createdAt}, ${proposal.updatedAt})
      ON CONFLICT (id) DO UPDATE SET
        opportunity_id = EXCLUDED.opportunity_id,
        version = EXCLUDED.version,
        opening = EXCLUDED.opening,
        requirement_interpretation = EXCLUDED.requirement_interpretation,
        implementation_plan = EXCLUDED.implementation_plan,
        proof_points = EXCLUDED.proof_points,
        assumptions = EXCLUDED.assumptions,
        questions = EXCLUDED.questions,
        recommended_bid = EXCLUDED.recommended_bid,
        minimum_bid = EXCLUDED.minimum_bid,
        currency = EXCLUDED.currency,
        timeline_recommendation = EXCLUDED.timeline_recommendation,
        scope_included = EXCLUDED.scope_included,
        scope_excluded = EXCLUDED.scope_excluded,
        body = EXCLUDED.body,
        status = EXCLUDED.status,
        created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at
    `;
    return clone(proposal);
  }

  async getProposal(opportunityId: string): Promise<ProposalRecord | null> {
    const rows = await this.sql`
      SELECT * FROM proposals
      WHERE opportunity_id = ${opportunityId}
      ORDER BY version DESC, updated_at DESC, id DESC
      LIMIT 1
    `;
    const mapped = rowsOf(rows).map(mapProposalRow);
    return mapped.length ? clone(mapped[0]) : null;
  }

  async createApproval(
    approval: Omit<
      ApprovalRecord,
      'id' | 'requestedAt' | 'decidedAt' | 'decision' | 'decisionNote' | 'decisionId'
    >,
  ): Promise<ApprovalRecord> {
    return this.sql.begin(async (tx) => {
      const decisionId = newId();
      const result: ApprovalRecord = {
        ...approval,
        id: newId(),
        decision: 'PENDING',
        decisionNote: null,
        decisionId,
        requestedAt: nowIso(),
        decidedAt: null,
      };
      await tx`
        INSERT INTO approvals
          (id, opportunity_id, job_id, approval_type, requested_payload, decision,
           decision_note, requested_at, decided_at, decision_id)
        VALUES
          (${result.id}, ${result.opportunityId}, ${result.jobId}, ${result.approvalType},
           ${jsonParameter(result.requestedPayload)}::jsonb, ${result.decision},
           ${result.decisionNote}, ${result.requestedAt}, ${result.decidedAt}, NULL)
      `;
      const payload = result.requestedPayload || {};
      await tx`
        INSERT INTO job_decisions
          (id, approval_id, opportunity_id, job_id, question, recommendation, alternatives,
           final_decision, owner_decision_note, decided_by, requested_at, decided_at, impact)
        VALUES
          (${decisionId}, ${result.id}, ${result.opportunityId}, ${result.jobId},
           ${stringValue(payload.question ?? payload.summary, 'Owner decision required.')},
           ${stringValue(
             payload.recommendation,
             'Review the evidence, risks, scope and commercial consequences before deciding.',
           )},
           ${jsonParameter(
             Array.isArray(payload.alternatives)
               ? payload.alternatives.map(String)
               : ['Approve', 'Reject'],
           )}::jsonb,
           'PENDING', NULL, 'PENDING', ${result.requestedAt}, NULL,
           ${payload.impact ? String(payload.impact) : null})
      `;
      await tx`UPDATE approvals SET decision_id = ${decisionId} WHERE id = ${result.id}`;
      return clone(result);
    });
  }

  async listPendingApprovals(): Promise<ApprovalRecord[]> {
    const rows = await this.sql`
      SELECT * FROM approvals
      WHERE decision = 'PENDING'
      ORDER BY requested_at ASC, id ASC
    `;
    return clone(rowsOf(rows).map(mapApprovalRow));
  }

  async decideApproval(
    id: string,
    decision: 'APPROVED' | 'REJECTED',
    note: string,
  ): Promise<ApprovalRecord> {
    return this.sql.begin(async (tx) => {
      const rows = rowsOf(await tx`SELECT * FROM approvals WHERE id = ${id} FOR UPDATE`);
      if (!rows.length) throw new Error(`Approval not found: ${id}`);
      if (approvalDecision(rows[0].decision) !== 'PENDING')
        throw new Error('Approval has already been decided.');
      const decidedAt = nowIso();
      await tx`
        UPDATE approvals
        SET decision = ${decision}, decision_note = ${note}, decided_at = ${decidedAt}
        WHERE id = ${id}
      `;
      const decisionId = nullableString(rows[0].decision_id);
      if (decisionId) {
        await tx`
          UPDATE job_decisions
          SET final_decision = ${decision}, owner_decision_note = ${note},
              decided_by = 'OWNER', decided_at = ${decidedAt}
          WHERE id = ${decisionId}
        `;
      }
      return clone(
        mapApprovalRow({
          ...rows[0],
          decision,
          decision_note: note,
          decided_at: decidedAt,
        }),
      );
    });
  }

  async saveApplication(application: ApplicationRecord): Promise<ApplicationRecord> {
    await this.sql`
      INSERT INTO applications
        (id, opportunity_id, proposal_id, submitted_at, submitted_via, actual_bid, currency,
         status, external_reference, notes, created_at, updated_at)
      VALUES
        (${application.id}, ${application.opportunityId}, ${application.proposalId},
         ${application.submittedAt}, ${application.submittedVia}, ${application.actualBid},
         ${application.currency}, ${application.status}, ${application.externalReference},
         ${application.notes}, ${application.createdAt}, ${application.updatedAt})
      ON CONFLICT (id) DO UPDATE SET
        opportunity_id = EXCLUDED.opportunity_id,
        proposal_id = EXCLUDED.proposal_id,
        submitted_at = EXCLUDED.submitted_at,
        submitted_via = EXCLUDED.submitted_via,
        actual_bid = EXCLUDED.actual_bid,
        currency = EXCLUDED.currency,
        status = EXCLUDED.status,
        external_reference = EXCLUDED.external_reference,
        notes = EXCLUDED.notes,
        created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at
    `;
    return clone(application);
  }

  async listJobs(): Promise<JobRecord[]> {
    return clone(await this.sql.begin((tx) => readJobs(tx)));
  }

  async getJob(id: string): Promise<JobRecord | null> {
    const jobs = await this.sql.begin((tx) => readJobs(tx, id));
    return jobs.length ? clone(jobs[0]) : null;
  }

  async createJob(job: JobRecord): Promise<JobRecord> {
    return this.sql.begin(async (tx) => {
      const existing = rowsOf(
        await tx`SELECT id FROM jobs WHERE id = ${job.id} OR job_code = ${job.jobCode} LIMIT 1`,
      );
      if (existing.length) throw new Error(`Job already exists: ${job.jobCode}`);
      await persistJobBase(tx, job, true);
      await persistJobChildren(tx, job);
      if (job.latestReview) await persistReview(tx, job.latestReview);
      return clone(job);
    });
  }

  async updateJob(id: string, update: Partial<JobRecord>, reason: string): Promise<JobRecord> {
    return this.sql.begin(async (tx) => {
      const jobs = await readJobs(tx, id);
      if (!jobs.length) throw new Error(`Job not found: ${id}`);
      const current = jobs[0];
      const previous = current.status;
      const next = { ...current, ...update, id, updatedAt: nowIso() };
      await persistJobBase(tx, next, false);
      await persistJobChildren(tx, next);
      if (next.latestReview) await persistReview(tx, next.latestReview);
      if (previous !== next.status) {
        await insertTransition(tx, {
          id: newId(),
          entityType: 'JOB',
          entityId: id,
          fromState: previous,
          toState: next.status,
          actor: 'OWNER',
          reason,
          createdAt: next.updatedAt,
        });
      }
      return clone(next);
    });
  }

  async updateJobTask(
    jobId: string,
    taskId: string,
    update: Partial<JobTask>,
    reason: string,
  ): Promise<JobRecord> {
    return this.sql.begin(async (tx) => {
      const jobs = await readJobs(tx, jobId);
      if (!jobs.length) throw new Error(`Job not found: ${jobId}`);
      const task = jobs[0].tasks.find((item) => item.id === taskId);
      if (!task) throw new Error(`Task not found: ${taskId}`);
      const updatedAt = nowIso();
      await tx`
        UPDATE job_tasks SET
          title = ${update.title ?? task.title},
          description = ${update.description ?? task.description},
          agent_role = ${update.agentRole ?? task.agentRole},
          status = ${update.status ?? task.status},
          estimate_minutes = ${update.estimateMinutes ?? task.estimateMinutes},
          actual_minutes = ${update.actualMinutes ?? task.actualMinutes},
          blocked_reason = ${update.blockedReason ?? task.blockedReason},
          updated_at = ${updatedAt}
        WHERE id = ${taskId} AND job_id = ${jobId}
      `;
      await tx`UPDATE jobs SET updated_at = ${updatedAt} WHERE id = ${jobId}`;
      await tx`
        INSERT INTO job_activities
          (id, job_id, activity_type, summary, evidence, next_action, created_at)
        VALUES
          (${newId()}, ${jobId}, 'TASK_CHANGE', ${`Task "${update.title ?? task.title}" updated: ${reason}`},
           ${`jobs/${jobs[0].jobCode}/TASKS.md`}, ${jobs[0].nextAction}, ${updatedAt})
      `;
      const updated = await readJobs(tx, jobId);
      if (!updated.length) throw new Error(`Job not found after task update: ${jobId}`);
      return clone(updated[0]);
    });
  }

  async saveReview(review: ReviewRecord): Promise<ReviewRecord> {
    return this.sql.begin(async (tx) => {
      const jobs = await readJobs(tx, review.jobId);
      if (!jobs.length) throw new Error(`Job not found: ${review.jobId}`);
      await persistReview(tx, review);
      const job = jobs[0];
      await tx`
        UPDATE jobs
        SET agreed_scope = ${jsonParameter(serializeJobStorage({ ...job, latestReview: review }))}::jsonb
        WHERE id = ${review.jobId}
      `;
      return clone(review);
    });
  }

  async saveDelivery(delivery: DeliveryRecord): Promise<DeliveryRecord> {
    return this.sql.begin(async (tx) => {
      const jobs = await readJobs(tx, delivery.jobId);
      if (!jobs.length) throw new Error(`Job not found: ${delivery.jobId}`);
      await tx`
        INSERT INTO deliveries
          (id, job_id, version, summary, instructions, tests_performed, limitations, artifacts,
           delivery_message_draft, final_approval_status, status, created_at, delivered_at)
        VALUES
          (${delivery.id}, ${delivery.jobId}, ${delivery.version}, ${delivery.summary},
           ${delivery.instructions}, ${jsonParameter(delivery.testsPerformed)}::jsonb,
           ${jsonParameter(delivery.limitations)}::jsonb, ${jsonParameter(delivery.artifacts)}::jsonb,
           ${delivery.deliveryMessageDraft}, ${delivery.finalApprovalStatus}, ${delivery.status},
           ${delivery.createdAt}, ${delivery.deliveredAt})
        ON CONFLICT (job_id, version) DO UPDATE SET
          summary = EXCLUDED.summary,
          instructions = EXCLUDED.instructions,
          tests_performed = EXCLUDED.tests_performed,
          limitations = EXCLUDED.limitations,
          artifacts = EXCLUDED.artifacts,
          delivery_message_draft = EXCLUDED.delivery_message_draft,
          final_approval_status = EXCLUDED.final_approval_status,
          status = EXCLUDED.status,
          created_at = EXCLUDED.created_at,
          delivered_at = EXCLUDED.delivered_at
      `;
      await tx`
        UPDATE jobs
        SET agreed_scope = ${jsonParameter(serializeJobStorage({ ...jobs[0], delivery }))}::jsonb
        WHERE id = ${delivery.jobId}
      `;
      return clone(delivery);
    });
  }

  async saveEconomicOutcome(outcome: EconomicOutcomeRecord): Promise<EconomicOutcomeRecord> {
    return this.sql.begin(async (tx) => {
      const jobs = await readJobs(tx, outcome.jobId);
      if (!jobs.length) throw new Error(`Job not found: ${outcome.jobId}`);
      await tx`DELETE FROM economic_outcomes WHERE job_id = ${outcome.jobId}`;
      await tx`
        INSERT INTO economic_outcomes
          (id, job_id, gross_revenue, platform_fees, external_costs, net_revenue,
           token_count, estimated_ai_minutes, actual_human_minutes, revisions_count,
           payment_status, paid_at, created_at, updated_at)
        VALUES
          (${outcome.id}, ${outcome.jobId}, ${outcome.grossRevenue}, ${outcome.platformFees},
           ${outcome.externalCosts}, ${outcome.netRevenue}, ${outcome.tokenCount},
           ${outcome.estimatedAiMinutes}, ${outcome.actualHumanMinutes}, ${outcome.revisionsCount},
           ${outcome.paymentStatus}, ${outcome.paidAt}, ${outcome.createdAt}, ${outcome.updatedAt})
      `;
      const updatedAt = nowIso();
      await tx`
        UPDATE jobs
        SET actual_revenue_usd = ${outcome.grossRevenue}, updated_at = ${updatedAt},
            agreed_scope = ${jsonParameter(
              serializeJobStorage({
                ...jobs[0],
                actualRevenueUsd: outcome.grossRevenue,
                economicOutcome: outcome,
                updatedAt,
              }),
            )}::jsonb
        WHERE id = ${outcome.jobId}
      `;
      return clone(outcome);
    });
  }

  async recordActivity(
    activity: Omit<ActivityRecord, 'id' | 'createdAt'>,
  ): Promise<ActivityRecord> {
    const result: ActivityRecord = { ...activity, id: newId(), createdAt: nowIso() };
    await this.sql`
      INSERT INTO job_activities
        (id, job_id, activity_type, summary, evidence, next_action, created_at)
      VALUES
        (${result.id}, ${result.jobId}, ${result.type}, ${result.summary}, ${result.evidence},
         ${result.nextAction}, ${result.createdAt})
    `;
    return clone(result);
  }

  async saveConflict(
    conflict: Omit<ReconciliationConflictRecord, 'id' | 'detectedAt' | 'resolvedAt'>,
  ): Promise<ReconciliationConflictRecord> {
    return this.sql.begin(async (tx) => {
      const existing = rowsOf(
        await tx`
        SELECT * FROM reconciliation_conflicts
        WHERE conflict_type = ${conflict.conflictType}
          AND resolved_at IS NULL
          AND (
            (job_id = ${conflict.jobId}) OR
            (job_id IS NULL AND ${conflict.jobId} IS NULL)
          )
        ORDER BY detected_at DESC, id DESC
        LIMIT 1
        FOR UPDATE
      `,
      );
      if (existing.length) {
        const existingId = stringValue(existing[0].id);
        await tx`
          UPDATE reconciliation_conflicts
          SET severity = ${conflict.severity}, details = ${conflict.details}
          WHERE id = ${existingId}
        `;
        return clone(mapConflictRow({ ...existing[0], ...conflict }));
      }
      const result: ReconciliationConflictRecord = {
        ...conflict,
        id: newId(),
        detectedAt: nowIso(),
        resolvedAt: null,
      };
      await tx`
        INSERT INTO reconciliation_conflicts
          (id, job_id, conflict_type, severity, details, detected_at, resolved_at)
        VALUES
          (${result.id}, ${result.jobId}, ${result.conflictType}, ${result.severity},
           ${result.details}, ${result.detectedAt}, ${result.resolvedAt})
      `;
      return clone(result);
    });
  }

  async listConflicts(): Promise<ReconciliationConflictRecord[]> {
    const rows = await this.sql`
      SELECT * FROM reconciliation_conflicts
      WHERE resolved_at IS NULL
      ORDER BY detected_at DESC, id DESC
    `;
    return clone(rowsOf(rows).map(mapConflictRow));
  }

  async dashboard(): Promise<DashboardSummary> {
    return clone(dashboardFromState(await this.rawState()));
  }

  async metrics(): Promise<Record<string, number>> {
    return metricsFromState(await this.rawState());
  }

  async rawState(): Promise<AppState> {
    return clone(await this.sql.begin((tx) => readState(tx)));
  }
}
