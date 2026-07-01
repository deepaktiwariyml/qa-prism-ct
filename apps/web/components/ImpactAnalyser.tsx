'use client';

import { useState } from 'react';
import type { Severity } from '@qa-prism/core';
import { API_BASE } from '@/lib/api';
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

const RISK_ORDER: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

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
      const res = await fetch(`${API_BASE}/impact`, {
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

  const areas = result ? [...result.areas].sort((a, b) => RISK_ORDER[b.riskLevel] - RISK_ORDER[a.riskLevel]) : [];

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
          <div className="mb-4">
            <h2 className="text-lg font-semibold">{result.title}</h2>
            <p className="text-sm text-slate-500">
              {result.repo} · PR #{result.prNumber} · {areas.length} area(s) to test
            </p>
          </div>

          <ul className="flex flex-col gap-3">
            {areas.map((area, i) => (
              <li key={i} className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_BADGE[area.riskLevel]}`}>
                    {area.riskLevel}
                  </span>
                  <h3 className="font-medium">{area.name}</h3>
                  {area.relatedFindingIds.length > 0 && (
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-800">
                      {area.relatedFindingIds.length} related finding(s)
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-slate-600">{area.reason}</p>
                {area.suggestedTests.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Test these</div>
                    <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
                      {area.suggestedTests.map((t, j) => (
                        <li key={j}>{t}</li>
                      ))}
                    </ul>
                  </div>
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
              </li>
            ))}
          </ul>

          {result.limitations.length > 0 && (
            <p className="mt-4 text-xs text-slate-500">
              {result.limitations.join(' ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
