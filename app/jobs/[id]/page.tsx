import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RiskBadge, Score, StatusBadge } from '../../components/badges';
import { getStore } from '@/src/lib/store';
import { detectStateConflict } from '@/src/lib/job-workspace';

export const dynamic = 'force-dynamic';

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getStore();
  const job = await store.getJob(id);
  if (!job) notFound();
  const opportunity = await store.getOpportunity(job.opportunityId);
  if (!opportunity) notFound();
  const conflict = await detectStateConflict(job);
  const pending = (await store.listPendingApprovals()).filter(
    (approval) => approval.jobId === job.id,
  );
  const form = (action: string, label: string, className = '', extra?: React.ReactNode) => (
    <form
      action={`/api/jobs/${job.id}/action`}
      method="post"
      style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}
    >
      <input type="hidden" name="action" value={action} />
      {extra}
      <button className={className}>{label}</button>
    </form>
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="small muted">
            <Link href="/jobs">← Managed jobs</Link> ·{' '}
            <Link href={`/opportunities/${opportunity.id}`}>Opportunity</Link>
          </div>
          <h1>{job.jobCode}</h1>
          <p>{job.title}</p>
        </div>
        <div className="actions">
          <StatusBadge value={job.status} />
          <RiskBadge value={job.risk} />
        </div>
      </div>
      <div className="detail-grid">
        <div className="stack">
          <section className="panel">
            <div className="panel-header">
              <h2>Canonical state</h2>
              <span className="code">{job.jobCode}</span>
            </div>
            <dl className="kv">
              <dt>Status</dt>
              <dd>
                <StatusBadge value={job.status} />
              </dd>
              <dt>Score / value</dt>
              <dd>
                <Score value={job.score} /> · ${job.estimatedValueUsd.toFixed(2)} expected
              </dd>
              <dt>Next action</dt>
              <dd>
                {job.nextAction} <span className="muted small">({job.nextActionOwner})</span>
              </dd>
              <dt>Human gate</dt>
              <dd>{job.humanGate}</dd>
              <dt>Workspace</dt>
              <dd>
                <span className="code">jobs/{job.jobCode}/</span>
              </dd>
              <dt>Source</dt>
              <dd>
                {opportunity.sourceUrl ? (
                  <a href={opportunity.sourceUrl} target="_blank" rel="noreferrer">
                    {opportunity.sourceUrl}
                  </a>
                ) : (
                  'Not provided'
                )}
              </dd>
            </dl>
            {conflict.conflict && (
              <div className="callout danger" style={{ marginTop: 16 }}>
                <strong>STATE_CONFLICT:</strong> database says {job.status}, workspace says{' '}
                {conflict.workspaceStatus}. Resolve the durable file before progressing.
              </div>
            )}
          </section>
          <section className="panel">
            <h2>Acceptance criteria</h2>
            <ul className="list">
              {job.acceptanceCriteria.map((criterion) => (
                <li key={criterion.id}>
                  <strong>{criterion.status}</strong> {criterion.description}
                  <div className="muted small">
                    {criterion.verificationMethod || 'Evidence method pending'}
                    {criterion.evidence ? ` · ${criterion.evidence}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <section className="panel">
            <h2>Task plan</h2>
            <ul className="list">
              {job.tasks.map((task) => (
                <li key={task.id}>
                  <StatusBadge value={task.status} /> <strong>{task.title}</strong>
                  <div className="muted small">
                    {task.agentRole || 'unassigned'} · estimate{' '}
                    {task.estimateMinutes ? `${task.estimateMinutes} min` : 'unknown'}
                  </div>
                </li>
              ))}
            </ul>
          </section>
          {job.latestReview && (
            <section className="panel">
              <div className="panel-header">
                <h2>Independent QA review</h2>
                <StatusBadge value={job.latestReview.verdict} />
              </div>
              <p>{job.latestReview.summary}</p>
              <h3>Tests</h3>
              <ul>
                {job.latestReview.tests.map((test) => (
                  <li key={test}>{test}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <aside className="stack">
          <section className="panel">
            <h2>Safe next actions</h2>
            <div className="actions">
              {job.status === 'PLANNING' && form('start', 'Start IN_PROGRESS')}{' '}
              {['IN_PROGRESS', 'CHANGES_REQUESTED', 'REVISION_REQUESTED'].includes(job.status) &&
                form('ready_review', 'Ready for internal review')}{' '}
              {job.status === 'READY_FOR_INTERNAL_REVIEW' && (
                <>
                  {form(
                    'qa_pass',
                    'QA pass',
                    '',
                    <input name="summary" placeholder="QA summary" />,
                  )}
                  {form(
                    'qa_fail',
                    'QA changes requested',
                    'danger',
                    <input name="summary" placeholder="Finding summary" />,
                  )}
                </>
              )}{' '}
              {job.status === 'READY_FOR_HUMAN_REVIEW' &&
                form('request_delivery', 'Request Delivery Gate', 'warning')}{' '}
              {job.status === 'DELIVERED' && form('accepted', 'Record accepted')}{' '}
              {job.status === 'ACCEPTED' &&
                form(
                  'paid',
                  'Record paid',
                  '',
                  <input
                    name="revenue"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Revenue USD"
                    required
                  />,
                )}
            </div>
            <p className="small muted">
              QA controls record evidence; Delivery Gate remains human approval-gated. No client
              message or external send is issued.
            </p>
          </section>
          {pending.length ? (
            <section className="panel">
              <h2>Pending decisions</h2>
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
                    <input name="note" placeholder="Decision note" />
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
          <section className="panel">
            <h2>Durable evidence</h2>
            <p className="small">Read these files in order when resuming work:</p>
            <ol className="small">
              <li>
                <span className="code">STATE.md</span> — canonical snapshot
              </li>
              <li>
                <span className="code">TASKS.md</span> — execution checklist
              </li>
              <li>
                <span className="code">ACTIVITY.md</span> — append-only checkpoints
              </li>
              <li>
                <span className="code">REVIEW.md</span> — independent QA verdict
              </li>
              <li>
                <span className="code">DELIVERY.md</span> — prepared package, never auto-sent
              </li>
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}
