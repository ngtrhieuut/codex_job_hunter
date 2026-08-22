import {
  OPPORTUNITY_CATEGORIES,
  type BudgetType,
  type GithubIssueLikeRecord,
  type JsonObject,
  type JsonValue,
  type ManualOpportunityRecord,
  type NormalizedOpportunity,
  type NormalizeOptions,
  type OpportunityCategory,
  type OpportunitySource,
  type RawOpportunityRecord,
  type PaymentStatus,
} from './types';

const CATEGORY_ALIASES: Readonly<Record<string, OpportunityCategory>> = {
  python: 'python_bugfix',
  python3: 'python_bugfix',
  bugfix: 'python_bugfix',
  javascript: 'js_ts_bugfix',
  typescript: 'js_ts_bugfix',
  js: 'js_ts_bugfix',
  ts: 'js_ts_bugfix',
  react: 'react_nextjs',
  next: 'react_nextjs',
  nextjs: 'react_nextjs',
  api: 'backend_api',
  backend: 'backend_api',
  integration: 'api_integration',
  automation: 'automation',
  excel: 'csv_excel',
  csv: 'csv_excel',
  data: 'data_processing',
  scraping: 'web_scraping',
  scraper: 'web_scraping',
  extension: 'browser_extension',
  chrome_extension: 'browser_extension',
  telegram: 'bot',
  discord: 'bot',
  dashboard: 'dashboard',
  deploy: 'deployment',
  docker: 'docker',
  cicd: 'ci_cd',
  ci: 'ci_cd',
  database: 'database',
  testing: 'testing',
  tests: 'testing',
  review: 'code_review',
  security: 'security_review',
  wordpress: 'wordpress',
  shopify: 'shopify',
  ai: 'ai_integration',
  llm: 'ai_integration',
};

const CATEGORY_PATTERNS: ReadonlyArray<readonly [OpportunityCategory, RegExp]> = [
  ['python_bugfix', /\bpython(?:3)?\b|django|flask|fastapi/i],
  ['js_ts_bugfix', /\b(?:javascript|typescript|node(?:\.js)?|npm|yarn)\b/i],
  ['react_nextjs', /\breact\b|next\.?(?:js)?|nextjs/i],
  ['backend_api', /\bbackend\b|rest\s*api|graphql|express\b/i],
  ['api_integration', /api\s+integration|integrat(?:e|ion).*api|webhook/i],
  ['automation', /automation|automate|workflow/i],
  ['csv_excel', /\bcsv\b|excel|spreadsheet|xlsx/i],
  ['data_processing', /data\s+(?:processing|cleaning|transform)|etl|pipeline/i],
  ['web_scraping', /web\s*scrap|scraper|crawling|crawl/i],
  ['browser_extension', /browser\s+extension|chrome\s+extension/i],
  ['bot', /\b(?:telegram|discord|slack)\s+bot\b|chatbot/i],
  ['dashboard', /dashboard|admin\s+panel|analytics\s+panel/i],
  ['deployment', /deploy(?:ment)?|hosting|release/i],
  ['docker', /\bdocker\b|containeriz/i],
  ['ci_cd', /\bci\/cd\b|continuous\s+integration|github\s+actions/i],
  ['database', /database|postgres(?:ql)?|mysql|sqlite|supabase|neon/i],
  ['testing', /unit\s+test|integration\s+test|test\s+coverage|qa\b/i],
  ['code_review', /code\s+review|review\s+pull\s+request/i],
  ['security_review', /security\s+(?:audit|review|assessment)|penetration\s+test/i],
  ['wordpress', /wordpress|\bwp\b/i],
  ['shopify', /shopify/i],
  ['ai_integration', /\bai\b|llm|openai|anthropic|generative\s+ai/i],
];

const UNSAFE_URL_PROTOCOLS = new Set(['javascript:', 'data:', 'vbscript:', 'file:', 'about:']);
const DANGEROUS_METADATA_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function firstValue(record: UnknownRecord, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (
      Object.prototype.hasOwnProperty.call(record, key) &&
      record[key] !== undefined &&
      record[key] !== null
    ) {
      return record[key];
    }
  }
  return undefined;
}

