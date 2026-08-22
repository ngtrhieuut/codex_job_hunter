import Link from 'next/link';
import type { JobRecord } from '@/src/lib/app-types';
import { RiskBadge, Score, StatusBadge } from './badges';

export function JobTable({ jobs }: { jobs: JobRecord[] }) {
  if (!jobs.length) return <p className="empty">Chưa có managed job.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Job</th>
            <th>Status</th>
            <th>Score</th>
            <th>Risk</th>
            <th>Next action</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id}>
              <td className="title-cell">
                <Link href={`/jobs/${job.id}`}>{job.jobCode}</Link>
                <div className="muted small">{job.title}</div>
              </td>
              <td>
                <StatusBadge value={job.status} />
              </td>
              <td>
                <Score value={job.score} />
              </td>
              <td>
                <RiskBadge value={job.risk} />
              </td>
              <td>
                {job.nextAction}
                <div className="muted small">owner: {job.nextActionOwner}</div>
              </td>
              <td className="small muted">{new Date(job.updatedAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
