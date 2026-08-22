import { evaluateHardFilters, DEFAULT_HARD_FILTER_SETTINGS } from '@/src/domain/hard-filters';
import { deduplicateOpportunities } from '@/src/domain/dedupe';
import { normalizeOpportunity } from '@/src/domain/normalize';
import { scoreOpportunity } from '@/src/domain/scoring';
import { OPPORTUNITY_CATEGORIES } from '@/src/domain/types';
import type {
  HardFilterSettings,
  NormalizedOpportunity,
  RawOpportunityRecord,
  ScoreFeatureInput,
  ScoreSnapshot as DomainScoreSnapshot,
} from '@/src/domain/types';
import type { AppSettings, OpportunityRecord, ScoreSnapshot } from './app-types';
import { newId, nowIso } from './ids';
import { getStore } from './store';

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

function textOf(opportunity: NormalizedOpportunity): string {
  return [
    opportunity.title,
    opportunity.originalDescription,
    opportunity.normalizedSummary,
    ...opportunity.technologies,
    ...opportunity.deliverables,
  ]
    .join(' ')
    .toLowerCase();
}

function hasAny(text: string, values: string[]): boolean {
  return values.some((value) => text.includes(value));
}

export function inferScoreFeatures(opportunity: NormalizedOpportunity): ScoreFeatureInput {
  const text = textOf(opportunity);
  const familiar = [
    'python',
    'javascript',
    'typescript',
    'react',
    'next.js',
    'nextjs',
    'node',
    'api',
    'csv',
    'excel',
    'postgres',
    'sql',
    'docker',
    'github',
    'testing',
  ].filter((term) => text.includes(term)).length;
  const technicalFit = clamp(55 + familiar * 6 + (opportunity.category ? 8 : 0));
  const clearArtifacts = opportunity.deliverables.length + opportunity.acceptanceCriteria.length;
  const completionProbability = clamp(
    42 +
      Math.min(clearArtifacts, 5) * 8 +
      (opportunity.sourceUrl ? 6 : 0) +
      (opportunity.originalDescription.length > 220 ? 8 : 0),
  );
  const scopeClarity = clamp(
    35 +
      Math.min(opportunity.originalDescription.length / 12, 35) +
      Math.min(clearArtifacts * 8, 28),
  );
  const budget = opportunity.budgetMidpoint ?? 0;
  const effortEstimate = Math.max(
    30,
    Math.min(360, 55 + opportunity.deliverables.length * 35 + (text.length > 1800 ? 100 : 0)),
  );
  const paymentQuality = budget <= 0 ? 25 : clamp(35 + (budget / effortEstimate) * 55);
  const verificationQuality = clamp(
    25 +
      opportunity.acceptanceCriteria.length * 15 +
      (hasAny(text, ['test', 'expected output', 'acceptance', 'reproduce', 'reproducible'])
        ? 28
        : 0),
  );
  const repeatability = clamp(
    35 +
      (opportunity.category &&
      [
        'automation',
        'csv_excel',
        'data_processing',
        'api_integration',
        'testing',
        'dashboard',
      ].includes(opportunity.category)
        ? 35
        : 0) +
      (familiar >= 2 ? 10 : 0),
  );
  const clientQuality = clamp(
    42 +
      (opportunity.source === 'github' ? 14 : 0) +
      (opportunity.sourceUrl ? 8 : 0) +
      (opportunity.rawMetadata.repository ? 10 : 0),
  );
  const implementationEffort = clamp(
    20 +
      opportunity.deliverables.length * 9 +
      (hasAny(text, ['migrate', 'legacy', 'production', 'deploy', 'multi-tenant']) ? 22 : 0),
  );
  const humanAttention = clamp(
    20 +
      opportunity.missingInformation.length * 7 +
      (hasAny(text, ['meeting', 'call', 'daily', 'urgent', 'coordinate']) ? 28 : 0),
  );
  const communicationBurden = clamp(
    18 +
      opportunity.missingInformation.length * 6 +
      (hasAny(text, ['ongoing', 'support', 'unlimited revision', 'frequent']) ? 32 : 0),
  );
  const revisionRisk = clamp(
    18 +
      (opportunity.acceptanceCriteria.length ? 0 : 30) +
      (hasAny(text, ['design', 'taste', 'creative', 'like', 'similar to']) ? 25 : 0),
  );
  const platformRisk = opportunity.source === 'github' || opportunity.source === 'manual' ? 12 : 35;
  const securityRisk = clamp(
    hasAny(text, [
      'credential',
      'password',
      'token',
      'payment',
      'personal data',
      'pii',
      'production access',
    ])
      ? 48
      : 12,
  );
  const scopeCreepRisk = clamp(
    18 +
      (opportunity.missingInformation.length > 3 ? 24 : 0) +
      (opportunity.acceptanceCriteria.length ? 0 : 22),
  );
  const scamRisk = clamp(
    hasAny(text, [
      'pay fee',
      'registration fee',
      'gift card',
      'crypto deposit',
      'send money',
      'guaranteed income',
    ])
      ? 90
      : 5,
  );
  return {
    technicalFit,
    completionProbability,
    scopeClarity,
    paymentQuality,
    verificationQuality,
    repeatability,
    clientQuality,
    implementationEffort,
    humanAttention,
    communicationBurden,
    revisionRisk,
    platformRisk,
    securityRisk,
    scopeCreepRisk,
    scamRisk,
  };
}

