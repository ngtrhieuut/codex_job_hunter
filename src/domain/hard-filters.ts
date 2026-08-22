import {
  type HardFilterReason,
  type HardFilterReasonCode,
  type HardFilterResult,
  type HardFilterSettings,
  type NormalizedOpportunity,
} from './types';

const DEFAULT_PROHIBITED_PATTERNS: readonly RegExp[] = [
  /\b(?:malware|ransomware|keylogger|botnet)\b/i,
  /(?:steal|dump|harvest|exfiltrat)(?:ing|e|ed)?\s+(?:password|credential|cookie|token)/i,
  /\b(?:credential\s+stealer|password\s+stealer|steal(?:ing)?\s+(?:credentials?|passwords?))\b/i,
  /\b(?:phishing|credential\s+theft|carding|credit\s+card\s+fraud)\b/i,
  /\b(?:ddos|denial[- ]of[- ]service|ransom(?:ware)?\s+deployment)\b/i,
  /\b(?:break into|hack|compromise)\s+(?:account|server|system)/i,
  /\b(?:cheat|cheating|answers?)\s+(?:on|for)\s+(?:an?\s+)?(?:exam|assignment|homework)/i,
];

const DEFAULT_SCAM_PATTERNS: readonly RegExp[] = [
  /pay\s+(?:an?\s+)?(?:fee|deposit|shipping|unlocking)\b/i,
  /send\s+(?:money|crypto|bitcoin|gift\s*card)\b/i,
  /\b(?:overpayment|cash\s+a\s+check|advance\s+fee)\b/i,
  /guaranteed\s+payment.*(?:before|upfront)/i,
  /(?:registration|unlocking?)\s+fee/i,
  /\b(?:crypto|bitcoin)\s+deposit\b/i,
  /\bguaranteed\s+income\b/i,
  /move\s+(?:the\s+)?conversation\s+to\s+(?:telegram|whatsapp).*payment/i,
];

const DEFAULT_CIRCUMVENTION_PATTERNS: readonly RegExp[] = [
  /bypass(?:ing)?\s+(?:captcha|kyc|verification|rate\s*limit)/i,
  /(?:evade|avoid|circumvent)\s+(?:a\s+)?(?:ban|suspension|marketplace|platform|account\s+limit)/i,
  /(?:fake|stolen|borrowed)\s+(?:account|identity|credentials?)/i,
  /multiple\s+accounts?\s+(?:to|for)\s+(?:evade|avoid|bypass)/i,
  /(?:bypass|avoid)\s+(?:identity|age|security)\s+checks?/i,
];

const DEFAULT_PHYSICAL_PATTERNS: readonly RegExp[] = [
  /\bon[- ]site\b/i,
  /\bin[- ]person\b/i,
  /\bonsite\b/i,
  /physical\s+presence/i,
  /(?:must\s+be|located|local)\s+in\s+[a-z][a-z .-]+/i,
];

export const DEFAULT_HARD_FILTER_SETTINGS: Readonly<HardFilterSettings> = {
  minimumBudget: 50,
  minimumBudgetPerAiHour: 15,
  minimumBudgetPerHumanHour: 20,
  unpaidTrialMaxAiMinutes: 30,
  vagueDescriptionMaxCharacters: 140,
  vagueLowValueBudget: 100,
  vagueCommunicationBurdenThreshold: 70,
  minimumDescriptionCharacters: 40,
  excludedCategories: [],
  remoteOnly: true,
  allowedPhysicalLocations: [],
  prohibitedPatterns: DEFAULT_PROHIBITED_PATTERNS,
  scamPatterns: DEFAULT_SCAM_PATTERNS,
  circumventionPatterns: DEFAULT_CIRCUMVENTION_PATTERNS,
  physicalPatterns: DEFAULT_PHYSICAL_PATTERNS,
  strategicValueMetadataKeys: [
    'strategicValue',
    'strategic_value',
    'portfolioValue',
    'portfolio_value',
  ],
  shortCircuit: true,
  estimatedAiMinutes: null,
  estimatedHumanMinutes: null,
  communicationBurden: null,
};

function mergeSettings(settings: Partial<HardFilterSettings>): HardFilterSettings {
  return {
    ...DEFAULT_HARD_FILTER_SETTINGS,
    ...settings,
    excludedCategories:
      settings.excludedCategories ?? DEFAULT_HARD_FILTER_SETTINGS.excludedCategories,
    allowedPhysicalLocations:
      settings.allowedPhysicalLocations ?? DEFAULT_HARD_FILTER_SETTINGS.allowedPhysicalLocations,
    prohibitedPatterns:
      settings.prohibitedPatterns ?? DEFAULT_HARD_FILTER_SETTINGS.prohibitedPatterns,
    scamPatterns: settings.scamPatterns ?? DEFAULT_HARD_FILTER_SETTINGS.scamPatterns,
    circumventionPatterns:
      settings.circumventionPatterns ?? DEFAULT_HARD_FILTER_SETTINGS.circumventionPatterns,
    physicalPatterns: settings.physicalPatterns ?? DEFAULT_HARD_FILTER_SETTINGS.physicalPatterns,
    strategicValueMetadataKeys:
      settings.strategicValueMetadataKeys ??
      DEFAULT_HARD_FILTER_SETTINGS.strategicValueMetadataKeys,
  };
}

