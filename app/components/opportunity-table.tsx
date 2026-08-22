import Link from 'next/link';
import type { OpportunityRecord } from '@/src/lib/app-types';
import { Score, StatusBadge } from './badges';

export function OpportunityTable({ opportunities }: { opportunities: OpportunityRecord[] }) {
  if (!opportunities.length)
    return (
      <p className="empty">
        Chưa có opportunity. Hãy thêm thủ công, import CSV/JSON hoặc chạy GitHub discovery.
      </p>
    );
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Opportunity</th>
            <th>Score</th>
            <th>Value</th>
            <th>Completion</th>
            <th>Source</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {opportunities.map((opportunity) => (
            <tr key={opportunity.id}>
              <td className="title-cell">
                <Link href={`/opportunities/${opportunity.id}`}>{opportunity.title}</Link>
                <div className="muted small">
                  {opportunity.category} ·{' '}
                  {opportunity.technologies.slice(0, 3).join(', ') || 'technology unknown'}
                </div>
              </td>
              <td>
                <Score value={opportunity.latestScore?.overallScore || 0} />
              </td>
              <td>
                {opportunity.latestScore
                  ? `$${opportunity.latestScore.expectedNetRevenue.toFixed(0)}`
                  : '—'}
                <div className="muted small">
                  budget {opportunity.budgetMax ? `$${opportunity.budgetMax}` : 'unknown'}
                </div>
              </td>
              <td>
                {opportunity.latestScore
                  ? `${Math.round(opportunity.latestScore.completionProbability * 100)}%`
                  : '—'}
              </td>
              <td>
                <span className="badge">{opportunity.source}</span>
              </td>
              <td>
                <StatusBadge value={opportunity.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
