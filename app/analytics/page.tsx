import Link from 'next/link';
import { getStore } from '@/src/lib/store';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const store = getStore();
  const metrics = await store.metrics();
  const opportunities = await store.listOpportunities();
  const bySource = new Map<string, { count: number; scored: number; expected: number }>();
  const byCategory = new Map<string, { count: number; scored: number; expected: number }>();
  for (const opportunity of opportunities) {
    for (const [key, map] of [
      ['source', bySource],
      ['category', byCategory],
    ] as const) {
      const label = key === 'source' ? opportunity.source : opportunity.category;
      const current = map.get(label) || { count: 0, scored: 0, expected: 0 };
      current.count += 1;
      current.scored += opportunity.latestScore ? 1 : 0;
      current.expected += opportunity.latestScore?.expectedNetRevenue || 0;
      map.set(label, current);
    }
  }
  const metric = (key: string) => Number(metrics[key] || 0);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Experiment analytics</h1>
          <p>Track selection quality and economic signals before scaling application volume.</p>
        </div>
        <Link className="button secondary" href="/">
          Dashboard
        </Link>
      </div>
      <div className="grid stats">
        <div className="stat">
          <div className="stat-label">Hard rejected</div>
          <div className="stat-value">{metric('hardRejected')}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Application win rate</div>
          <div className="stat-value">{(metric('applicationWinRate') * 100).toFixed(0)}%</div>
        </div>
        <div className="stat">
          <div className="stat-label">Accepted delivery</div>
          <div className="stat-value">{(metric('acceptedDeliveryRate') * 100).toFixed(0)}%</div>
        </div>
        <div className="stat">
          <div className="stat-label">Expected pipeline</div>
          <div className="stat-value">${metric('expectedPipelineRevenueUsd').toFixed(0)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Recorded revenue</div>
          <div className="stat-value">${metric('grossRevenueUsd').toFixed(0)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Estimated tokens</div>
          <div className="stat-value">{metric('estimatedTokens').toLocaleString()}</div>
        </div>
      </div>
      <div className="grid two">
        <section className="panel">
          <h2>By source</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Records</th>
                  <th>Scored</th>
                  <th>Expected value</th>
                </tr>
              </thead>
              <tbody>
                {[...bySource.entries()].map(([source, data]) => (
                  <tr key={source}>
                    <td>{source}</td>
                    <td>{data.count}</td>
                    <td>{data.scored}</td>
                    <td>${data.expected.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel">
          <h2>By category</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Records</th>
                  <th>Scored</th>
                  <th>Expected value</th>
                </tr>
              </thead>
              <tbody>
                {[...byCategory.entries()].map(([category, data]) => (
                  <tr key={category}>
                    <td>{category}</td>
                    <td>{data.count}</td>
                    <td>{data.scored}</td>
                    <td>${data.expected.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <section className="panel" style={{ marginTop: 18 }}>
        <div className="callout warning">
          <strong>Interpretation:</strong> these are decision-support estimates until actual bids,
          wins, payment fees, tokens, human minutes, revisions, and acceptance outcomes are
          recorded. Do not treat expected pipeline value as revenue.
        </div>
      </section>
    </>
  );
}
