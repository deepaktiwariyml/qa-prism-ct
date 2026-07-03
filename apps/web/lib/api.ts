import type { Correlation, Finding, PillarScore } from '@qa-prism/core';
import { INTERNAL_API } from './proxy';

// Server Components fetch the Fastify API directly (server-to-server). Client
// Components never use this — they call same-origin /api/* BFF routes, which are
// gated by the shared-password middleware.

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
  hasScreenshot?: boolean;
  findings: Finding[];
  score: {
    overall: number;
    pillars: PillarScore[];
    correlations: Correlation[];
    computedAt: string;
  } | null;
}

export async function fetchRecentScans(): Promise<RecentScan[]> {
  const res = await fetch(`${INTERNAL_API}/scans`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`API responded ${res.status}`);
  return res.json() as Promise<RecentScan[]>;
}

export async function fetchScan(id: string): Promise<ScanDetail | null> {
  const res = await fetch(`${INTERNAL_API}/scans/${id}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API responded ${res.status}`);
  return res.json() as Promise<ScanDetail>;
}
