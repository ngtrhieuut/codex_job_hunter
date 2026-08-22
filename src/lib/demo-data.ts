import type { RawOpportunityRecord } from '@/src/domain/types';

export function demoOpportunities(): RawOpportunityRecord[] {
  const core: RawOpportunityRecord[] = [
    {
      source: 'manual',
      externalId: 'demo-python-001',
      title: 'Fix Python CSV import and add regression tests',
      description:
        'Reproduce a CSV import bug, correct the parser, and add automated tests with clear expected output.',
      sourceUrl: 'https://example.com/demo/python-csv',
      budgetMin: 180,
      budgetMax: 300,
      currency: 'USD',
      category: 'python_bugfix',
      technologies: ['Python', 'CSV', 'pytest'],
      acceptanceCriteria: ['CSV with quoted commas imports correctly', 'Regression tests pass'],
    },
    {
      source: 'manual',
      externalId: 'demo-next-002',
      title: 'Next.js dashboard API integration',
      description:
        'Connect an existing Next.js dashboard to a documented REST API, handle loading and error states, and document local setup.',
      sourceUrl: 'https://example.com/demo/next-dashboard',
      budgetMin: 350,
      budgetMax: 650,
      currency: 'USD',
      category: 'api_integration',
      technologies: ['Next.js', 'TypeScript', 'REST API'],
      acceptanceCriteria: [
        'Data renders from the documented endpoint',
        'Error state is visible',
        'Setup instructions are included',
      ],
    },
    {
      source: 'manual',
      externalId: 'demo-excel-003',
      title: 'Excel report automation',
      description:
        'Transform a monthly workbook into a repeatable report with validated columns and a documented run command.',
      sourceUrl: 'https://example.com/demo/excel',
      budgetMin: 220,
      budgetMax: 420,
      currency: 'USD',
      category: 'csv_excel',
      technologies: ['Excel', 'Python', 'automation'],
      acceptanceCriteria: ['Output workbook matches the sample', 'Invalid rows are reported'],
    },
    {
      source: 'github',
      externalId: 'demo-owner/repo#12',
      title: 'Add tests for an API edge case',
      description:
        'Open issue with a reproducible failing case and expected behavior. The repository includes a test runner and contribution guide.',
      sourceUrl: 'https://github.com/demo-owner/repo/issues/12',
      budgetMin: 100,
      budgetMax: 250,
      currency: 'USD',
      category: 'testing',
      technologies: ['TypeScript', 'GitHub'],
      metadata: { repository: 'demo-owner/repo', bountyEvidence: true },
    },
    {
      source: 'manual',
      externalId: 'demo-deploy-005',
      title: 'Docker and CI build fix',
      description:
        'Fix a reproducible container build failure, keep the existing deployment contract, and add a CI check.',
      sourceUrl: 'https://example.com/demo/docker',
      budgetMin: 280,
      budgetMax: 550,
      currency: 'USD',
      category: 'docker',
      technologies: ['Docker', 'CI/CD', 'Linux'],
      acceptanceCriteria: ['Image builds in CI', 'Existing test command passes'],
    },
    {
      source: 'manual',
      externalId: 'demo-low-006',
      title: 'Tiny urgent change',
      description: 'Make a small change today.',
      sourceUrl: 'https://example.com/demo/low',
      budgetMin: 15,
      budgetMax: 20,
      currency: 'USD',
      category: 'other',
    },
    {
      source: 'manual',
      externalId: 'demo-scam-007',
      title: 'Guaranteed income data entry',
      description:
        'Pay a registration fee and send a crypto deposit to unlock guaranteed income. No technical scope is provided.',
      sourceUrl: 'https://example.com/demo/scam',
      budgetMin: 5000,
      budgetMax: 5000,
      currency: 'USD',
    },
    {
      source: 'manual',
      externalId: 'demo-malware-008',
      title: 'Bypass account security',
      description:
        'Build a credential stealer to bypass account security and access another user account.',
      sourceUrl: 'https://example.com/demo/unsafe',
      budgetMin: 1000,
      budgetMax: 2000,
      currency: 'USD',
      category: 'security_review',
    },
    {
      source: 'manual',
      externalId: 'demo-reusable-009',
      title: 'Telegram order notification bot',
      description:
        'Build a small Telegram bot that consumes a documented webhook and sends order notifications with retry handling.',
      sourceUrl: 'https://example.com/demo/bot',
      budgetMin: 300,
      budgetMax: 700,
      currency: 'USD',
      category: 'bot',
      technologies: ['Telegram', 'Node.js', 'webhook'],
      acceptanceCriteria: ['Retries transient failures', 'No secrets are committed'],
    },
    {
      source: 'manual',
      externalId: 'demo-research-010',
      title: 'Data cleanup and validation script',
      description:
        'Clean a supplied CSV export, validate required columns, and produce an error report plus a normalized output.',
      sourceUrl: 'https://example.com/demo/data',
      budgetMin: 160,
      budgetMax: 320,
      currency: 'USD',
      category: 'data_processing',
      technologies: ['Python', 'CSV'],
      acceptanceCriteria: ['Invalid rows are isolated', 'Output schema is documented'],
    },
  ];
  const duplicates = Array.from({ length: 90 }, (_, index) => ({
    ...core[0],
    externalId: `demo-python-001`,
    metadata: { duplicateSeedRow: index + 11 },
  }));
  return [...core, ...duplicates];
}
