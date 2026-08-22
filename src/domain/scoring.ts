import {
  type NormalizedOpportunity,
  type ScoreEconomics,
  type ScoreExplanation,
  type ScoreExplanationComponent,
  type ScoreFeatureInput,
  type ScoreFeatures,
  type ScoreInput,
  type ScoreOptions,
  type ScoreSnapshot,
  type ScoreWeightSet,
} from './types';

export const SCORE_V1_WEIGHTS: Readonly<ScoreWeightSet> = Object.freeze({
  technical_fit: 0.2,
  completion_probability: 0.2,
  scope_clarity: 0.12,
  payment_quality: 0.15,
  verification_quality: 0.08,
  repeatability: 0.08,
  client_quality: 0.05,
  implementation_effort: 0.03,
  human_attention: 0.02,
  communication_burden: 0.02,
  revision_risk: 0.02,
  platform_risk: 0.01,
  security_risk: 0.01,
  scope_creep_risk: 0.01,
});

export const SCORE_V1_WEIGHT_PERCENTAGES: Readonly<ScoreWeightSet> = Object.freeze({
  technical_fit: 20,
  completion_probability: 20,
  scope_clarity: 12,
  payment_quality: 15,
  verification_quality: 8,
  repeatability: 8,
  client_quality: 5,
  implementation_effort: 3,
  human_attention: 2,
  communication_burden: 2,
  revision_risk: 2,
  platform_risk: 1,
  security_risk: 1,
  scope_creep_risk: 1,
});

const POSITIVE_KEYS = [
  'technical_fit',
  'completion_probability',
  'scope_clarity',
  'payment_quality',
  'verification_quality',
  'repeatability',
  'client_quality',
] as const;

const RISK_KEYS = [
  'implementation_effort',
  'human_attention',
  'communication_burden',
  'revision_risk',
  'platform_risk',
  'security_risk',
  'scope_creep_risk',
] as const;

const FEATURE_ALIASES: Readonly<Record<string, keyof ScoreFeatureInput>> = {
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
};

const COMPONENT_LABELS: Readonly<Record<string, string>> = {
  technical_fit: 'Technical fit',
  completion_probability: 'Completion probability',
  scope_clarity: 'Scope clarity',
  payment_quality: 'Payment quality',
  verification_quality: 'Verification quality',
  repeatability: 'Repeatability',
  client_quality: 'Client quality',
  implementation_effort: 'Implementation effort',
  human_attention: 'Human attention',
  communication_burden: 'Communication burden',
  revision_risk: 'Revision risk',
  platform_risk: 'Platform risk',
  security_risk: 'Security risk',
  scope_creep_risk: 'Scope creep risk',
};

function clamp(value: number, minimum = 0, maximum = 100): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

function clampRate(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  const result = Math.round((value + Number.EPSILON) * factor) / factor;
  return Object.is(result, -0) ? 0 : result;
}

