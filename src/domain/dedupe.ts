import {
  type DedupeOptions,
  type DedupeResult,
  type DuplicateDecision,
  type NormalizedOpportunity,
} from './types';

const DEFAULT_SIMILARITY_THRESHOLD = 0.85;

function canonicalSource(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function canonicalExternalId(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

function tokens(value: string): Set<string> {
  const normalized = value
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ');
  const ignored = new Set([
    'a',
    'an',
    'and',
    'are',
    'for',
    'in',
    'is',
    'of',
    'on',
    'or',
    'the',
    'to',
    'with',
    'va',
    'cho',
    'cua',
    'de',
    'la',
    'va',
  ]);
  return new Set(normalized.split(' ').filter((token) => token.length > 1 && !ignored.has(token)));
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (!left.size && !right.size) return 1;
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  return intersection / (left.size + right.size - intersection);
}

function normalizedText(opportunity: NormalizedOpportunity): {
  title: Set<string>;
  description: Set<string>;
} {
  return {
    title: tokens(opportunity.title),
    description: tokens(
      `${opportunity.originalDescription} ${opportunity.deliverables.join(' ')} ${opportunity.acceptanceCriteria.join(' ')}`,
    ),
  };
}

function similarity(left: NormalizedOpportunity, right: NormalizedOpportunity): number {
  const a = normalizedText(left);
  const b = normalizedText(right);
  // Title carries more signal than a copied boilerplate description.
  return 0.7 * jaccard(a.title, b.title) + 0.3 * jaccard(a.description, b.description);
}

function exactExternalKey(opportunity: NormalizedOpportunity): string | null {
  if (!opportunity.externalId) return null;
  return `${canonicalSource(opportunity.source)}|${canonicalExternalId(opportunity.externalId)}`;
}

function exactUrlKey(opportunity: NormalizedOpportunity): string | null {
  if (!opportunity.sourceUrl) return null;
  return `${canonicalSource(opportunity.source)}|${opportunity.sourceUrl.toLocaleLowerCase()}`;
}

/**
 * Stable first-seen deduplication. Exact source/external-id matches win over
 * URL matches, which win over deterministic token similarity. No network or
 * model calls are made here.
 */
export function deduplicateOpportunities(
  opportunities: readonly NormalizedOpportunity[],
  options: DedupeOptions = {},
): DedupeResult {
  const threshold = Math.min(
    1,
    Math.max(0, options.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD),
  );
  const compareAcrossSources = options.compareAcrossSources ?? true;
  const canonicalByExternal = new Map<string, NormalizedOpportunity>();
  const canonicalByUrl = new Map<string, NormalizedOpportunity>();
  const unique: NormalizedOpportunity[] = [];
  const duplicates: NormalizedOpportunity[] = [];
  const decisions: DuplicateDecision[] = [];

  for (let index = 0; index < opportunities.length; index += 1) {
    const opportunity = opportunities[index];
    const externalKey = exactExternalKey(opportunity);
    const urlKey = exactUrlKey(opportunity);
    const externalCanonical = externalKey ? canonicalByExternal.get(externalKey) : undefined;
    const urlCanonical = urlKey ? canonicalByUrl.get(urlKey) : undefined;

    if (externalCanonical) {
      duplicates.push(opportunity);
      decisions.push({
        index,
        opportunityId: opportunity.id,
        isDuplicate: true,
        duplicateOf: externalCanonical.id,
        method: 'exact_external_id',
        similarity: 1,
        reason: 'Same source and external ID as an earlier opportunity.',
      });
      continue;
    }

    if (urlCanonical) {
      duplicates.push(opportunity);
      decisions.push({
        index,
        opportunityId: opportunity.id,
        isDuplicate: true,
        duplicateOf: urlCanonical.id,
        method: 'exact_source_url',
        similarity: 1,
        reason: 'Same source and URL as an earlier opportunity.',
      });
      continue;
    }

    let similarCanonical: NormalizedOpportunity | undefined;
    let similarScore: number | null = null;
    for (const candidate of unique) {
      if (
        !compareAcrossSources &&
        canonicalSource(candidate.source) !== canonicalSource(opportunity.source)
      ) {
        continue;
      }
      const candidateScore = similarity(candidate, opportunity);
      if (
        candidateScore >= threshold &&
        (similarScore === null || candidateScore > (similarScore ?? -1))
      ) {
        similarCanonical = candidate;
        similarScore = candidateScore;
      }
    }

    if (similarCanonical) {
      duplicates.push(opportunity);
      const resolvedSimilarity = similarScore ?? 0;
      decisions.push({
        index,
        opportunityId: opportunity.id,
        isDuplicate: true,
        duplicateOf: similarCanonical.id,
        method: 'normalized_similarity',
        similarity: resolvedSimilarity,
        reason: `Normalized title/description similarity ${resolvedSimilarity.toFixed(3)} meets threshold ${threshold.toFixed(3)}.`,
      });
      continue;
    }

    unique.push(opportunity);
    if (externalKey) canonicalByExternal.set(externalKey, opportunity);
    if (urlKey) canonicalByUrl.set(urlKey, opportunity);
    decisions.push({
      index,
      opportunityId: opportunity.id,
      isDuplicate: false,
      duplicateOf: null,
      method: 'none',
      similarity: null,
      reason: 'No exact or normalized duplicate found.',
    });
  }

  return {
    unique,
    duplicates,
    decisions,
    duplicateDecisions: decisions,
  };
}

export const dedupeOpportunities = deduplicateOpportunities;

export function normalizedSimilarity(
  left: NormalizedOpportunity,
  right: NormalizedOpportunity,
): number {
  return similarity(left, right);
}
