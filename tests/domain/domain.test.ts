import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  canStartInProgress,
  deduplicateOpportunities,
  evaluateHardFilters,
  getWipStatus,
  importOpportunityCsv,
  importOpportunityJson,
  normalizeRawOpportunity,
  parseCsv,
  parseJsonArrayOrObject,
  safeUrl,
  scoreOpportunity,
  validateJobTransition,
  validateOpportunityTransition,
} from '../../src/domain';

function opportunity(overrides: Record<string, unknown> = {}) {
  return normalizeRawOpportunity(
    {
      source: 'manual',
      sourceUrl: 'https://example.com/jobs/1',
      title: 'Build a TypeScript API integration',
      description:
        'Implement the API integration and provide tests. Acceptance criteria: tests pass and documented output is returned.',
      budgetMin: 500,
      budgetMax: 700,
      currency: 'USD',
      ...overrides,
    },
    { now: '2026-08-22T00:00:00.000Z' },
  );
}

test('score_v1 uses documented weights, derives economics, explains, and freezes snapshot', () => {
  const perfect = scoreOpportunity(
    {
      opportunity: opportunity(),
      features: {
        technicalFit: 100,
        completionProbability: 100,
        scopeClarity: 100,
        paymentQuality: 100,
        verificationQuality: 100,
        repeatability: 100,
        clientQuality: 100,
        implementationEffort: 0,
        humanAttention: 0,
        communicationBurden: 0,
        revisionRisk: 0,
        platformRisk: 0,
        securityRisk: 0,
        scopeCreepRisk: 0,
        scamRisk: 0,
      },
      economics: {
        completionProbabilityRate: 0.8,
        winProbability: 0.25,
        expectedPlatformFees: 50,
        expectedExternalCosts: 25,
        estimatedHumanMinutes: 60,
        estimatedTokens: 500_000,
      },
    },
    { now: '2026-08-22T00:00:00.000Z' },
  );

  assert.equal(perfect.overallScore, 100);
  assert.equal(perfect.positiveSubtotal, 88);
  assert.equal(perfect.riskAdjustment, 0);
  assert.equal(perfect.expectedNetRevenue, 45);
  assert.equal(perfect.revenuePerHumanHour, 45);
  assert.equal(perfect.expectedRevenuePer1mTokens, 90);
  assert.match(perfect.explanation.text, /score_v1 100\.00\/100/);
  assert.ok(Object.isFrozen(perfect));
  assert.ok(Object.isFrozen(perfect.explanation));

  const worst = scoreOpportunity({
    features: {
      technical_fit: 0,
      completion_probability: 0,
      scope_clarity: 0,
      payment_quality: 0,
      verification_quality: 0,
      repeatability: 0,
      client_quality: 0,
      implementation_effort: 100,
      human_attention: 100,
      communication_burden: 100,
      revision_risk: 100,
      platform_risk: 100,
      security_risk: 100,
      scope_creep_risk: 100,
      scam_risk: 100,
    },
  });
  assert.equal(worst.overallScore, 0);
  assert.ok(worst.riskFlags.includes('scam_risk'));
});

test('normalization keeps safe URLs, GitHub identity, categories, and missing information', () => {
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('https://user:password@example.com/job'), null);
  assert.equal(safeUrl('https://example.com/job'), 'https://example.com/job');

  const normalized = normalizeRawOpportunity(
    {
      source: 'github',
      number: 42,
      repository: { full_name: 'owner/repo' },
      html_url: 'https://github.com/owner/repo/issues/42',
      title: 'Fix Python CSV importer',
      body: 'Implement the parser. Must preserve quoted fields and add tests.',
    },
    { now: '2026-08-22T00:00:00.000Z' },
  );

  assert.equal(normalized.externalId, 'owner/repo#42');
  assert.equal(normalized.source, 'github');
  assert.equal(normalized.category, 'python_bugfix');
  assert.ok(normalized.technologies.includes('Python'));
  assert.ok(normalized.acceptanceCriteria.length > 0);
  assert.ok(normalized.missingInformation.includes('budget'));
});

test('hard filters short-circuit prohibited work and expose configurable reasons', () => {
  const prohibited = evaluateHardFilters(
    opportunity({ description: 'Build ransomware and steal credentials from users.' }),
  );
  assert.equal(prohibited.rejected, true);
  assert.equal(prohibited.primaryReason, 'PROHIBITED_OR_MALICIOUS');
  assert.equal(prohibited.reasonCodes.length, 1);

  const excluded = evaluateHardFilters(opportunity({ category: 'wordpress' }), {
    excludedCategories: ['wordpress'],
  });
  assert.equal(excluded.primaryReason, 'EXCLUDED_CATEGORY');

  const lowBudget = evaluateHardFilters(
    opportunity({ budget: 10, budgetMin: undefined, budgetMax: undefined }),
    {
      minimumBudget: 50,
    },
  );
  assert.equal(lowBudget.primaryReason, 'LOW_BUDGET');

  const vague = evaluateHardFilters(
    opportunity({
      title: 'Simple task',
      description: 'Need help',
      budget: undefined,
      budgetMin: undefined,
      budgetMax: undefined,
    }),
    { communicationBurden: 80 },
  );
  assert.equal(vague.primaryReason, 'VAGUE_LOW_VALUE');
});

