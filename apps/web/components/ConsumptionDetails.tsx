'use client';

import { useEffect, useState } from 'react';
import {
  fmtTokens,
  fmtUsd,
  operationLabel,
  type UsageDay,
  type UsageResponse,
} from '@/lib/usage';

const PAGE_DAYS = 10;
type Totals = UsageResponse['totals'];

const TIPS = [
  'Right-size the model: draft/low-stakes calls (column fill, word lists) use the cheaper Haiku model; keep the pricier Sonnet for quality-critical work like impact analysis.',
  'Be specific in prompts — a tight description yields fewer, better test cases than a vague one you have to regenerate.',
  'Reuse results instead of re-running: generated test cases and impact reports persist in your session, so avoid re-generating the same thing.',
  'Combine or explain only the cases you need — each is a separate billed call.',
  'Trim pasted context to what matters. Input tokens are cheaper than output, but huge diffs and long requirements still add up.',
  'Prefer one comprehensive generation over many small ones — repeated tweaks cost more than a single well-scoped request.',
];

export function ConsumptionDetails() {
  const [days, setDays] = useState<UsageDay[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [openDay, setOpenDay] = useState<string | null>(null);

  async function fetchPage(offset: number): Promise<UsageResponse> {
    const res = await fetch(`/api/usage?offset=${offset}&limit=${PAGE_DAYS}`, { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? `API ${res.status}`);
    return json as UsageResponse;
  }

  // Initial load / refresh — resets to the first page.
  async function load() {
    setLoading(true);
    setError(null);
    try {
      const page = await fetchPage(0);
      setDays(page.days);
      setTotals(page.totals);
      setHasMore(page.hasMore);
      setOpenDay(page.days[0]?.date ?? null); // open the most recent day
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    setLoadingMore(true);
    setError(null);
    try {
      const page = await fetchPage(days.length);
      setDays((prev) => [...prev, ...page.days]);
      setHasMore(page.hasMore);
      setTotals(page.totals); // all-time totals; refresh in case new calls landed
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex flex-wrap gap-3">
          <Stat label="Total spend" value={totals ? fmtUsd(totals.costUsd) : '—'} accent />
          <Stat label="AI calls" value={totals ? fmtTokens(totals.calls) : '—'} />
          <Stat label="Input tokens" value={totals ? fmtTokens(totals.inputTokens) : '—'} />
          <Stat label="Output tokens" value={totals ? fmtTokens(totals.outputTokens) : '—'} />
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-slate-500">Loading consumption…</p>}
      {!loading && days.length === 0 && (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          No AI usage recorded yet. Generate some test cases or analyse a PR, then come back.
        </p>
      )}

      {/* Datewise consumption */}
      <div className="flex flex-col gap-3">
        {days.map((d) => {
          const open = openDay === d.date;
          return (
            <div key={d.date} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <button
                onClick={() => setOpenDay(open ? null : d.date)}
                className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-3 text-left hover:bg-slate-50"
              >
                <div className="flex items-center gap-3">
                  <span className={`text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
                  <span className="font-semibold text-slate-800">{d.date}</span>
                  <span className="text-xs text-slate-500">
                    {fmtTokens(d.calls)} call{d.calls === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{fmtTokens(d.inputTokens)} in</span>
                  <span>{fmtTokens(d.outputTokens)} out</span>
                  <span className="rounded-md bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">
                    {fmtUsd(d.costUsd)}
                  </span>
                </div>
              </button>

              {open && (
                <div className="overflow-x-auto border-t border-slate-100">
                  <table className="w-full min-w-[640px] border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-5 py-2">Operation</th>
                        <th className="px-3 py-2">Model</th>
                        <th className="px-3 py-2 text-right">Calls</th>
                        <th className="px-3 py-2 text-right">Input</th>
                        <th className="px-3 py-2 text-right">Output</th>
                        <th className="px-5 py-2 text-right">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.breakdown.map((b, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="px-5 py-2 font-medium text-slate-700">
                            {operationLabel(b.operation)}
                          </td>
                          <td className="px-3 py-2 text-slate-500">{b.model}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtTokens(b.calls)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtTokens(b.inputTokens)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtTokens(b.outputTokens)}</td>
                          <td className="px-5 py-2 text-right font-semibold tabular-nums text-emerald-700">
                            {fmtUsd(b.costUsd)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {hasMore && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {loadingMore ? 'Loading…' : `Load more (next ${PAGE_DAYS} days)`}
          </button>
        </div>
      )}

      {/* Cost-saving tips */}
      <section className="mt-10">
        <h2 className="text-sm font-medium text-indigo-600">Tips for cost-effective AI calls</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {TIPS.map((tip, i) => (
            <li key={i} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
              <span className="text-lg leading-none">💡</span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-400">
          Costs are estimates from list prices per model and may differ from your actual invoice.
        </p>
      </section>
    </div>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border px-4 py-2.5 ${accent ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold ${accent ? 'text-emerald-700' : 'text-slate-800'}`}>
        {value}
      </div>
    </div>
  );
}
