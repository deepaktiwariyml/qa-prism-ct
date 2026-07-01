import type { Correlation, Finding, PillarScore } from '@qa-prism/core';

/** Base URL of the QA Prism API gateway. Public so the browser can poll it. */
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface RecentScan {
  id: string;
  status: string;
  createdAt: string;
  target: { name: string; value: string; kind: string };
  score: { overall: number } | null;
}

export interface ScanDetail {
  id: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  target: { name: string; value: string; kind: string };
  findings: Finding[];
  score: {
    overall: number;
    pillars: PillarScore[];
    correlations: Correlation[];
    computedAt: string;
  } | null;
}

export async function fetchRecentScans(): Promise<RecentScan[]> {
  const res = await fetch(`${API_BASE}/scans`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`API responded ${res.status}`);
  return res.json() as Promise<RecentScan[]>;
}

export async function fetchScan(id: string): Promise<ScanDetail | null> {
  const res = await fetch(`${API_BASE}/scans/${id}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API responded ${res.status}`);
  return res.json() as Promise<ScanDetail>;
}
