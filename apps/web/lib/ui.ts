import type { Severity } from '@qa-prism/core';

/** Chart fill per severity. */
export const SEVERITY_COLOR: Record<Severity, string> = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#d97706',
  low: '#2563eb',
  info: '#64748b',
};

/** Tailwind classes for a severity badge. */
export const SEVERITY_BADGE: Record<Severity, string> = {
  critical: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-blue-100 text-blue-800',
  info: 'bg-slate-100 text-slate-600',
};

export function scoreTextClass(score: number): string {
  if (score >= 90) return 'text-green-600';
  if (score >= 70) return 'text-amber-600';
  return 'text-red-600';
}

export function statusBadge(status: string): string {
  if (status === 'done') return 'bg-green-100 text-green-800';
  if (status === 'failed') return 'bg-red-100 text-red-800';
  if (status === 'running') return 'bg-blue-100 text-blue-800';
  return 'bg-slate-100 text-slate-600';
}
