import Link from 'next/link';
import { JobTable } from './components/job-table';
import { OpportunityTable } from './components/opportunity-table';
import { StatusBadge } from './components/badges';
import { getStore } from '@/src/lib/store';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const store = getStore();
  const [summary, metrics, pendingApprovals] = await Promise.all([
    store.dashboard(),
    store.metrics(),
    store.listPendingApprovals(),
  ]);
  const opportunities = await store.listOpportunities({ sort: 'score' });
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Operating cockpit</h1>
          <p>
            Decision-first view of opportunities, human gates, active work, and durable checkpoints.
          </p>
        </div>
        <div className="actions">
          <Link className="button" href="/opportunities/new">
            + Add opportunity
          </Link>
          <Link className="button secondary" href="/providers/github">
            Discover GitHub
          </Link>
        </div>
      </div>
      <div className="grid stats">
        <div className="stat">
          <div className="stat-label">Discovered</div>
          <div className="stat-value">{metrics.discovered}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Shortlisted</div>
          <div className="stat-value">{metrics.shortlisted}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Applied</div>
          <div className="stat-value">{metrics.applied}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Won / active</div>
          <div className="stat-value">{metrics.won}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Paid</div>
          <div className="stat-value">{metrics.paid}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Gross revenue</div>
          <div className="stat-value">${metrics.grossRevenueUsd.toFixed(0)}</div>
        </div>
      </div>
      <div className="grid two">
        <section className="panel">
          <div className="panel-header">
            <h2>HUMAN ACTION REQUIRED</h2>
            <span className="badge warn">{pendingApprovals.length} pending</span>
          </div>
          {pendingApprovals.length ? (
            <ul className="list">
              {pendingApprovals.map((approval) => (
                <li key={approval.id}>
                  <strong>{approval.approvalType.replaceAll('_', ' ')}</strong>
                  <div className="small">
                    {String(approval.requestedPayload.summary || 'Decision requested')} ·{' '}
                    <Link
                      href={
                        approval.opportunityId
                          ? `/opportunities/${approval.opportunityId}`
                          : approval.jobId
                            ? `/jobs/${approval.jobId}`
                            : '/'
                      }
                    >
                      Open
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">Không có pending human decision.</p>
          )}
        </section>
        <section className="panel">
          <div className="panel-header">
            <h2>System guardrails</h2>
            <span className="badge good">human-gated</span>
          </div>
          <div className="callout">
            Không có autonomous application, client messaging, price commitment, contract
            acceptance, spending hoặc final delivery. WIP limit mặc định: 3 IN_PROGRESS jobs.
          </div>
          <p className="small muted" style={{ marginBottom: 0 }}>
            Các score snapshot là immutable theo version; job state và activity được checkpoint vào
            workspace.
          </p>
        </section>
      </div>
      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel-header">
          <h2>Pipeline / ranked opportunities</h2>
          <Link className="small" href="/opportunities">
            View all →
          </Link>
        </div>
        <OpportunityTable opportunities={opportunities.slice(0, 12)} />
      </section>
      <div className="grid two" style={{ marginTop: 18 }}>
        <section className="panel">
          <div className="panel-header">
            <h2>Active work</h2>
            <StatusBadge value="IN PROGRESS" />
          </div>
          <JobTable jobs={summary.active} />
        </section>
        <section className="panel">
          <div className="panel-header">
            <h2>Ready for review</h2>
            <StatusBadge value="REVIEW" />
          </div>
          <JobTable jobs={summary.readyForReview} />
        </section>
      </div>
      <div className="footer-note">
        Codex Job Hunter · GitHub-backed operational state · local-first MVP
      </div>
    </>
  );
}