function finiteNonNegative(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function valueFor(
  input: ScoreFeatureInput,
  key: keyof ScoreFeatureInput,
  snakeKey: string,
): number {
  const direct = input[key];
  const aliasKey = snakeKey as keyof ScoreFeatureInput;
  const alias = input[aliasKey];
  const value = typeof direct === 'number' ? direct : alias;
  return clamp(typeof value === 'number' ? value : 0);
}

function normalizedFeatures(input: ScoreFeatureInput): ScoreFeatures {
  return {
    technicalFit: valueFor(input, 'technicalFit', 'technical_fit'),
    completionProbability: valueFor(input, 'completionProbability', 'completion_probability'),
    scopeClarity: valueFor(input, 'scopeClarity', 'scope_clarity'),
    paymentQuality: valueFor(input, 'paymentQuality', 'payment_quality'),
    verificationQuality: valueFor(input, 'verificationQuality', 'verification_quality'),
    repeatability: valueFor(input, 'repeatability', 'repeatability'),
    clientQuality: valueFor(input, 'clientQuality', 'client_quality'),
    implementationEffort: valueFor(input, 'implementationEffort', 'implementation_effort'),
    humanAttention: valueFor(input, 'humanAttention', 'human_attention'),
    communicationBurden: valueFor(input, 'communicationBurden', 'communication_burden'),
    revisionRisk: valueFor(input, 'revisionRisk', 'revision_risk'),
    platformRisk: valueFor(input, 'platformRisk', 'platform_risk'),
    securityRisk: valueFor(input, 'securityRisk', 'security_risk'),
    scopeCreepRisk: valueFor(input, 'scopeCreepRisk', 'scope_creep_risk'),
    scamRisk: valueFor(input, 'scamRisk', 'scam_risk'),
  };
}

function featureValue(features: ScoreFeatures, snakeKey: string): number {
  const camelKey = FEATURE_ALIASES[snakeKey];
  if (!camelKey) return 0;
  return features[camelKey as keyof ScoreFeatures] as number;
}

function dateIso(value: Date | string | undefined): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

function unique(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = value.trim();
    const key = item.toLocaleLowerCase();
    if (item && !seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

function explainComponent(
  key: (typeof POSITIVE_KEYS)[number] | (typeof RISK_KEYS)[number],
  features: ScoreFeatures,
): ScoreExplanationComponent {
  const value = featureValue(features, key);
  const weight = SCORE_V1_WEIGHTS[key];
  const positive = (POSITIVE_KEYS as readonly string[]).includes(key);
  const contribution = round((positive ? 1 : -1) * value * weight);
  return {
    key,
    value,
    weight,
    contribution,
    direction: positive ? 'positive' : 'negative',
    label: COMPONENT_LABELS[key],
    detail: `${COMPONENT_LABELS[key]} ${value.toFixed(2)} × ${(weight * 100).toFixed(0)}% = ${contribution.toFixed(2)} points`,
  };
}

function explanationText(
  overallScore: number,
  positiveSubtotal: number,
  riskAdjustment: number,
  normalizationOffset: number,
  expectedNetRevenue: number | null,
  revenuePerHumanHour: number | null,
  expectedRevenuePer1mTokens: number | null,
  components: readonly ScoreExplanationComponent[],
): string {
  const positiveText = components
    .filter((component) => component.direction === 'positive')
    .map((component) => `${component.label} ${component.value.toFixed(0)}`)
    .join(', ');
  const riskText = components
    .filter((component) => component.direction === 'negative' && component.value > 0)
    .map((component) => `${component.label} ${component.value.toFixed(0)}`)
    .join(', ');
  const economics = [
    expectedNetRevenue === null
      ? 'expected net revenue unavailable'
      : `expected net revenue ${expectedNetRevenue.toFixed(2)}`,
    revenuePerHumanHour === null
      ? 'human-hour efficiency unavailable'
      : `revenue/human hour ${revenuePerHumanHour.toFixed(2)}`,
    expectedRevenuePer1mTokens === null
      ? 'token efficiency unavailable'
      : `revenue/1M tokens ${expectedRevenuePer1mTokens.toFixed(2)}`,
  ].join('; ');
  return [
    `score_v1 ${overallScore.toFixed(2)}/100`,
    `positive subtotal ${positiveSubtotal.toFixed(2)}`,
    `risk adjustment ${riskAdjustment.toFixed(2)}`,
    `normalization offset ${normalizationOffset.toFixed(2)}`,
    `positive signals: ${positiveText || 'none'}`,
    `risk signals: ${riskText || 'none'}`,
    economics,
  ].join('. ');
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (typeof value !== 'object' || value === null || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child, seen);
  }
  return Object.freeze(value);
}

function asScoreInput(
  input: ScoreInput | NormalizedOpportunity,
  features?: ScoreFeatureInput,
): ScoreInput {
  if (features) {
    return { opportunity: input as NormalizedOpportunity, features };
  }
  return input as ScoreInput;
}

function extractEconomics(
  input: ScoreInput,
  options: ScoreOptions,
): {
  economics: ScoreEconomics;
  assumptions: string[];
  budgetMidpoint: number | null;
} {
  const supplied = input.economics ?? {};
  const opportunityBudget = input.opportunity?.budgetMidpoint ?? null;
  const budgetMidpoint = finiteNonNegative(supplied.budgetMidpoint ?? opportunityBudget);
  const assumptions = [...(input.assumptions ?? [])];
  const economics: ScoreEconomics = { ...supplied };

  if (economics.budgetMidpoint === undefined) economics.budgetMidpoint = opportunityBudget;
  if (economics.completionProbabilityRate === undefined) {
    assumptions.push('completion probability rate derived from the 0-100 score component');
  }
  if (economics.winProbability === undefined || economics.winProbability === null) {
    economics.winProbability = clampRate(options.defaultWinProbability ?? 0.1);
    assumptions.push(
      `configured conservative win probability prior ${(economics.winProbability * 100).toFixed(0)}% used`,
    );
  } else {
    economics.winProbability = clampRate(economics.winProbability);
  }
  if (budgetMidpoint === null)
    assumptions.push('budget midpoint unavailable; expected revenue metrics are not calculated');
  if (economics.estimatedHumanMinutes === undefined || economics.estimatedHumanMinutes === null) {
    assumptions.push('human-time estimate unavailable; human-hour efficiency is not calculated');
  }
  if (economics.estimatedTokens === undefined || economics.estimatedTokens === null) {
    assumptions.push('token estimate unavailable; token efficiency is not calculated');
  }
  return { economics, assumptions: unique(assumptions), budgetMidpoint };
}

function buildSnapshot(input: ScoreInput, options: ScoreOptions): ScoreSnapshot {
  const features = normalizedFeatures(input.features);
  const components: ScoreExplanationComponent[] = [
    ...POSITIVE_KEYS.map((key) => explainComponent(key, features)),
    ...RISK_KEYS.map((key) => explainComponent(key, features)),
  ];
  const positiveSubtotal = round(
    components
      .filter((component) => component.direction === 'positive')
      .reduce((sum, component) => sum + component.contribution, 0),
  );
  const riskAdjustment = round(
    components
      .filter((component) => component.direction === 'negative')
      .reduce((sum, component) => sum + component.contribution, 0),
  );
  const rawWeightedScore = round(positiveSubtotal + riskAdjustment);
  // The documented positive weights total 88% and risk weights total 12%.
  // Shifting by the risk capacity makes a perfect, risk-free record 100 and a
  // zero-positive/all-risk record 0 while preserving every documented weight.
  const normalizationOffset = options.normalizationOffset ?? 12;
  const overallScore = round(clamp(rawWeightedScore + normalizationOffset));
  const extracted = extractEconomics(input, options);
  const economics = extracted.economics;
  const completionRate = clampRate(
    economics.completionProbabilityRate ?? features.completionProbability / 100,
  );
  const winProbability =
    extracted.budgetMidpoint === null && input.economics?.winProbability === undefined
      ? null
      : (economics.winProbability ?? null);
  const expectedPlatformFees = Math.max(0, economics.expectedPlatformFees ?? 0);
  const expectedExternalCosts = Math.max(0, economics.expectedExternalCosts ?? 0);
  const expectedNetRevenue =
    extracted.budgetMidpoint !== null && winProbability !== null
      ? round(
          extracted.budgetMidpoint * completionRate * winProbability -
            expectedPlatformFees -
            expectedExternalCosts,
        )
      : null;
  const estimatedHumanMinutes = finiteNonNegative(economics.estimatedHumanMinutes);
  const estimatedTokens = finiteNonNegative(economics.estimatedTokens);
  const estimatedAiMinutes = finiteNonNegative(economics.estimatedAiMinutes);
  const revenuePerHumanHour =
    expectedNetRevenue !== null && estimatedHumanMinutes !== null
      ? round(expectedNetRevenue / Math.max(estimatedHumanMinutes / 60, 0.25))
      : null;
  const expectedRevenuePer1mTokens =
    expectedNetRevenue !== null && estimatedTokens !== null && estimatedTokens > 0
      ? round((expectedNetRevenue / estimatedTokens) * 1_000_000)
      : null;
  const riskFlagThreshold = options.riskFlagThreshold ?? 60;
  const riskFlags: string[] = components
    .filter(
      (component) => component.direction === 'negative' && component.value >= riskFlagThreshold,
    )
    .map((component) => component.key);
  const scamRisk = featureValue(features, 'scam_risk');
  if (scamRisk >= riskFlagThreshold) riskFlags.push('scam_risk');
  const assumptions = extracted.assumptions;
  const summary =
    overallScore >= 85
      ? 'Priority A candidate: review for application immediately.'
      : overallScore >= 75
        ? 'Priority B candidate: strong candidate for owner review.'
        : overallScore >= 65
          ? 'Priority C candidate: apply only if pipeline capacity allows.'
          : overallScore >= 50
            ? 'Watch / low priority candidate.'
            : 'Reject by default unless new evidence changes the inputs.';
  const explanation: ScoreExplanation = {
    scoringVersion: 'score_v1',
    components,
    positiveSubtotal,
    riskAdjustment,
    rawWeightedScore,
    normalizationOffset,
    summary,
    text: explanationText(
      overallScore,
      positiveSubtotal,
      riskAdjustment,
      normalizationOffset,
      expectedNetRevenue,
      revenuePerHumanHour,
      expectedRevenuePer1mTokens,
      components,
    ),
  };
  const snapshot: ScoreSnapshot = {
    scoringVersion: 'score_v1',
    features,
    overallScore,
    score: overallScore,
    rawWeightedScore,
    positiveSubtotal,
    riskAdjustment,
    estimatedAiMinutes,
    estimatedHumanMinutes,
    estimatedTokens,
    completionProbability: features.completionProbability,
    winProbability,
    expectedNetRevenue,
    revenuePerHumanHour,
    expectedRevenuePer1mTokens,
    assumptions,
    riskFlags: unique(riskFlags),
    explanation,
    createdAt: dateIso(options.now),
  };
  return deepFreeze(snapshot);
}

export function scoreOpportunity(
  input: ScoreInput,
  options?: ScoreOptions,
): Readonly<ScoreSnapshot>;
export function scoreOpportunity(
  opportunity: NormalizedOpportunity,
  features: ScoreFeatureInput,
  options?: ScoreOptions,
): Readonly<ScoreSnapshot>;
export function scoreOpportunity(
  inputOrOpportunity: ScoreInput | NormalizedOpportunity,
  featuresOrOptions?: ScoreFeatureInput | ScoreOptions,
  maybeOptions?: ScoreOptions,
): Readonly<ScoreSnapshot> {
  const hasFeatures = featuresOrOptions && 'features' in (featuresOrOptions as object);
  if (hasFeatures) {
    throw new TypeError(
      'Use scoreOpportunity(opportunity, features, options) with a feature object as the second argument.',
    );
  }
  const isOpportunityInput = 'features' in (inputOrOpportunity as object);
  if (isOpportunityInput) {
    return buildSnapshot(
      asScoreInput(inputOrOpportunity as ScoreInput),
      (featuresOrOptions as ScoreOptions | undefined) ?? {},
    );
  }
  return buildSnapshot(
    asScoreInput(
      inputOrOpportunity as NormalizedOpportunity,
      featuresOrOptions as ScoreFeatureInput,
    ),
    maybeOptions ?? {},
  );
}

/** Explicit score_v1 name for callers persisting versioned snapshots. */
export const scoreV1 = scoreOpportunity;
export const calculateScore = scoreOpportunity;