test('dedupe prefers exact source/external ID and then deterministic similarity', () => {
  const first = opportunity({ externalId: 'ABC-1' });
  const exact = opportunity({ externalId: ' abc-1 ', title: 'Different title' });
  const similar = opportunity({
    externalId: 'ABC-2',
    title: 'Build a TypeScript API integration',
    description:
      'Implement the API integration and provide tests. Acceptance criteria: tests pass and documented output is returned.',
    sourceUrl: 'https://other.example/jobs/2',
  });
  const result = deduplicateOpportunities([first, exact, similar]);

  assert.equal(result.unique.length, 1);
  assert.equal(result.duplicates.length, 2);
  assert.equal(result.decisions[1].method, 'exact_external_id');
  assert.equal(result.decisions[2].method, 'normalized_similarity');
  assert.equal(result.decisions[1].duplicateOf, first.id);
});

test('CSV and JSON imports validate quoting, arrays, unsafe URLs, rows, and paths', () => {
  const parsed = parseCsv(
    'title,description,technologies\n"Fix, bug","Use ""quoted"" output.","[""TypeScript"",""React""]"',
  );
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.rows[0].title, 'Fix, bug');
  assert.equal(parsed.rows[0].description, 'Use "quoted" output.');

  const csv = importOpportunityCsv(
    [
      'title,description,source_url,technologies',
      'Good job,"Implement and test it.",https://example.com/job,"[""TypeScript""]"',
      'Bad job,broken,javascript:alert(1),[not-json]',
    ].join('\n'),
    { requireDescription: true },
  );
  assert.equal(csv.valid, false);
  assert.equal(csv.records.length, 1);
  assert.ok(csv.errors.some((item) => item.code === 'INVALID_URL'));
  assert.ok(
    csv.errors.some((item) => item.code === 'INVALID_JSON_FIELD' || item.code === 'INVALID_JSON'),
  );
  assert.ok(csv.errors.every((item) => item.row !== null && item.path.length > 0));

  const json = importOpportunityJson(
    JSON.stringify({ opportunities: [{ title: 'Valid', description: 'A clear task' }] }),
    {
      requireDescription: true,
    },
  );
  assert.equal(json.valid, true);
  assert.equal(json.records.length, 1);
  assert.throws(() => parseJsonArrayOrObject('[1,2]'), /objects/);
  const invalid = importOpportunityJson('{bad json');
  assert.equal(invalid.valid, false);
  assert.equal(invalid.errors[0].path, '$');
});

test('state transitions enforce gates and WIP limit', () => {
  const pendingApply = validateJobTransition('SHORTLISTED', 'REQUIRES_APPLY_APPROVAL');
  assert.equal(pendingApply.valid, true);

  const missingApproval = validateJobTransition('REQUIRES_APPLY_APPROVAL', 'APPLY_APPROVED');
  assert.equal(missingApproval.valid, false);
  assert.equal(missingApproval.reasonCode, 'HUMAN_GATE_REQUIRED');
  assert.equal(missingApproval.requiredHumanGate, 'APPLY');

  const approved = validateJobTransition('REQUIRES_APPLY_APPROVAL', 'APPLY_APPROVED', {
    gate: 'APPLY',
    approved: true,
  });
  assert.equal(approved.valid, true);

  const wrongRoute = validateJobTransition('PAID', 'IN_PROGRESS');
  assert.equal(wrongRoute.valid, false);
  assert.equal(wrongRoute.reasonCode, 'TRANSITION_NOT_ALLOWED');

  const contract = validateOpportunityTransition('WON_PENDING_CONTRACT', 'ACTIVE');
  assert.equal(contract.valid, false);
  assert.equal(contract.requiredHumanGate, 'CONTRACT');

  const wip = getWipStatus(['IN_PROGRESS', 'IN_PROGRESS', 'BLOCKED_INTERNAL', 'IN_PROGRESS'], 3);
  assert.equal(wip.activeCount, 3);
  assert.equal(wip.withinLimit, true);
  assert.equal(wip.canStart, false);
  assert.equal(canStartInProgress(['IN_PROGRESS', 'IN_PROGRESS', 'IN_PROGRESS'], 3), false);
});
