import Link from 'next/link';
import { OpportunityTable } from '../components/opportunity-table';
import { getStore } from '@/src/lib/store';

export const dynamic = 'force-dynamic';

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const store = getStore();
  const opportunities = await store.listOpportunities({
    source: typeof params.source === 'string' ? params.source : undefined,
    category: typeof params.category === 'string' ? params.category : undefined,
    status: typeof params.status === 'string' ? params.status : undefined,
    sort:
      typeof params.sort === 'string' &&
      ['score', 'newest', 'budget', 'completion', 'expectedValue'].includes(params.sort)
        ? (params.sort as 'score' | 'newest' | 'budget' | 'completion' | 'expectedValue')
        : 'score',
  });
  const sources = [...new Set(opportunities.map((item) => item.source))].sort();
  const categories = [
    ...new Set(opportunities.map((item) => item.category).filter(Boolean)),
  ].sort();
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Opportunity inbox</h1>
          <p>
            Hard-filtered, normalized and ranked candidates. Every score explains its drivers and
            risks.
          </p>
        </div>
        <div className="actions">
          <Link className="button" href="/opportunities/new">
            + Manual
          </Link>
          <Link className="button secondary" href="/opportunities/import">
            Import
          </Link>
        </div>
      </div>
      <section className="panel">
        <form className="form-grid" method="get">
          <div className="field">
            <label htmlFor="source">Source</label>
            <select
              id="source"
              name="source"
              defaultValue={typeof params.source === 'string' ? params.source : ''}
            >
              <option value="">All sources</option>
              {sources.map((source) => (
                <option key={source}>{source}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="category">Category</label>
            <select
              id="category"
              name="category"
              defaultValue={typeof params.category === 'string' ? params.category : ''}
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="status">Status</label>
            <select
              id="status"
              name="status"
              defaultValue={typeof params.status === 'string' ? params.status : ''}
            >
              <option value="">All statuses</option>
              <option>SCORED</option>
              <option>SHORTLISTED</option>
              <option>REQUIRES_APPLY_APPROVAL</option>
              <option>REJECTED_HARD_FILTER</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="sort">Sort</label>
            <select
              id="sort"
              name="sort"
              defaultValue={typeof params.sort === 'string' ? params.sort : 'score'}
            >
              <option value="score">Score</option>
              <option value="expectedValue">Expected value</option>
              <option value="completion">Completion probability</option>
              <option value="budget">Budget</option>
              <option value="newest">Newest</option>
            </select>
          </div>
          <div className="form-actions field full">
            <button type="submit">Apply filters</button>
            <Link className="button secondary" href="/opportunities">
              Reset
            </Link>
          </div>
        </form>
      </section>
      <section className="panel" style={{ marginTop: 18 }}>
        <OpportunityTable opportunities={opportunities} />
      </section>
    </>
  );
}
