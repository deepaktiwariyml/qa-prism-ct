'use client';

import { useState } from 'react';
import type { Severity } from '@qa-prism/core';
import { SEVERITY_BADGE } from '@/lib/ui';
import { usePersistentState } from '@/lib/usePersistentState';

interface ImpactArea {
  name: string;
  riskLevel: Severity;
  impact: string;
  impactedFiles: string[];
  userFlows: string[];
  relatedFindingIds: string[];
}
interface ChecklistItem {
  area: string;
  priority: Severity;
  what: string;
  risk: string;
}
interface ImpactAnalysis {
  whatsChanged: { summary: string };
  whatsImpacted: { summary: string; areas: ImpactArea[] };
  testingChecklist: ChecklistItem[];
}
interface TicketRef {
  key: string;
  url: string;
  source: 'jira' | 'linear' | 'other';
}
interface ImpactResponse {
  prNumber: number;
  repo: string;
  title: string;
  tickets?: TicketRef[];
  analysis: ImpactAnalysis;
  changedFiles: string[];
  limitations: string[];
}

const RISK_ORDER: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

function toCsv(rows: ChecklistItem[]): string {
  const q = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  const header = ['#', 'Area', 'Priority', 'What to test', 'Risk'].map(q).join(',');
  const lines = rows.map((r, i) =>
    [String(i + 1), r.area, r.priority, r.what, r.risk].map(q).join(','),
  );
  return [header, ...lines].join('\r\n');
}

/** Numbered section heading — matches the "How it works" step style. */
function SectionHeading({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 text-sm font-semibold text-white">
        {n}
      </span>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </div>
  );
}

export function ImpactAnalyser() {
  const [prUrl, setPrUrl] = usePersistentState('qa-prism:impact:prUrl', '');
  // Token is a secret — never persisted.
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = usePersistentState<ImpactResponse | null>(
    'qa-prism:impact:result',
    null,
  );

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
    ? [...result.analysis.whatsImpacted.areas].sort(
        (a, b) => RISK_ORDER[b.riskLevel] - RISK_ORDER[a.riskLevel],
      )
    : [];
  const checklist = result
    ? [...result.analysis.testingChecklist].sort(
        (a, b) => RISK_ORDER[b.priority] - RISK_ORDER[a.priority],
      )
    : [];

  function downloadCsv() {
    if (!result) return;
    const blob = new Blob([toCsv(checklist)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `impact-${result.repo.replace(/\W+/g, '-')}-pr${result.prNumber}-checklist.csv`;
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
        <div className="mt-8">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5">
            <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
            <div>
              <p className="text-sm font-medium text-slate-700">Analysing the pull request…</p>
              <p className="text-xs text-slate-500">
                Fetching the diff and asking Claude to reason about impact — this can take a moment.
              </p>
            </div>
          </div>
          {/* Skeleton of the three sections while we wait. */}
          <div className="mt-4 space-y-4" aria-hidden="true">
            {[0, 1, 2].map((s) => (
              <div key={s} className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="mb-3 h-4 w-40 animate-pulse rounded bg-slate-200" />
                <div className="space-y-2">
                  <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
                  <div className="h-3 w-11/12 animate-pulse rounded bg-slate-100" />
                  <div className="h-3 w-3/4 animate-pulse rounded bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {result && (
        <div className="mt-8">
          {/* Summary + actions */}
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="min-w-0">
              <div className="text-xs font-medium uppercase tracking-wide text-violet-600">
                Impact analysis
              </div>
              <h2 className="mt-1 truncate text-lg font-semibold">{result.title}</h2>
              <p className="text-sm text-slate-500">
                {result.repo} · PR #{result.prNumber}
              </p>
              {result.tickets && result.tickets.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {result.tickets.map((t) => (
                    <a
                      key={t.key}
                      href={t.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 transition hover:bg-indigo-100"
                    >
                      <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3" aria-hidden="true">
                        <path d="M9 17H7A5 5 0 0 1 7 7h2m6 0h2a5 5 0 0 1 0 10h-2m-7-5h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {t.key}
                    </a>
                  ))}
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                  {result.changedFiles.length} file{result.changedFiles.length === 1 ? '' : 's'} changed
                </span>
                <span>
                  {areas.length} impacted area{areas.length === 1 ? '' : 's'}
                </span>
                <span>
                  {checklist.length} check{checklist.length === 1 ? '' : 's'}
                </span>
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
                Download checklist
              </button>
            </div>
          </div>

          {/* 1 · What's Changed */}
          <section className="mb-8">
            <SectionHeading n={1} title="What's Changed" hint="from a QA's perspective" />
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {result.analysis.whatsChanged.summary}
              </p>
              {result.changedFiles.length > 0 && (
                <div className="mt-4">
                  <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                    Changed files ({result.changedFiles.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {result.changedFiles.map((f) => (
                      <span key={f} className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* 2 · What's Impacted */}
          <section className="mb-8">
            <SectionHeading n={2} title="What's Impacted" hint="blast radius & user flows" />
            {result.analysis.whatsImpacted.summary && (
              <div className="mb-3 rounded-2xl border border-violet-100 bg-violet-50/50 p-5">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                  {result.analysis.whatsImpacted.summary}
                </p>
              </div>
            )}
            <ul className="flex flex-col gap-3">
              {areas.map((area, i) => (
                <li key={i} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${SEVERITY_BADGE[area.riskLevel]}`}>
                      {area.riskLevel}
                    </span>
                    <h3 className="font-medium">{area.name}</h3>
                    {area.relatedFindingIds.length > 0 && (
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-800">
                        {area.relatedFindingIds.length} related finding
                        {area.relatedFindingIds.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                  <div className="px-5 py-4">
                    <p className="text-sm text-slate-600">{area.impact}</p>
                    {area.userFlows.length > 0 && (
                      <div className="mt-3">
                        <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                          User flows
                        </div>
                        <ul className="flex flex-col gap-1.5">
                          {area.userFlows.map((flow, j) => (
                            <li key={j} className="flex items-start gap-2 text-sm text-slate-700">
                              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
                              {flow}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {area.impactedFiles.length > 0 && (
                      <div className="mt-3">
                        <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                          Impacted files
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {area.impactedFiles.map((f) => (
                            <span key={f} className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
                              {f}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* 3 · Testing checklist */}
          <section>
            <SectionHeading n={3} title="Testing checklist" hint="what to test, ranked by risk" />
            <ul className="flex flex-col gap-2">
              {checklist.map((item, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4"
                >
                  <span className="mt-0.5 font-mono text-xs font-semibold text-violet-600">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${SEVERITY_BADGE[item.priority]}`}>
                        {item.priority}
                      </span>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {item.area}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm text-slate-800">{item.what}</p>
                    {item.risk && (
                      <p className="mt-1 text-xs text-slate-500">
                        <span className="font-medium text-slate-600">Risk:</span> {item.risk}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {result.limitations.length > 0 && (
            <p className="mt-6 text-xs text-slate-500">{result.limitations.join(' ')}</p>
          )}
        </div>
      )}
    </div>
  );
}
