import type { OpportunityRecord, ProposalRecord } from './app-types';
import { newId, nowIso } from './ids';

export function buildProposalDraft(opportunity: OpportunityRecord): ProposalRecord {
  const budget = opportunity.budgetMax ?? opportunity.budgetMin;
  const minimum = budget === null ? null : Math.round(budget * 0.8);
  const included = opportunity.deliverables.length
    ? opportunity.deliverables
    : ['Implement the explicitly described technical change'];
  const questions = opportunity.missingInformation.filter((item) =>
    ['budget', 'deadline', 'acceptance criteria', 'source URL'].includes(item),
  );
  const assumptions = [
    'Access, reproduction steps, and test data will be provided before implementation.',
    'The proposal covers only the normalized scope and listed acceptance criteria.',
    'No external credentials or production changes are included without an approved access plan.',
  ];
  const body = [
    `Hi, I can help with ${opportunity.title.toLowerCase()}.`,
    '',
    `My understanding: ${opportunity.normalizedSummary || opportunity.originalDescription}`,
    '',
    'Proposed approach:',
    ...included.map((item, index) => `${index + 1}. ${item}`),
    '',
    'I will verify the result against the recorded acceptance criteria and provide reproducible setup/test notes.',
    '',
    `Assumptions: ${assumptions.join(' ')}`,
    questions.length ? `Clarifying questions before commitment: ${questions.join(', ')}.` : '',
    '',
    'This draft contains no unverified portfolio, credential, client, or experience claims. Final price and deadline require owner approval.',
  ]
    .filter(Boolean)
    .join('\n');
  return {
    id: newId(),
    opportunityId: opportunity.id,
    version: 1,
    opening: `Hi, I can help with ${opportunity.title.toLowerCase()}.`,
    requirementInterpretation: opportunity.normalizedSummary || opportunity.originalDescription,
    implementationPlan: included.map((item, index) => `${index + 1}. ${item}`).join('\n'),
    proofPoints: [],
    assumptions,
    questions,
    recommendedBid: budget,
    minimumBid: minimum,
    currency: opportunity.currency || 'USD',
    timelineRecommendation: opportunity.explicitDeadline
      ? `Before ${opportunity.explicitDeadline} only if access and scope are confirmed.`
      : 'Confirm a deadline after reproduction and scope review.',
    scopeIncluded: included,
    scopeExcluded: [
      'Unlisted features or integrations',
      'Ongoing support without a separate agreement',
      'External spending and unapproved production changes',
    ],
    body,
    status: 'DRAFT',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}
