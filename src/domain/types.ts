/**
 * Framework-agnostic domain types for Codex Job Hunter.
 *
 * The domain deliberately uses plain JSON-compatible values so it can be used
 * by a web route, a CLI import, or a database adapter without pulling those
 * concerns into this layer.
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  /** Kept structurally compatible with adapter records; values are sanitized before persistence. */
  [key: string]: unknown;
}

export type KnownOpportunitySource =
  | 'manual'
  | 'csv'
  | 'json'
  | 'github'
  | 'upwork'
  | 'fiverr'
  | 'other';

/** Allows future adapters while preserving autocomplete for known sources. */
export type OpportunitySource = KnownOpportunitySource | (string & {});

export const OPPORTUNITY_CATEGORIES = [
  'python_bugfix',
  'js_ts_bugfix',
  'react_nextjs',
  'backend_api',
  'api_integration',
  'automation',
  'csv_excel',
  'data_processing',
  'web_scraping',
  'browser_extension',
  'bot',
  'dashboard',
  'deployment',
  'docker',
  'ci_cd',
  'database',
  'testing',
  'code_review',
  'security_review',
  'wordpress',
  'shopify',
  'ai_integration',
  'other',
] as const;

export type OpportunityCategory = (typeof OPPORTUNITY_CATEGORIES)[number];

export type BudgetType = 'fixed' | 'hourly' | 'unknown';
export type PaymentStatus = 'paid' | 'unpaid' | 'unknown';
export type RiskTolerance = 'low' | 'medium' | 'high';

/**
 * Raw records intentionally accept common aliases used by manual, CSV, and
 * GitHub-like inputs. Validation happens in import.ts; normalization itself
 * remains tolerant and never executes imported content.
 */
export interface RawOpportunityRecord {
  [key: string]: unknown;
  id?: unknown;
  source?: unknown;
  externalId?: unknown;
  external_id?: unknown;
  sourceUrl?: unknown;
  source_url?: unknown;
  url?: unknown;
  html_url?: unknown;
  title?: unknown;
  name?: unknown;
  description?: unknown;
  originalDescription?: unknown;
  original_description?: unknown;
  body?: unknown;
  summary?: unknown;
  budget?: unknown;
  budgetMin?: unknown;
  budget_min?: unknown;
  budgetMax?: unknown;
  budget_max?: unknown;
  budgetMidpoint?: unknown;
  budget_midpoint?: unknown;
  currency?: unknown;
  budgetType?: unknown;
  budget_type?: unknown;
  category?: unknown;
  categories?: unknown;
  technologies?: unknown;
  techStack?: unknown;
  tech_stack?: unknown;
  deliverables?: unknown;
  acceptanceCriteria?: unknown;
  acceptance_criteria?: unknown;
  inferredAcceptanceCriteria?: unknown;
  inferred_acceptance_criteria?: unknown;
  missingInformation?: unknown;
  missing_information?: unknown;
  clientConstraints?: unknown;
  client_constraints?: unknown;
  deadline?: unknown;
  explicitDeadline?: unknown;
  explicit_deadline?: unknown;
  postedAt?: unknown;
  posted_at?: unknown;
  created_at?: unknown;
  discoveredAt?: unknown;
  discovered_at?: unknown;
  metadata?: unknown;
  rawMetadata?: unknown;
  raw_metadata?: unknown;
  isPaid?: unknown;
  is_paid?: unknown;
  paymentStatus?: unknown;
  payment_status?: unknown;
  physicalRequirement?: unknown;
  physical_requirement?: unknown;
}

export interface ManualOpportunityRecord extends RawOpportunityRecord {
  source?: 'manual' | 'csv' | 'json';
}

export interface GithubIssueLikeRecord extends RawOpportunityRecord {
  source?: 'github';
  number?: unknown;
  repository?: unknown;
  repository_url?: unknown;
  full_name?: unknown;
  labels?: unknown;
  user?: unknown;
  author?: unknown;
}

export interface NormalizeOptions {
  source?: OpportunitySource;
  now?: Date | string;
  id?: string;
  normalizationVersion?: string;
}

