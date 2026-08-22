import Link from 'next/link';
import { JobTable } from '../components/job-table';
import { StatusBadge } from '../components/badges';
import { getStore } from '@/src/lib/store';

export const dynamic = 'force-dynamic';

export default async function JobsPage() {
  const store = getStore();
  const jobs = await store.listJobs();
  const settings = await store.getSettings();
  const activeCount = jobs.filter((job) => job.status === 'IN_PROGRESS').length;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Managed jobs</h1>
          <p>
            Every shortlisted opportunity has an independent workspace, state snapshot, activity
            log, and review path.
          </p>
        </div>
        <Link className="button secondary" href="/">
          Dashboard
        </Link>
      </div>
      <section className="grid stats">
        <div className="stat">
          <div className="stat-label">Total jobs</div>
          <div className="stat-value">{jobs.length}</div>
        </div>
        <div className="stat">
          <div className="stat-label">In progress</div>
          <div className="stat-value">
            {activeCount} / {settings.maxActiveJobs}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Blocked</div>
          <div className="stat-value">
            {
              jobs.filter(
                (job) => job.status.includes('BLOCKED') || job.status === 'CHANGES_REQUESTED',
              ).length
            }
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Review queue</div>
          <div className="stat-value">
            {
              jobs.filter(
                (job) => job.status.includes('REVIEW') || job.status === 'READY_FOR_HUMAN_REVIEW',
              ).length
            }
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Human gates</div>
          <div className="stat-value">{jobs.filter((job) => job.humanGate !== 'NONE').length}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Closed won</div>
          <div className="stat-value">
            {jobs.filter((job) => job.status === 'CLOSED_WON').length}
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <h2>All isolated workspaces</h2>
          <StatusBadge value={`${activeCount}/${settings.maxActiveJobs} WIP`} />
        </div>
        <JobTable jobs={jobs} />
      </section>
    </>
  );
}