function textOf(opportunity: NormalizedOpportunity): string {
  return [
    opportunity.title,
    opportunity.originalDescription,
    opportunity.normalizedSummary,
    opportunity.technologies.join(' '),
    opportunity.deliverables.join(' '),
    opportunity.acceptanceCriteria.join(' '),
    opportunity.clientConstraints.join(' '),
    opportunity.physicalRequirement ?? '',
  ].join('\n');
}

function matchedEvidence(text: string, patterns: readonly RegExp[]): string[] {
  const evidence: string[] = [];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) {
      evidence.push(`Matched signal: ${match[0].slice(0, 120)}`);
    }
  }
  return evidence;
}

function reason(code: HardFilterReasonCode, message: string, evidence: string[]): HardFilterReason {
  return { code, message, evidence };
}

function metadataValue(opportunity: NormalizedOpportunity, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(opportunity.rawMetadata, key)) {
      return opportunity.rawMetadata[key];
    }
  }
  return undefined;
}

function explicitUnpaid(opportunity: NormalizedOpportunity): boolean {
  const metadataPayment = metadataValue(opportunity, ['paymentStatus', 'payment_status']);
  const metadataPaid = metadataValue(opportunity, ['isPaid', 'is_paid']);
  return (
    opportunity.paymentStatus === 'unpaid' || metadataPayment === 'unpaid' || metadataPaid === false
  );
}

function strategicValue(opportunity: NormalizedOpportunity, settings: HardFilterSettings): boolean {
  const value = metadataValue(opportunity, settings.strategicValueMetadataKeys);
  return value === true || value === 'true' || value === 1;
}

function checkPatternReason(
  text: string,
  patterns: readonly RegExp[],
  code: HardFilterReasonCode,
  message: string,
): HardFilterReason | null {
  const evidence = matchedEvidence(text, patterns);
  return evidence.length ? reason(code, message, evidence) : null;
}

function checkUnpaid(
  opportunity: NormalizedOpportunity,
  text: string,
  settings: HardFilterSettings,
): HardFilterReason | null {
  const unpaidSignal =
    explicitUnpaid(opportunity) ||
    /\b(?:unpaid|no\s+pay|volunteer|free\s+trial|uncompensated)\b/i.test(text);
  if (!unpaidSignal || strategicValue(opportunity, settings)) {
    return null;
  }

  const aiMinutes = settings.estimatedAiMinutes;
  if (
    aiMinutes !== null &&
    aiMinutes !== undefined &&
    aiMinutes <= settings.unpaidTrialMaxAiMinutes
  ) {
    return null;
  }
  return reason(
    'UNPAID',
    'Explicitly unpaid work exceeds the configured strategic/free-trial allowance.',
    [
      `paymentStatus=${opportunity.paymentStatus}`,
      aiMinutes === null || aiMinutes === undefined
        ? 'estimatedAiMinutes=unknown'
        : `estimatedAiMinutes=${aiMinutes}`,
    ],
  );
}

function checkExcludedCategory(
  opportunity: NormalizedOpportunity,
  settings: HardFilterSettings,
): HardFilterReason | null {
  const excluded = new Set(
    settings.excludedCategories.map((category) => category.toLocaleLowerCase()),
  );
  const matching = opportunity.categories.filter((category) =>
    excluded.has(category.toLocaleLowerCase()),
  );
  return matching.length
    ? reason(
        'EXCLUDED_CATEGORY',
        'The opportunity matches a configured excluded category.',
        matching,
      )
    : null;
}

function checkLowBudget(
  opportunity: NormalizedOpportunity,
  settings: HardFilterSettings,
): HardFilterReason | null {
  const budget = opportunity.budgetMidpoint;
  if (budget === null || budget === undefined) {
    return null;
  }

  const reasons: string[] = [];
  if (settings.minimumBudget > 0 && budget < settings.minimumBudget) {
    reasons.push(`budget ${budget} < minimum ${settings.minimumBudget}`);
  }

  const aiMinutes = settings.estimatedAiMinutes;
  if (
    settings.minimumBudgetPerAiHour !== null &&
    aiMinutes !== null &&
    aiMinutes !== undefined &&
    aiMinutes > 0
  ) {
    const perAiHour = budget / (aiMinutes / 60);
    if (perAiHour < settings.minimumBudgetPerAiHour) {
      reasons.push(
        `budget/AI-hour ${perAiHour.toFixed(2)} < minimum ${settings.minimumBudgetPerAiHour}`,
      );
    }
  }

  const humanMinutes = settings.estimatedHumanMinutes;
  if (
    settings.minimumBudgetPerHumanHour !== null &&
    humanMinutes !== null &&
    humanMinutes !== undefined &&
    humanMinutes > 0
  ) {
    const perHumanHour = budget / (humanMinutes / 60);
    if (perHumanHour < settings.minimumBudgetPerHumanHour) {
      reasons.push(
        `budget/human-hour ${perHumanHour.toFixed(2)} < minimum ${settings.minimumBudgetPerHumanHour}`,
      );
    }
  }

  return reasons.length
    ? reason(
        'LOW_BUDGET',
        'The configured budget floor or effort-adjusted floor is not met.',
        reasons,
      )
    : null;
}