export interface NormalizedOpportunity {
  id: string;
  source: OpportunitySource;
  externalId: string | null;
  sourceUrl: string | null;
  title: string;
  originalDescription: string;
  normalizedSummary: string;
  category: OpportunityCategory;
  categories: OpportunityCategory[];
  technologies: string[];
  deliverables: string[];
  acceptanceCriteria: string[];
  /** Database-compatible alias retained for adapters and reporting. */
  inferredAcceptanceCriteria: string[];
  missingInformation: string[];
  clientConstraints: string[];
  budgetMin: number | null;
  budgetMax: number | null;
  budgetMidpoint: number | null;
  currency: string | null;
  budgetType: BudgetType;
  explicitDeadline: string | null;
  postedAt: string | null;
  discoveredAt: string;
  paymentStatus: PaymentStatus;
  physicalRequirement: string | null;
  rawMetadata: JsonObject;
  normalizationVersion: string;
}

export type OpportunityLifecycleState =
  | 'DISCOVERED'
  | 'NORMALIZED'
  | 'REJECTED_HARD_FILTER'
  | 'SCORED'
  | 'SHORTLISTED'
  | 'REQUIRES_APPLY_APPROVAL'
  | 'APPROVED_TO_APPLY'
  | 'APPLIED'
  | 'LOST'
  | 'WON_PENDING_CONTRACT'
  | 'ACTIVE'
  | 'SCOPE_CHANGE_REVIEW'
  | 'READY_FOR_QA'
  | 'QA_FAILED'
  | 'READY_FOR_DELIVERY'
  | 'DELIVERED'
  | 'REVISION'
  | 'ACCEPTED'
  | 'PAID'
  | 'CANCELLED';

export type JobState =
  | 'DISCOVERED'
  | 'SCORED'
  | 'SHORTLISTED'
  | 'REQUIRES_APPLY_APPROVAL'
  | 'APPLY_APPROVED'
  | 'APPLIED'
  | 'CLIENT_RESPONSE'
  | 'REQUIRES_COMMERCIAL_DECISION'
  | 'NEGOTIATING'
  | 'WON'
  | 'PLANNING'
  | 'IN_PROGRESS'
  | 'BLOCKED_INTERNAL'
  | 'BLOCKED_CLIENT'
  | 'REQUIRES_SCOPE_APPROVAL'
  | 'READY_FOR_INTERNAL_REVIEW'
  | 'CHANGES_REQUESTED'
  | 'READY_FOR_HUMAN_REVIEW'
  | 'REQUIRES_DELIVERY_APPROVAL'
  | 'DELIVERED'
  | 'REVISION_REQUESTED'
  | 'ACCEPTED'
  | 'PAID'
  | 'CLOSED_WON'
  | 'CLOSED_LOST'
  | 'REJECTED'
  | 'ARCHIVED';

export type StateStatus = OpportunityLifecycleState | JobState;

export type HumanGate =
  | 'NONE'
  | 'APPLY'
  | 'PRICE'
  | 'CONTRACT'
  | 'SCOPE_CHANGE'
  | 'DELIVERY'
  | 'SPEND'
  | 'ACCOUNT_CHANGE';

export type ApprovalType = Exclude<HumanGate, 'NONE'>;

export type HardFilterReasonCode =
  | 'PROHIBITED_OR_MALICIOUS'
  | 'SCAM'
  | 'UNPAID'
  | 'CIRCUMVENTION'
  | 'EXCLUDED_CATEGORY'
  | 'LOW_BUDGET'
  | 'IMPOSSIBLE_PHYSICAL'
  | 'VAGUE_LOW_VALUE';

export interface HardFilterReason {
  code: HardFilterReasonCode;
  message: string;
  evidence: string[];
}

export interface HardFilterResult {
  passed: boolean;
  rejected: boolean;
  shortCircuited: boolean;
  reasonCodes: HardFilterReasonCode[];
  reasons: HardFilterReason[];
  primaryReason: HardFilterReasonCode | null;
}

export interface HardFilterSettings {
  minimumBudget: number;
  minimumBudgetPerAiHour: number | null;
  minimumBudgetPerHumanHour: number | null;
  unpaidTrialMaxAiMinutes: number;
  vagueDescriptionMaxCharacters: number;
  vagueLowValueBudget: number;
  vagueCommunicationBurdenThreshold: number;
  minimumDescriptionCharacters: number;
  excludedCategories: readonly string[];
  remoteOnly: boolean;
  allowedPhysicalLocations: readonly string[];
  prohibitedPatterns: readonly RegExp[];
  scamPatterns: readonly RegExp[];
  circumventionPatterns: readonly RegExp[];
  physicalPatterns: readonly RegExp[];
  strategicValueMetadataKeys: readonly string[];
  shortCircuit: boolean;
  estimatedAiMinutes?: number | null;
  estimatedHumanMinutes?: number | null;
  communicationBurden?: number | null;
}