function estimateEffort(opportunity: NormalizedOpportunity): {
  aiMinutes: number;
  humanMinutes: number;
  tokens: number;
} {
  const text = textOf(opportunity);
  const aiMinutes = Math.max(
    30,
    Math.min(360, 55 + opportunity.deliverables.length * 35 + (text.length > 1800 ? 100 : 0)),
  );
  const humanMinutes = Math.max(
    15,
    Math.min(
      180,
      20 + opportunity.missingInformation.length * 10 + (text.includes('meeting') ? 30 : 0),
    ),
  );
  return { aiMinutes, humanMinutes, tokens: Math.round(aiMinutes * 1200) };
}

function domainToApp(
  opportunity: NormalizedOpportunity,
  status: OpportunityRecord['status'] = 'NORMALIZED',
  hardFilterReason: string | null = null,
): OpportunityRecord {
  const timestamp = nowIso();
  return {
    id: opportunity.id,
    source: opportunity.source,
    externalId: opportunity.externalId,
    sourceUrl: opportunity.sourceUrl,
    title: opportunity.title,
    originalDescription: opportunity.originalDescription,
    normalizedSummary: opportunity.normalizedSummary,
    category: opportunity.category || 'other',
    technologies: opportunity.technologies,
    deliverables: opportunity.deliverables,
    inferredAcceptanceCriteria: opportunity.acceptanceCriteria,
    missingInformation: opportunity.missingInformation,
    budgetMin: opportunity.budgetMin,
    budgetMax: opportunity.budgetMax,
    currency: opportunity.currency,
    explicitDeadline: opportunity.explicitDeadline,
    discoveredAt: opportunity.discoveredAt,
    postedAt: opportunity.postedAt,
    rawMetadata: opportunity.rawMetadata,
    status,
    hardFilterReason,
    duplicateOf: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    latestScore: null,
  };
}

function appToDomain(opportunity: OpportunityRecord): NormalizedOpportunity {
  return {
    id: opportunity.id,
    source: opportunity.source,
    externalId: opportunity.externalId,
    sourceUrl: opportunity.sourceUrl,
    title: opportunity.title,
    originalDescription: opportunity.originalDescription,
    normalizedSummary: opportunity.normalizedSummary,
    category: (opportunity.category || 'other') as NormalizedOpportunity['category'],
    categories: [opportunity.category as NormalizedOpportunity['category']],
    technologies: opportunity.technologies,
    deliverables: opportunity.deliverables,
    acceptanceCriteria: opportunity.inferredAcceptanceCriteria,
    inferredAcceptanceCriteria: opportunity.inferredAcceptanceCriteria,
    missingInformation: opportunity.missingInformation,
    clientConstraints: [],
    budgetMin: opportunity.budgetMin,
    budgetMax: opportunity.budgetMax,
    budgetMidpoint:
      opportunity.budgetMin !== null && opportunity.budgetMax !== null
        ? (opportunity.budgetMin + opportunity.budgetMax) / 2
        : (opportunity.budgetMax ?? opportunity.budgetMin),
    currency: opportunity.currency,
    budgetType: 'unknown',
    explicitDeadline: opportunity.explicitDeadline,
    postedAt: opportunity.postedAt,
    discoveredAt: opportunity.discoveredAt,
    paymentStatus: opportunity.budgetMax ? 'unknown' : 'unpaid',
    physicalRequirement: null,
    rawMetadata: opportunity.rawMetadata,
    normalizationVersion: 'normalize_v1',
  };
}

