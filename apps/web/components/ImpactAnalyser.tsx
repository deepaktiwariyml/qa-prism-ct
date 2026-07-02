'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Severity } from '@qa-prism/core';
import { SEVERITY_BADGE } from '@/lib/ui';

interface ImpactArea {
  name: string;
  riskLevel: Severity;
  reason: string;
  suggestedTests: string[];
  relatedFiles: string[];
  relatedFindingIds: string[];
}
interface ImpactResponse {
  prNumber: number;
  repo: string;
  title: string;
  areas: ImpactArea[];
  limitations: string[];
}
interface TestCase {
  id: string;
  area: string;
  priority: Severity;
  test: string;
  relatedFiles: string;
}

const RISK_ORDER: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

/** Flatten areas into numbered, prioritized test cases. */
function toTestCases(areas: ImpactArea[]): TestCase[] {
  const sorted = [...areas].sort((a, b) => RISK_ORDER[b.riskLevel] - RISK_ORDER[a.riskLevel]);
  const out: TestCase[] = [];
  let n = 1;
  for (const area of sorted) {
    for (const test of area.suggestedTests) {
      out.push({
        id: `TC-${String(n).padStart(2, '0')}`,
        area: area.name,
        priority: area.riskLevel,
        test,
        relatedFiles: area.relatedFiles.join('; '),
      });
      n += 1;
    }
  }
  return out;
}

function toCsv(rows: TestCase[]): string {
  const q = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  const header = ['ID', 'Area', 'Priority', 'Test case', 'Related files'].map(q).join(',');
  const lines = rows.map((r) => [r.id, r.area, r.priority, r.test, r.relatedFiles].map(q).join(','));
  return [header, ...lines].join('\r\n');
}

export function ImpactAnalyser() {
  const [prUrl, setPrUrl] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImpactResponse | null>(null);

  async function analyse(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const body: Record<string, unknown> = { prUrl };
      if (token.trim()) body.githubToken = token.trim();
      const res = await fetch('/api/impact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `API ${res.status}`);
      setResult(data as ImpactResponse);
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  }

  const areas = result
    ? [...result.areas].sort((a, b) => RISK_ORDER[b.riskLevel] - RISK_ORDER[a.riskLevel])
    : [];
  const testCases = result ? toTestCases(result.areas) : [];

  function downloadCsv() {
    if (!result) return;
    const blob = new Blob([toCsv(testCases)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `impact-${result.repo.replace(/\W+/g, '-')}-pr${result.prNumber}-testcases.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const riskCounts = areas.reduce<Record<string, number>>((m, a) => {
    m[a.riskLevel] = (m[a.riskLevel] ?? 0) + 1;
    return m;
  }, {});

  return (
    <div>
      <form onSubmit={analyse} className="rounded-2xl border border-slate-200 bg-white p-6">
        <label className="mb-1.5 block text-sm font-medium text-slate-700">GitHub pull request URL</label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="url"
            required
            value={prUrl}
            onChange={(e) => setPrUrl(e.target.value)}
            placeholder="https://github.com/owner/repo/pull/123"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            disabled={busy || !prUrl}
            className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Analysing…' : 'Analyse'}
          </button>
        </div>
        <div className="mt-3">
          <label className="mb-1.5 block text-xs font-medium text-slate-500">
            GitHub token (optional — for private repos / rate limits; used only for this request)
          </label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ghp_…"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </form>

      {busy && (
        <p className="mt-6 text-sm text-slate-500">
          Fetching the diff and asking Claude to reason about impact — this can take a moment…
        </p>
      )}

      {result && (
        <div className="mt-8">
          {/* Summary + actions */}
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="min-w-0">
              <div className="text-xs font-medium uppercase tracking-wide text-violet-600">
                Test plan
              </div>
              <h2 className="mt-1 truncate text-lg font-semibold">{result.title}</h2>
              <p className="text-sm text-slate-500">
                {result.repo} · PR #{result.prNumber}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                  {testCases.length} test case{testCases.length === 1 ? '' : 's'}
                </span>
                <span>across {areas.length} area{areas.length === 1 ? '' : 's'}</span>
                {(['critical', 'high', 'medium', 'low', 'info'] as Severity[])
                  .filter((s) => riskCounts[s])
                  .map((s) => (
                    <span key={s} className={`rounded px-1.5 py-0.5 font-medium ${SEVERITY_BADGE[s]}`}>
                      {riskCounts[s]} {s}
                    </span>
                  ))}
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2">
              <button
                onClick={downloadCsv}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
                  <path d="M12 4v10m0 0 4-4m-4 4-4-4M5 19h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Download test cases
              </button>
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-center text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Go to scan list →
              </Link>
            </div>
          </div>

          {/* Areas as test-case groups */}
          <ul className="flex flex-col gap-3">
            {areas.map((area, i) => {
              // Compute the running TC numbers for this area to keep ids stable.
              const before = areas.slice(0, i).reduce((n, a) => n + a.suggestedTests.length, 0);
              return (
                <li key={i} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${SEVERITY_BADGE[area.riskLevel]}`}>
                      {area.riskLevel}
                    </span>
                    <h3 className="font-medium">{area.name}</h3>
                    {area.relatedFindingIds.length > 0 && (
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-800">
                        {area.relatedFindingIds.length} related finding(s)
                      </span>
                    )}
                  </div>
                  <div className="px-5 py-4">
                    <p className="text-sm text-slate-600">{area.reason}</p>
                    {area.suggestedTests.length > 0 && (
                      <ul className="mt-3 flex flex-col gap-2">
                        {area.suggestedTests.map((t, j) => (
                          <li key={j} className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                            <span className="mt-0.5 font-mono text-xs font-semibold text-violet-600">
                              TC-{String(before + j + 1).padStart(2, '0')}
                            </span>
                            <span className="text-sm text-slate-700">{t}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {area.relatedFiles.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {area.relatedFiles.map((f) => (
                          <span key={f} className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
                            {f}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {result.limitations.length > 0 && (
            <p className="mt-4 text-xs text-slate-500">{result.limitations.join(' ')}</p>
          )}
        </div>
      )}
    </div>
  );
}
