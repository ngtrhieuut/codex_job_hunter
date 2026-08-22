import type { RawOpportunityRecord } from '@/src/domain/types';
import type { OpportunityProvider, ProviderContext } from './types';

interface GithubSearchIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  repository_url: string;
  created_at: string;
  updated_at: string;
  user?: { login?: string };
  labels?: Array<{ name?: string }>;
  comments?: number;
  state?: string;
}

interface GithubSearchResponse {
  items?: GithubSearchIssue[];
  total_count?: number;
}

function githubHeaders(): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'codex-job-hunter/0.1',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  };
}

function repositoryName(repositoryUrl: string): string {
  const match = repositoryUrl.match(/repos\/([^/]+\/[^/]+)$/);
  return match?.[1] || repositoryUrl;
}

export class GithubIssueProvider implements OpportunityProvider {
  readonly name = 'github';

  constructor(
    private readonly defaultQuery = 'is:issue is:open (bounty OR "good first issue") language:TypeScript',
    private readonly defaultLimit = 25,
  ) {}

  async discover(context: ProviderContext = {}): Promise<RawOpportunityRecord[]> {
    const query = context.query?.trim() || this.defaultQuery;
    const limit = Math.max(1, Math.min(100, context.limit || this.defaultLimit));
    const endpoint = `https://api.github.com/search/issues?q=${encodeURIComponent(query)}&per_page=${limit}&page=1`;
    const response = await fetch(endpoint, { headers: githubHeaders(), signal: context.signal });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `GitHub issue discovery failed (${response.status}): ${detail.slice(0, 500)}`,
      );
    }
    const payload = (await response.json()) as GithubSearchResponse;
    return (payload.items || []).map((issue) => {
      const labels = (issue.labels || []).map((label) => label.name || '').filter(Boolean);
      const repository = repositoryName(issue.repository_url);
      return {
        source: 'github',
        externalId: `${repository}#${issue.number}`,
        sourceUrl: issue.html_url,
        title: issue.title,
        description: issue.body || '',
        postedAt: issue.created_at,
        technologies: labels,
        metadata: {
          githubId: issue.id,
          repository,
          repositoryUrl: issue.repository_url,
          issueNumber: issue.number,
          state: issue.state,
          comments: issue.comments || 0,
          author: issue.user?.login || null,
          labels,
          bountyEvidence: /bounty|reward|paid|sponsor|usd|\$\d+/i.test(
            `${issue.title}\n${issue.body || ''}`,
          ),
          discoveredQuery: query,
        },
      } satisfies RawOpportunityRecord;
    });
  }
}

export function createGithubIssueProvider(query?: string, limit?: number): GithubIssueProvider {
  return new GithubIssueProvider(query, limit);
}