export interface OpportunitySettings {
  minimumBudget: number;
  maximumEstimatedAiMinutes: number | null;
  maximumEstimatedHumanMinutes: number | null;
  shortlistScoreThreshold: number;
  minimumCompletionProbability: number;
  allowedCategories: readonly OpportunityCategory[];
  excludedCategories: readonly OpportunityCategory[];
  preferredSources: readonly OpportunitySource[];
  preferredCurrencies: readonly string[];
  riskTolerance: RiskTolerance;
  maxInProgressJobs: number;
  winProbabilityPrior: number;
  hardFilters: Partial<HardFilterSettings>;
}

export const DEFAULT_OPPORTUNITY_SETTINGS: Readonly<OpportunitySettings> = {
  minimumBudget: 50,
  maximumEstimatedAiMinutes: null,
  maximumEstimatedHumanMinutes: null,
  shortlistScoreThreshold: 75,
  minimumCompletionProbability: 0.5,
  allowedCategories: OPPORTUNITY_CATEGORIES,
  excludedCategories: [],
  preferredSources: [],
  preferredCurrencies: [],
  riskTolerance: 'medium',
  maxInProgressJobs: 3,
  winProbabilityPrior: 0.1,
  hardFilters: {},
};

export type ScoreComponentKey =
  | 'technical_fit'
  | 'completion_probability'
  | 'scope_clarity'
  | 'payment_quality'
  | 'verification_quality'
  | 'repeatability'
  | 'client_quality'
  | 'implementation_effort'
  | 'human_attention'
  | 'communication_burden'
  | 'revision_risk'
  | 'platform_risk'
  | 'security_risk'
  | 'scope_creep_risk';

export interface ScoreFeatures {
  technicalFit: number;
  completionProbability: number;
  scopeClarity: number;
  paymentQuality: number;
  verificationQuality: number;
  repeatability: number;
  clientQuality: number;
  implementationEffort: number;
  humanAttention: number;
  communicationBurden: number;
  revisionRisk: number;
  platformRisk: number;
  securityRisk: number;
  scopeCreepRisk: number;
  scamRisk: number;
}

/** Partial input accepts snake_case aliases so CSV/DB adapters can pass data directly. */
export interface ScoreFeatureInput {
  technicalFit?: number;
  technical_fit?: number;
  completionProbability?: number;
  completion_probability?: number;
  scopeClarity?: number;
  scope_clarity?: number;
  paymentQuality?: number;
  payment_quality?: number;
  verificationQuality?: number;
  verification_quality?: number;
  repeatability?: number;
  clientQuality?: number;
  client_quality?: number;
  implementationEffort?: number;
  implementation_effort?: number;
  humanAttention?: number;
  human_attention?: number;
  communicationBurden?: number;
  communication_burden?: number;
  revisionRisk?: number;
  revision_risk?: number;
  platformRisk?: number;
  platform_risk?: number;
  securityRisk?: number;
  security_risk?: number;
  scopeCreepRisk?: number;
  scope_creep_risk?: number;
  scamRisk?: number;
  scam_risk?: number;
}

export interface ScoreEconomics {
  budgetMidpoint?: number | null;
  completionProbabilityRate?: number | null;
  /** Fraction in [0, 1]. A percentage value is rejected rather than guessed. */
  winProbability?: number | null;
  expectedPlatformFees?: number;
  expectedExternalCosts?: number;
  estimatedAiMinutes?: number | null;
  estimatedHumanMinutes?: number | null;
  estimatedTokens?: number | null;
}

export interface ScoreInput {
  opportunity?: Pick<NormalizedOpportunity, 'budgetMidpoint' | 'currency'> | null;
  features: ScoreFeatureInput;
  economics?: ScoreEconomics;
  assumptions?: readonly string[];
}

export interface ScoreOptions {
  now?: Date | string;
  defaultWinProbability?: number;
  riskFlagThreshold?: number;
  normalizationOffset?: number;
}

