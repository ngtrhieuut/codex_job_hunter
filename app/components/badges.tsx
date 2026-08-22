import type { RiskLevel } from '@/src/lib/app-types';

export function StatusBadge({ value }: { value: string }) {
  const tone =
    value.includes('REQUIRES') || value.includes('BLOCKED') || value.includes('CHANGES')
      ? 'warn'
      : value.includes('REJECT') || value.includes('LOST')
        ? 'bad'
        : value.includes('READY') || value.includes('PAID') || value.includes('ACCEPTED')
          ? 'good'
          : 'blue';
  return <span className={`badge ${tone}`}>{value.replaceAll('_', ' ')}</span>;
}

export function RiskBadge({ value }: { value: RiskLevel | string }) {
  const tone = value === 'LOW' ? 'good' : value === 'MEDIUM' ? 'warn' : 'bad';
  return <span className={`badge ${tone}`}>{value}</span>;
}

export function Score({ value }: { value: number }) {
  const tone = value >= 75 ? 'high' : value >= 50 ? 'mid' : 'low';
  return <span className={`score ${tone}`}>{value.toFixed(1)}</span>;
}
