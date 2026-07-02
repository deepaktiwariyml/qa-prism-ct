'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { RecentScan } from '@/lib/api';
import { scoreTextClass, statusBadge } from '@/lib/ui';
import { fmtDateTime, relativeTime } from '@/lib/format';

export function RecentScans({ scans: initial }: { scans: RecentScan[] }) {
  const [scans, setScans] = useState<RecentScan[]>(initial);
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  async function remove(scan: RecentScan) {
    const label = scan.target.name || scan.target.value;
    if (!window.confirm(`Remove the scan for "${label}"? This also deletes its findings and score.`)) {
      return;
    }
    const id = scan.id;
    setError(null);
    setRemoving((s) => new Set(s).add(id));
    try {
      const res = await fetch(`/api/scans/${id}`, { method: 'DELETE' });
      if (res.ok || res.status === 404) {
        setScans((list) => list.filter((s) => s.id !== id));
      } else {
        setError(`Could not remove scan (API ${res.status}).`);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setRemoving((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  }

  if (scans.length === 0) {
    return (
      <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        No scans yet — run one above.
      </p>
    );
  }

  const q = query.trim().toLowerCase();
  const filtered = q
    ? scans.filter((s) =>
        `${s.target.name} ${s.target.value} ${s.status}`.toLowerCase().includes(q),
      )
    : scans;

  return (
    <div>
      <div className="relative mb-3">
        <svg viewBox="0 0 24 24" fill="none" className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
          <path d="m20 20-3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search scans by URL, name, or status…"
          className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500"
        />
      </div>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {filtered.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
          No scans match “{query}”.
        </p>
      ) : (
      <ul className="flex flex-col gap-2">
        {filtered.map((s) => (
          <li
            key={s.id}
            className="flex items-center rounded-xl border border-slate-200 bg-white transition hover:border-indigo-300 hover:shadow-sm"
          >
            <Link
              href={`/scans/${s.id}`}
              className="flex min-w-0 flex-1 items-center justify-between p-4"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{s.target.name || s.target.value}</div>
                <div className="truncate text-xs text-slate-500">{s.target.value}</div>
                <div className="mt-0.5 text-xs text-slate-400" suppressHydrationWarning title={fmtDateTime(s.createdAt)}>
                  {relativeTime(s.createdAt)} · {fmtDateTime(s.createdAt)}
                </div>
              </div>
              <div className="flex items-center gap-4">
                {s.score ? (
                  <span className={`text-lg font-semibold ${scoreTextClass(s.score.overall)}`}>
                    {s.score.overall}
                  </span>
                ) : (
                  <span className="text-sm text-slate-400">—</span>
                )}
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge(s.status)}`}
                >
                  {s.status}
                </span>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => remove(s)}
              disabled={removing.has(s.id)}
              aria-label="Remove scan"
              title="Remove scan"
              className="mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
                <path
                  d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0h10l-1 13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 7"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </li>
        ))}
      </ul>
      )}
    </div>
  );
}
