import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RiskBadge, Score, StatusBadge } from '../../components/badges';
import { getStore } from '@/src/lib/store';

export const dynamic = 'force-dynamic';

function actionButton(id: string, action: string, label: string, className = '') {
  return (
    <form
      action={`/api/opportunities/${id}/action`}
      method="post"
      style={{ display: 'inline-flex' }}
    >
      <input type="hidden" name="action" value={action} />
      <button className={className}>{label}</button>
    </form>
  );
}

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const store = getStore();
  const opportunity = await store.getOpportunity(id);
  if (!opportunity) notFound();
  const job = (await store.listJobs()).find((item) => item.opportunityId === id);
  const proposal = await store.getProposal(id);
  const pending = (await store.listPendingApprovals()).filter(
    (approval) => approval.opportunityId === id,
  );
  const score = opportunity.latestScore;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="small muted">
            <Link href="/opportunities">← Opportunity inbox</Link>
          </div>
          <h1>{opportunity.title}</h1>
          <p>
            {opportunity.source} · discovered {new Date(opportunity.discoveredAt).toLocaleString()}
          </p>
        </div>
        <div className="actions">
          {opportunity.sourceUrl && (
            <a
              className="button secondary"
              href={opportunity.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open source ↗
            </a>
          )}
        </div>
      </div>
      <div className="detail-grid">
        <div className="stack">
          <section className="panel">
            <div className="panel-header">
              <h2>Decision summary</h2>
              <StatusBadge value={opportunity.status} />
            </div>
            <dl className="kv">
              <dt>Score</dt>
              <dd>
                {score ? (
                  <>
                    <Score value={score.overallScore} /> · {score.explanation[0]}
                  </>
                ) : (
                  'Hard filtered / not scored'
                )}
              </dd>
              <dt>Expected net value</dt>
              <dd>{score ? `$${score.expectedNetRevenue.toFixed(2)}` : '—'}</dd>
              <dt>Completion probability</dt>
              <dd>{score ? `${Math.round(score.completionProbability * 100)}%` : '—'}</dd>
              <dt>Budget</dt>
              <dd>
                {opportunity.budgetMin !== null || opportunity.budgetMax !== null
                  ? `${opportunity.currency || 'USD'} ${opportunity.budgetMin ?? '?'}–${opportunity.budgetMax ?? '?'}`
                  : 'Unknown'}
              </dd>
              <dt>Deadline</dt>
              <dd>{opportunity.explicitDeadline || 'Unknown'}</dd>
              <dt>Category</dt>
              <dd>{opportunity.category}</dd>
              <dt>Managed workspace</dt>
              <dd>
                {job ? (
                  <Link href={`/jobs/${job.id}`} className="code">
                    {job.jobCode}
                  </Link>
                ) : (
                  'Not created'
                )}
              </dd>
            </dl>
            {opportunity.hardFilterReason && (
              <div className="callout danger" style={{ marginTop: 16 }}>
                <strong>Hard-filter result:</strong> {opportunity.hardFilterReason}
              </div>
            )}
          </section>
          <section className="panel">
            <h2>Normalized request</h2>
            <p>
              {opportunity.normalizedSummary ||
                opportunity.originalDescription ||
                'No description.'}
            </p>
            <h3>Original source text</h3>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                fontFamily: 'inherit',
                fontSize: 13,
                color: '#475569',
              }}
            >
              {opportunity.originalDescription || 'No description.'}
            </pre>
            <h3>Technologies</h3>
            <div className="chips">
              {opportunity.technologies.length ? (
                opportunity.technologies.map((technology) => (
                  <span className="chip" key={technology}>
                    {technology}
                  </span>
                ))
              ) : (
                <span className="muted small">Unknown</span>
              )}
            </div>
            <h3 style={{ marginTop: 18 }}>Inferred acceptance criteria</h3>
            <ul>
              {opportunity.inferredAcceptanceCriteria.length ? (
                opportunity.inferredAcceptanceCriteria.map((criterion) => (
                  <li key={criterion}>{criterion}</li>
                ))
              ) : (
                <li className="muted">No objective criteria inferred; risk is higher.</li>
              )}
            </ul>
            <h3>Missing information</h3>
            <div className="chips">
              {opportunity.missingInformation.length ? (
                opportunity.missingInformation.map((item) => (
                  <span className="chip" key={item}>
                    {item}
                  </span>
                ))
              ) : (
                <span className="badge good">No obvious gaps</span>
              )}
            </div>
          </section>
          <section className="panel">
            <div className="panel-header">
              <h2>Score explanation</h2>
              <span className="code">score_v1</span>
            </div>
            {score ? (
              <>
                <div className="score-breakdown">
                  {Object.entries(score.components).map(([key, value]) => (
                    <div className="score-row" key={key}>
                      <div>
                        <div>{key.replaceAll('_', ' ')}</div>
                        <div className="meter">
                          <span style={{ width: `${value}%` }} />
                        </div>
                      </div>
                      <strong>{value.toFixed(0)}</strong>
                    </div>
                  ))}
                </div>
                <p className="small muted" style={{ marginBottom: 0 }}>
                  {score.explanation[1]}
                </p>
              </>
            ) : (
              <p className="empty">No score snapshot because this opportunity was hard-filtered.</p>
            )}
          </section>
          {proposal && (
            <section className="panel">
              <div className="panel-header">
                <h2>Proposal draft</h2>
                <span className="badge blue">DRAFT · v{proposal.version}</span>
              </div>
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 14 }}>
                {proposal.body}
              </pre>
              <div className="callout warning">
                Recommended bid:{' '}
                {proposal.recommendedBid === null
                  ? 'unknown'
                  : `${proposal.currency} ${proposal.recommendedBid}`}{' '}
                · floor:{' '}
                {proposal.minimumBid === null
                  ? 'unknown'
                  : `${proposal.currency} ${proposal.minimumBid}`}
                . Price Gate is still required.
              </div>
            </section>
          )}
        </div>
        <aside className="stack">
          <section className="panel">
            <h2>Next actions</h2>
            <div className="actions">
              {opportunity.status === 'SCORED' && actionButton(id, 'shortlist', 'Shortlist')}{' '}
              {['SCORED', 'SHORTLISTED'].includes(opportunity.status) &&
                actionButton(id, 'reject', 'Reject', 'danger')}{' '}
              {['SCORED', 'SHORTLISTED'].includes(opportunity.status) &&
                actionButton(id, 'request_apply', 'Request Apply Gate', 'warning')}{' '}
              {opportunity.status === 'APPROVED_TO_APPLY' &&
                actionButton(id, 'record_application', 'Record manual application')}{' '}
              {opportunity.status === 'APPLIED' && (
                <>
                  {actionButton(id, 'won', 'Record won signal', 'warning')}
                  {actionButton(id, 'lost', 'Record lost', 'danger')}
                </>
              )}{' '}
              {!proposal && (
                <form action={`/api/opportunities/${id}/proposal`} method="post">
                  <button className="secondary">Create truthful proposal draft</button>
                </form>
              )}
            </div>
            <p className="small muted">
              All buttons change internal state only. Application, price, contract, client message,
              spend, and delivery remain gated.
            </p>
          </section>
          <section className="panel">
            <h2>Risk flags</h2>
            {score?.riskFlags.length ? (
              <ul>
                {score.riskFlags.map((flag) => (
                  <li key={flag}>
                    <RiskBadge value="HIGH" /> {flag.replaceAll('_', ' ')}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty">No score risk flags.</p>
            )}
            {score?.assumptions.length ? (
              <>
                <h3>Assumptions</h3>
                <ul>
                  {score.assumptions.map((assumption) => (
                    <li key={assumption} className="small">
                      {assumption}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>
          {pending.length ? (
            <section className="panel">
              <h2>Pending approval</h2>
              {pending.map((approval) => (
                <div key={approval.id} className="callout warning">
                  <strong>{approval.approvalType}</strong>
                  <p className="small">
                    {String(approval.requestedPayload.summary || 'Decision requested')}
                  </p>
                  <form
                    action={`/api/approvals/${approval.id}`}
                    method="post"
                    className="form-actions"
                  >
                    <input type="text" name="note" placeholder="Decision note" />
                    <button name="decision" value="REJECTED" className="danger">
                      Reject
                    </button>
                    <button name="decision" value="APPROVED">
                      Approve
                    </button>
                  </form>
                </div>
              ))}
            </section>
          ) : null}
          {job && (
            <section className="panel">
              <h2>Job workspace</h2>
              <p>
                <Link href={`/jobs/${job.id}`} className="code">
                  {job.jobCode}
                </Link>
              </p>
              <p className="small muted">
                State: {job.status}
                <br />
                Next: {job.nextAction}
              </p>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