function checkPhysical(
  opportunity: NormalizedOpportunity,
  text: string,
  settings: HardFilterSettings,
): HardFilterReason | null {
  if (!settings.remoteOnly) {
    return null;
  }

  const physicalEvidence = opportunity.physicalRequirement
    ? [opportunity.physicalRequirement]
    : matchedEvidence(text, settings.physicalPatterns);
  if (!physicalEvidence.length) {
    return null;
  }

  const allowed = settings.allowedPhysicalLocations
    .map((location) => location.toLocaleLowerCase().trim())
    .filter(Boolean);
  const isAllowed = allowed.some((location) =>
    physicalEvidence.some((item) => item.toLocaleLowerCase().includes(location)),
  );
  return isAllowed
    ? null
    : reason(
        'IMPOSSIBLE_PHYSICAL',
        'The opportunity requires physical presence outside configured acceptable locations.',
        physicalEvidence,
      );
}

function checkVagueLowValue(
  opportunity: NormalizedOpportunity,
  settings: HardFilterSettings,
): HardFilterReason | null {
  const descriptionLength = opportunity.originalDescription.length;
  const vague =
    descriptionLength < settings.minimumDescriptionCharacters ||
    opportunity.acceptanceCriteria.length === 0 ||
    opportunity.deliverables.length === 0;
  if (!vague) {
    return null;
  }

  const budgetLowOrMissing =
    opportunity.budgetMidpoint === null ||
    opportunity.budgetMidpoint <= settings.vagueLowValueBudget;
  const communicationBurden = settings.communicationBurden;
  const highCommunicationBurden =
    communicationBurden !== null &&
    communicationBurden !== undefined &&
    communicationBurden >= settings.vagueCommunicationBurdenThreshold;
  if (!budgetLowOrMissing || (!highCommunicationBurden && opportunity.budgetMidpoint !== null)) {
    return null;
  }

  return reason(
    'VAGUE_LOW_VALUE',
    'The scope is vague and has low or missing value without a clear strategic exception.',
    [
      `descriptionCharacters=${descriptionLength}`,
      `budget=${opportunity.budgetMidpoint ?? 'unknown'}`,
      `acceptanceCriteria=${opportunity.acceptanceCriteria.length}`,
      `deliverables=${opportunity.deliverables.length}`,
    ],
  );
}

/**
 * Applies cheap, deterministic reject rules. By default it stops at the first
 * matching reason so callers can guarantee this runs before score generation.
 */
export function evaluateHardFilters(
  opportunity: NormalizedOpportunity,
  settings: Partial<HardFilterSettings> = {},
): HardFilterResult {
  const resolved = mergeSettings(settings);
  const text = textOf(opportunity);
  const checks: Array<HardFilterReason | null> = [
    checkPatternReason(
      text,
      resolved.prohibitedPatterns,
      'PROHIBITED_OR_MALICIOUS',
      'The request appears prohibited, malicious, or unsafe to perform.',
    ),
    checkPatternReason(
      text,
      resolved.scamPatterns,
      'SCAM',
      'The opportunity contains a clear scam or payment-fraud signal.',
    ),
    checkUnpaid(opportunity, text, resolved),
    checkPatternReason(
      text,
      resolved.circumventionPatterns,
      'CIRCUMVENTION',
      'The request asks to bypass platform, identity, account, or security controls.',
    ),
    checkExcludedCategory(opportunity, resolved),
    checkLowBudget(opportunity, resolved),
    checkPhysical(opportunity, text, resolved),
    checkVagueLowValue(opportunity, resolved),
  ];
  const reasons: HardFilterReason[] = [];
  for (const candidate of checks) {
    if (!candidate) continue;
    reasons.push(candidate);
    if (resolved.shortCircuit) break;
  }

  const reasonCodes = reasons.map((item) => item.code);
  return {
    passed: reasons.length === 0,
    rejected: reasons.length > 0,
    shortCircuited: resolved.shortCircuit && reasons.length > 0,
    reasonCodes,
    reasons,
    primaryReason: reasonCodes[0] ?? null,
  };
}

export const applyHardFilters = evaluateHardFilters;
export const isHardFiltered = (
  opportunity: NormalizedOpportunity,
  settings: Partial<HardFilterSettings> = {},
): boolean => evaluateHardFilters(opportunity, settings).rejected;