function cleanText(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    return '';
  }

  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .trim();
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function listFromValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(cleanText).filter(Boolean);
  }

  const text = cleanText(value);
  if (!text) {
    return [];
  }

  if (text.startsWith('[') && text.endsWith(']')) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.map(cleanText).filter(Boolean);
      }
    } catch {
      // Keep the literal value as a one-item list. Import validation reports
      // malformed JSON; normalization must remain safe and non-throwing.
    }
  }

  return text
    .split(/[\n,;]+/)
    .map((item) => item.replace(/^[-*\u2022]\s*/, '').trim())
    .filter(Boolean);
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeWhitespace(value);
    const key = normalized.toLocaleLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function numericValue(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  if (typeof value !== 'string') {
    return null;
  }

  const cleaned = value.replace(/[^\d.+-]/g, '').trim();
  if (!cleaned || cleaned === '.' || cleaned === '-') {
    return null;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function currencyFrom(value: unknown): string | null {
  const text = cleanText(value);
  if (!text) {
    return null;
  }
  return text.toUpperCase();
}

function inferCurrency(value: unknown): string | null {
  const text = cleanText(value);
  if (text.includes('$')) return 'USD';
  if (text.includes('€')) return 'EUR';
  if (text.includes('£')) return 'GBP';
  if (text.includes('₫') || /\bvnd\b/i.test(text)) return 'VND';
  return null;
}

function normalizeDate(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const text = cleanText(value);
  if (!text) {
    return null;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function nowIso(value: Date | string | undefined): string {
  return normalizeDate(value) ?? new Date().toISOString();
}

/**
 * Only HTTP(S) URLs are accepted. Credentials and non-web protocols are
 * rejected because imported records are untrusted input.
 */
export function safeUrl(value: unknown): string | null {
  const text = cleanText(value);
  if (!text || text.length > 4096) {
    return null;
  }

  try {
    const parsed = new URL(text);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    if (
      UNSAFE_URL_PROTOCOLS.has(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      !parsed.hostname
    ) {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

function canonicalCategory(value: string): OpportunityCategory | null {
  const normalized = value
    .toLocaleLowerCase()
    .trim()
    .replace(/[./-]+/g, '_')
    .replace(/\s+/g, '_');

  if ((OPPORTUNITY_CATEGORIES as readonly string[]).includes(normalized)) {
    return normalized as OpportunityCategory;
  }
  return CATEGORY_ALIASES[normalized] ?? null;
}

function normalizeCategories(explicit: unknown, text: string): OpportunityCategory[] {
  const explicitValues = listFromValue(explicit);
  const result: OpportunityCategory[] = [];

  for (const value of explicitValues) {
    const category = canonicalCategory(value);
    if (category && !result.includes(category)) {
      result.push(category);
    }
  }

  for (const [category, pattern] of CATEGORY_PATTERNS) {
    if (pattern.test(text) && !result.includes(category)) {
      result.push(category);
    }
  }

  return result;
}

function normalizeTechnology(value: string): string {
  const lower = value.toLocaleLowerCase();
  const known: Readonly<Record<string, string>> = {
    js: 'JavaScript',
    javascript: 'JavaScript',
    ts: 'TypeScript',
    typescript: 'TypeScript',
    node: 'Node.js',
    nodejs: 'Node.js',
    next: 'Next.js',
    nextjs: 'Next.js',
    react: 'React',
    python3: 'Python',
    postgres: 'PostgreSQL',
    postgresql: 'PostgreSQL',
    excel: 'Excel',
    csv: 'CSV',
  };
  return known[lower.replace(/[.\s-]/g, '')] ?? value;
}

function normalizeTechnologies(value: unknown, text: string): string[] {
  const explicit = listFromValue(value).map(normalizeTechnology);
  const inferred: string[] = [];
  const technologyPatterns: ReadonlyArray<readonly [string, RegExp]> = [
    ['Python', /\bpython(?:3)?\b/i],
    ['JavaScript', /\bjavascript\b|\bjs\b/i],
    ['TypeScript', /\btypescript\b|\bts\b/i],
    ['React', /\breact\b/i],
    ['Next.js', /next\.?(?:js)?|nextjs/i],
    ['Node.js', /node\.?(?:js)?|nodejs/i],
    ['PostgreSQL', /postgres(?:ql)?/i],
    ['Docker', /\bdocker\b/i],
    ['GitHub Actions', /github\s+actions/i],
    ['Excel', /\bexcel\b|\bxlsx\b/i],
    ['CSV', /\bcsv\b/i],
    ['Shopify', /\bshopify\b/i],
    ['WordPress', /wordpress/i],
  ];

  for (const [technology, pattern] of technologyPatterns) {
    if (pattern.test(text)) {
      inferred.push(technology);
    }
  }

  return uniqueStrings([...explicit, ...inferred]);
}

function linesFromText(text: string): string[] {
  return text
    .split(/\r?\n|(?<=[.!?])\s+/)
    .map((line) => line.replace(/^\s*(?:[-*\u2022]|\[[ xX]\]|\d+[.)])\s*/, '').trim())
    .filter((line) => line.length >= 8);
}

function inferDeliverables(text: string): string[] {
  const lines = linesFromText(text);
  const result: string[] = [];
  for (const line of lines) {
    if (
      /(?:deliverables?|output|please provide|need you to|implement|build|create|fix|add)\b/i.test(
        line,
      )
    ) {
      result.push(line);
    }
  }
  return uniqueStrings(result).slice(0, 12);
}

function inferAcceptanceCriteria(text: string): string[] {
  const lines = linesFromText(text);
  const result: string[] = [];
  for (const line of lines) {
    if (
      /(?:acceptance|criteria|must|should|shall|required|requirements?|done when|expected behavior)\b/i.test(
        line,
      )
    ) {
      result.push(line);
    }
  }
  return uniqueStrings(result).slice(0, 12);
}

function inferClientConstraints(text: string): string[] {
  const lines = linesFromText(text);
  const result: string[] = [];
  for (const line of lines) {
    if (
      /(?:deadline|timezone|located|location|on[- ]site|in[- ]person|access|must be|availability|meeting)\b/i.test(
        line,
      )
    ) {
      result.push(line);
    }
  }
  return uniqueStrings(result).slice(0, 12);
}

function normalizedSummary(title: string, description: string, explicit: unknown): string {
  const supplied = cleanText(explicit);
  if (supplied) {
    return normalizeWhitespace(supplied).slice(0, 500);
  }
  const source = normalizeWhitespace(description || title);
  return source.slice(0, 500);
}

function normalizedExternalId(record: UnknownRecord, source: OpportunitySource): string | null {
  const direct = cleanText(
    firstValue(record, ['externalId', 'external_id', 'issueId', 'issue_id']),
  );
  if (direct) {
    return direct;
  }

  const issueNumber = cleanText(record.number);
  if (source.toLocaleLowerCase() === 'github' && issueNumber) {
    const repositoryValue = firstValue(record, ['repository', 'repository_url', 'full_name']);
    const repository = isRecord(repositoryValue)
      ? cleanText(firstValue(repositoryValue, ['full_name', 'name', 'html_url']))
      : cleanText(repositoryValue);
    return repository ? `${repository}#${issueNumber}` : `issue#${issueNumber}`;
  }
  return null;
}

interface BudgetInfo {
  min: number | null;
  max: number | null;
  midpoint: number | null;
  currency: string | null;
  type: BudgetType;
}

function budgetInfo(record: UnknownRecord): BudgetInfo {
  const budgetValue = firstValue(record, ['budget', 'price', 'amount', 'compensation']);
  const budgetRecord = isRecord(budgetValue) ? budgetValue : null;

  let min = numericValue(
    firstValue(record, ['budgetMin', 'budget_min', 'minBudget', 'min_budget']),
  );
  let max = numericValue(
    firstValue(record, ['budgetMax', 'budget_max', 'maxBudget', 'max_budget']),
  );
  let midpoint = numericValue(firstValue(record, ['budgetMidpoint', 'budget_midpoint']));
  let budgetText = cleanText(budgetValue);

  if (budgetRecord) {
    min ??= numericValue(firstValue(budgetRecord, ['min', 'minimum', 'from', 'budgetMin']));
    max ??= numericValue(firstValue(budgetRecord, ['max', 'maximum', 'to', 'budgetMax']));
    midpoint ??= numericValue(firstValue(budgetRecord, ['midpoint', 'amount', 'value']));
    budgetText = normalizeWhitespace(
      [cleanText(budgetRecord.min), cleanText(budgetRecord.max), cleanText(budgetRecord.amount)]
        .filter(Boolean)
        .join(' '),
    );
  }

  if (budgetText && min === null && max === null && midpoint === null) {
    const matches = budgetText.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
    const numbers = matches.map(numericValue).filter((value): value is number => value !== null);
    if (numbers.length >= 2) {
      min = numbers[0];
      max = numbers[1];
    } else if (numbers.length === 1) {
      midpoint = numbers[0];
    }
  }

  if (min !== null && max !== null && min > max) {
    [min, max] = [max, min];
  }
  midpoint ??= min !== null && max !== null ? (min + max) / 2 : (min ?? max);

  const rawCurrency = firstValue(
    budgetRecord ?? record,
    budgetRecord ? ['currency', 'unit'] : ['currency'],
  );
  const currency = currencyFrom(rawCurrency) ?? inferCurrency(budgetValue);
  const explicitType = cleanText(
    firstValue(record, ['budgetType', 'budget_type', 'paymentType', 'payment_type']),
  );
  const type: BudgetType = /hour|hourly|hr/i.test(explicitType || budgetText)
    ? 'hourly'
    : midpoint !== null
      ? 'fixed'
      : 'unknown';

  return { min, max, midpoint, currency, type };
}

function paymentStatus(
  record: UnknownRecord,
  description: string,
  budget: BudgetInfo,
): PaymentStatus {
  const explicit = cleanText(
    firstValue(record, ['paymentStatus', 'payment_status']),
  ).toLocaleLowerCase();
  if (['unpaid', 'none', 'volunteer', 'free'].includes(explicit)) return 'unpaid';
  if (['paid', 'bounty', 'compensated'].includes(explicit)) return 'paid';

  const paidFlag = firstValue(record, ['isPaid', 'is_paid']);
  if (paidFlag === false) return 'unpaid';
  if (paidFlag === true) return 'paid';

  if (/\b(?:unpaid|no\s+pay|volunteer|free\s+trial|uncompensated)\b/i.test(description))
    return 'unpaid';
  if (budget.midpoint !== null || /\b(?:paid|bounty|compensation|budget)\b/i.test(description))
    return 'paid';
  return 'unknown';
}

function physicalRequirement(record: UnknownRecord, text: string): string | null {
  const explicit = cleanText(
    firstValue(record, ['physicalRequirement', 'physical_requirement', 'locationRequirement']),
  );
  if (explicit) return explicit;
  const match = text.match(
    /[^.!?]*(?:on[- ]site|in[- ]person|onsite|physical presence|located in|local to)[^.!?]*/i,
  );
  return match ? normalizeWhitespace(match[0]) : null;
}

function toJsonValue(value: unknown, seen: Set<object> = new Set()): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'object') {
    return null;
  }
  if (seen.has(value)) {
    return null;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item, seen));
  }

  const result: JsonObject = {};
  for (const [key, item] of Object.entries(value)) {
    if (DANGEROUS_METADATA_KEYS.has(key)) {
      continue;
    }
    result[key] = toJsonValue(item, seen);
  }
  return result;
}

function metadataFrom(raw: UnknownRecord): JsonObject {
  const value = toJsonValue(raw);
  return isRecord(value) ? (value as JsonObject) : {};
}

function hashString(value: string, seed = 2166136261): string {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function stableOpportunityId(
  source: OpportunitySource,
  externalId: string | null,
  title: string,
  description: string,
): string {
  const key = [
    source.toLocaleLowerCase(),
    externalId ?? '',
    title.toLocaleLowerCase(),
    description.toLocaleLowerCase(),
  ]
    .join('|')
    .replace(/\s+/g, ' ');
  const hex = [0, 1, 2, 3]
    .map((index) => hashString(`${key}|${index}`, 2166136261 ^ Math.imul(index + 1, 0x9e3779b9)))
    .join('');
  const characters = hex.split('');
  characters[12] = '4';
  characters[16] = ['8', '9', 'a', 'b'][parseInt(characters[16], 16) % 4];
  return `${characters.slice(0, 8).join('')}-${characters.slice(8, 12).join('')}-${characters.slice(12, 16).join('')}-${characters.slice(16, 20).join('')}-${characters.slice(20).join('')}`;
}

function normalizeSource(value: unknown, fallback: OpportunitySource): OpportunitySource {
  const source = cleanText(value).toLocaleLowerCase();
  return source || fallback;
}

/** Normalize a tolerant manual/CSV/GitHub-like record into the domain shape. */
export function normalizeRawOpportunity(
  raw: RawOpportunityRecord,
  options: NormalizeOptions = {},
): NormalizedOpportunity {
  const record = asRecord(raw);
  const sourceUrl = safeUrl(firstValue(record, ['sourceUrl', 'source_url', 'url', 'html_url']));
  const inferredSource = sourceUrl && /github\.com/i.test(sourceUrl) ? 'github' : 'manual';
  const source = normalizeSource(firstValue(record, ['source']), options.source ?? inferredSource);
  const externalId = normalizedExternalId(record, source);
  const title = normalizeWhitespace(
    cleanText(firstValue(record, ['title', 'name'])) || 'Untitled opportunity',
  );
  const description = normalizeWhitespace(
    cleanText(
      firstValue(record, ['description', 'originalDescription', 'original_description', 'body']),
    ),
  );
  const allText = `${title}\n${description}`;
  const explicitCategories = firstValue(record, ['categories', 'category']);
  const categories = normalizeCategories(explicitCategories, allText);
  const category = categories[0] ?? 'other';
  const technologies = normalizeTechnologies(
    firstValue(record, ['technologies', 'techStack', 'tech_stack']),
    allText,
  );
  const deliverables = uniqueStrings([
    ...listFromValue(firstValue(record, ['deliverables', 'outputs'])),
    ...inferDeliverables(description),
  ]);
  const acceptanceCriteria = uniqueStrings([
    ...listFromValue(
      firstValue(record, [
        'acceptanceCriteria',
        'acceptance_criteria',
        'inferredAcceptanceCriteria',
        'inferred_acceptance_criteria',
      ]),
    ),
    ...inferAcceptanceCriteria(description),
  ]);
  const constraints = uniqueStrings([
    ...listFromValue(
      firstValue(record, ['clientConstraints', 'client_constraints', 'constraints']),
    ),
    ...inferClientConstraints(description),
  ]);
  const budget = budgetInfo(record);
  const explicitDeadline = normalizeDate(
    firstValue(record, ['explicitDeadline', 'explicit_deadline', 'deadline']),
  );
  const postedAt = normalizeDate(
    firstValue(record, ['postedAt', 'posted_at', 'publishedAt', 'created_at']),
  );
  const discoveredAt = nowIso(
    options.now ?? (firstValue(record, ['discoveredAt', 'discovered_at']) as string | undefined),
  );
  const payment = paymentStatus(record, description, budget);
  const physical = physicalRequirement(record, allText);
  const missing = uniqueStrings([
    ...listFromValue(firstValue(record, ['missingInformation', 'missing_information'])),
    !description ? 'description' : '',
    !sourceUrl ? 'source URL' : '',
    budget.midpoint === null ? 'budget' : '',
    budget.midpoint !== null && !budget.currency ? 'currency' : '',
    !categories.length ? 'category' : '',
    !deliverables.length ? 'deliverables' : '',
    !acceptanceCriteria.length ? 'acceptance criteria' : '',
    !explicitDeadline ? 'deadline' : '',
  ]);
  const normalizedSummary = normalizedSummaryValue(
    title,
    description,
    firstValue(record, ['summary', 'normalizedSummary', 'normalized_summary']),
  );
  const suppliedId = cleanText(options.id ?? firstValue(record, ['id']));
  const id =
    suppliedId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(suppliedId)
      ? suppliedId
      : stableOpportunityId(source, externalId || suppliedId, title, description);

  return {
    id,
    source,
    externalId,
    sourceUrl,
    title,
    originalDescription: description,
    normalizedSummary,
    category,
    categories,
    technologies,
    deliverables,
    acceptanceCriteria,
    inferredAcceptanceCriteria: [...acceptanceCriteria],
    missingInformation: missing,
    clientConstraints: constraints,
    budgetMin: budget.min,
    budgetMax: budget.max,
    budgetMidpoint: budget.midpoint,
    currency: budget.currency,
    budgetType: budget.type,
    explicitDeadline,
    postedAt,
    discoveredAt,
    paymentStatus: payment,
    physicalRequirement: physical,
    rawMetadata: metadataFrom(record),
    normalizationVersion: options.normalizationVersion ?? 'normalize_v1',
  };
}

function normalizedSummaryValue(title: string, description: string, explicit: unknown): string {
  return normalizedSummary(title, description, explicit);
}

export function normalizeManualRecord(
  record: ManualOpportunityRecord,
  options: Omit<NormalizeOptions, 'source'> = {},
): NormalizedOpportunity {
  return normalizeRawOpportunity(record, { ...options, source: 'manual' });
}

export function normalizeGithubIssue(
  issue: GithubIssueLikeRecord,
  options: Omit<NormalizeOptions, 'source'> = {},
): NormalizedOpportunity {
  return normalizeRawOpportunity(issue, { ...options, source: 'github' });
}

/** Preferred short name for adapters. */
export const normalizeOpportunity = normalizeRawOpportunity;

export function normalizeStringList(value: unknown): string[] {
  return uniqueStrings(listFromValue(value));
}