export interface ScoreWeightSet {
  technical_fit: number;
  completion_probability: number;
  scope_clarity: number;
  payment_quality: number;
  verification_quality: number;
  repeatability: number;
  client_quality: number;
  implementation_effort: number;
  human_attention: number;
  communication_burden: number;
  revision_risk: number;
  platform_risk: number;
  security_risk: number;
  scope_creep_risk: number;
}

export interface ScoreExplanationComponent {
  key: ScoreComponentKey;
  value: number;
  weight: number;
  contribution: number;
  direction: 'positive' | 'negative';
  label: string;
  detail: string;
}

export interface ScoreExplanation {
  scoringVersion: 'score_v1';
  components: readonly ScoreExplanationComponent[];
  positiveSubtotal: number;
  riskAdjustment: number;
  rawWeightedScore: number;
  normalizationOffset: number;
  summary: string;
  text: string;
}

export interface ScoreSnapshot {
  readonly scoringVersion: 'score_v1';
  readonly features: Readonly<ScoreFeatures>;
  readonly overallScore: number;
  /** Short alias useful to queue/sorting adapters. */
  readonly score: number;
  readonly rawWeightedScore: number;
  readonly positiveSubtotal: number;
  readonly riskAdjustment: number;
  readonly estimatedAiMinutes: number | null;
  readonly estimatedHumanMinutes: number | null;
  readonly estimatedTokens: number | null;
  readonly completionProbability: number;
  readonly winProbability: number | null;
  readonly expectedNetRevenue: number | null;
  readonly revenuePerHumanHour: number | null;
  readonly expectedRevenuePer1mTokens: number | null;
  readonly assumptions: readonly string[];
  readonly riskFlags: readonly string[];
  readonly explanation: Readonly<ScoreExplanation>;
  readonly createdAt: string;
}

export interface DuplicateDecision {
  index: number;
  opportunityId: string;
  isDuplicate: boolean;
  duplicateOf: string | null;
  method: 'none' | 'exact_external_id' | 'exact_source_url' | 'normalized_similarity';
  similarity: number | null;
  reason: string;
}

export interface DedupeOptions {
  similarityThreshold?: number;
  compareAcrossSources?: boolean;
}

export interface DedupeResult {
  unique: NormalizedOpportunity[];
  duplicates: NormalizedOpportunity[];
  decisions: DuplicateDecision[];
  /** Alias for callers that use the wording from the workflow docs. */
  duplicateDecisions: DuplicateDecision[];
}

export interface CsvParseOptions {
  delimiter?: string;
  requiredHeaders?: readonly string[];
  allowBlankLines?: boolean;
}

export interface ImportValidationError {
  row: number | null;
  path: string;
  code:
    | 'INVALID_CSV'
    | 'INVALID_JSON'
    | 'EMPTY_INPUT'
    | 'EMPTY_HEADER'
    | 'DUPLICATE_HEADER'
    | 'MISSING_HEADER'
    | 'ROW_FIELD_COUNT'
    | 'EMPTY_ROW'
    | 'INVALID_RECORD'
    | 'REQUIRED_FIELD'
    | 'INVALID_FIELD_TYPE'
    | 'INVALID_URL'
    | 'INVALID_NUMBER'
    | 'NEGATIVE_NUMBER'
    | 'INVALID_JSON_FIELD'
    | 'INVALID_ARRAY'
    | 'INVALID_OBJECT';
  message: string;
  value?: unknown;
}

export interface CsvParseResult {
  headers: string[];
  rows: Record<string, string>[];
  errors: ImportValidationError[];
}

export interface ImportResult<T = RawOpportunityRecord> {
  format: 'csv' | 'json';
  records: T[];
  errors: ImportValidationError[];
  valid: boolean;
}

export interface StateTransitionValidation {
  valid: boolean;
  from: StateStatus;
  to: StateStatus;
  entity: 'job' | 'opportunity';
  requiredHumanGate: HumanGate;
  reasonCode:
    | 'ALLOWED'
    | 'INVALID_STATE'
    | 'TRANSITION_NOT_ALLOWED'
    | 'HUMAN_GATE_REQUIRED'
    | 'WRONG_HUMAN_GATE';
  message: string;
}

export interface HumanGateApproval {
  gate: HumanGate;
  approved: boolean;
}

export interface WipStatus {
  activeCount: number;
  limit: number;
  remaining: number;
  withinLimit: boolean;
  canStart: boolean;
}