function scoreToApp(opportunityId: string, score: Readonly<DomainScoreSnapshot>): ScoreSnapshot {
  return {
    id: newId(),
    opportunityId,
    scoringVersion: score.scoringVersion,
    components: Object.fromEntries(
      score.explanation.components.map((component) => [component.key, component.value]),
    ),
    overallScore: score.overallScore,
    estimatedAiMinutes: score.estimatedAiMinutes,
    estimatedHumanMinutes: score.estimatedHumanMinutes,
    estimatedTokens: score.estimatedTokens,
    completionProbability: score.completionProbability,
    winProbability: score.winProbability ?? 0,
    expectedNetRevenue: score.expectedNetRevenue ?? 0,
    expectedRevenuePer1mTokens: score.expectedRevenuePer1mTokens,
    assumptions: [...score.assumptions],
    riskFlags: [...score.riskFlags],
    explanation: [score.explanation.summary, score.explanation.text],
    createdAt: score.createdAt,
  };
}

function resolvedHardFilterSettings(settings: AppSettings): Partial<HardFilterSettings> {
  const allowed = new Set(settings.allowedCategories);
  const disallowedByAllowList = allowed.size
    ? OPPORTUNITY_CATEGORIES.filter((category) => !allowed.has(category))
    : [];
  const excluded = [...new Set([...settings.excludedCategories, ...disallowedByAllowList])];
  return {
    ...DEFAULT_HARD_FILTER_SETTINGS,
    minimumBudget: settings.minimumBudget,
    excludedCategories: excluded,
    remoteOnly: false,
    shortCircuit: true,
  };
}

export interface IngestSummary {
  records: OpportunityRecord[];
  duplicates: number;
  hardRejected: number;
  scored: number;
  errors: string[];
}

export async function ingestRawRecords(
  rawRecords: RawOpportunityRecord[],
  source?: string,
): Promise<IngestSummary> {
  const store = getStore();
  const settings = await store.getSettings();
  const existing = await store.listOpportunities();
  const known = existing.map(appToDomain);
  const normalized = rawRecords.map((raw, index) =>
    normalizeOpportunity(raw, {
      source: (source || raw.source || 'manual') as NormalizedOpportunity['source'],
      id: typeof raw.id === 'string' ? raw.id : undefined,
      normalizationVersion: 'normalize_v1',
    }),
  );
  const records: OpportunityRecord[] = [];
  let duplicates = 0;
  let hardRejected = 0;
  let scored = 0;
  const seenIncomingIds = new Set<string>();
  for (let index = 0; index < normalized.length; index += 1) {
    const opportunity = normalized[index];
    const effort = estimateEffort(opportunity);
    const isFirstRefreshOfExisting =
      existing.some((item) => item.id === opportunity.id) && !seenIncomingIds.has(opportunity.id);
    const decision = isFirstRefreshOfExisting
      ? undefined
      : deduplicateOpportunities([
          ...known,
          ...records.map((item) => appToDomain(item)),
          opportunity,
        ]).decisions.at(-1);
    seenIncomingIds.add(opportunity.id);
    if (decision?.isDuplicate) {
      duplicates += 1;
      const duplicate = domainToApp(
        opportunity,
        'REJECTED_HARD_FILTER',
        `DUPLICATE:${decision.method} — ${decision.reason}`,
      );
      duplicate.id = `${opportunity.id}-duplicate-${decision.duplicateOf}`;
      duplicate.duplicateOf = decision.duplicateOf;
      await store.upsertOpportunity(duplicate);
      records.push(duplicate);
      continue;
    }
    const filter = evaluateHardFilters(opportunity, {
      ...resolvedHardFilterSettings(settings),
      estimatedAiMinutes: effort.aiMinutes,
      estimatedHumanMinutes: effort.humanMinutes,
    });
    if (filter.rejected) {
      hardRejected += 1;
      const rejected = domainToApp(
        opportunity,
        'REJECTED_HARD_FILTER',
        filter.reasons.map((item) => `${item.code}: ${item.message}`).join(' | '),
      );
      await store.upsertOpportunity(rejected);
      records.push(rejected);
      continue;
    }
    const features = inferScoreFeatures(opportunity);
    const score = scoreOpportunity(
      {
        opportunity,
        features,
        economics: {
          estimatedAiMinutes: effort.aiMinutes,
          estimatedHumanMinutes: effort.humanMinutes,
          estimatedTokens: effort.tokens,
        },
      },
      { defaultWinProbability: 0.1 },
    );
    const record = domainToApp(opportunity, 'SCORED');
    const snapshot = scoreToApp(record.id, score);
    record.latestScore = snapshot;
    await store.upsertOpportunity(record);
    await store.saveScore(record.id, snapshot);
    records.push(record);
    scored += 1;
  }
  return { records, duplicates, hardRejected, scored, errors: [] };
}

export function appOpportunityToDomain(opportunity: OpportunityRecord): NormalizedOpportunity {
  return appToDomain(opportunity);
}
