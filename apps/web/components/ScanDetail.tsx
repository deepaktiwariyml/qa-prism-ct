'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PILLARS, SEVERITIES, SEVERITY_RANK, type Finding, type Pillar, type Severity } from '@qa-prism/core';
import type { ScanDetail } from '@/lib/api';
import { PILLAR_COLOR, PILLAR_LABEL, SEVERITY_BADGE, statusBadge } from '@/lib/ui';
import { duration, fmtDateTime, relativeTime } from '@/lib/format';
import { ScoreGauge, MiniRing } from './ScoreGauge';
import { PillarRadar } from './PillarRadar';
import { SeverityBar } from './SeverityBar';

export function ScanDetailView({ initial }: { initial: ScanDetail }) {
  const [scan, setScan] = useState<ScanDetail>(initial);
  const [query, setQuery] = useState('');
  const [pillarFilter, setPillarFilter] = useState<Pillar | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all');

  const settled = scan.status === 'done' || scan.status === 'failed';

  useEffect(() => {
    if (settled) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/scans/${scan.id}`, { cache: 'no-store' });
        if (res.ok) setScan((await res.json()) as ScanDetail);
      } catch {
        /* transient; keep polling */
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [settled, scan.id]);

  const score = scan.score;
  const countsByPillar = useMemo(() => {
    const m: Record<string, number> = {};
    for (const f of scan.findings) m[f.pillar] = (m[f.pillar] ?? 0) + 1;
    return m;
  }, [scan.findings]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scan.findings
      .filter((f) => {
        if (pillarFilter !== 'all' && f.pillar !== pillarFilter) return false;
        if (severityFilter !== 'all' && f.severity !== severityFilter) return false;
        if (q) {
          const hay = `${f.title} ${f.code} ${f.description} ${f.pillar} ${f.location.path} ${f.location.selector ?? ''} ${f.tags.join(' ')}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  }, [scan.findings, query, pillarFilter, severityFilter]);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-6 p-6">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                {scan.target.kind}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge(scan.status)}`}>
                {scan.status === 'running' || scan.status === 'queued' ? 'scanning…' : scan.status}
              </span>
            </div>
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              {scan.target.name || scan.target.value}
            </h1>
            <p className="mt-0.5 truncate text-sm text-slate-500">{scan.target.value}</p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500" suppressHydrationWarning>
              <span>Ran {relativeTime(scan.startedAt || scan.createdAt)}</span>
              <span>Started {fmtDateTime(scan.startedAt)}</span>
              <span>Finished {fmtDateTime(scan.finishedAt)}</span>
              <span>Duration {duration(scan.startedAt, scan.finishedAt)}</span>
            </div>
          </div>
          <div className="flex items-center gap-6">
            {score ? (
              <ScoreGauge score={score.overall} label="Overall score" />
            ) : (
              <div className="text-sm text-slate-400">scoring…</div>
            )}
            <div className="flex flex-col gap-2">
              <a
                href={`/api/scans/${scan.id}/report`}
                download
                className="rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-1.5 text-center text-sm font-medium text-white transition hover:opacity-90"
              >
                Download report
              </a>
              <Link
                href="/dashboard"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-center text-sm hover:bg-slate-50"
              >
                New scan
              </Link>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-amber-100 bg-amber-50 px-6 py-2.5 text-sm text-amber-800">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0" aria-hidden="true">
            <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
            <path d="M12 8v4l2.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <span>
            This scan is kept for <strong>1 hour</strong>, then automatically deleted. Download the
            report to keep a copy.
          </span>
        </div>
        {!settled && (
          <div className="border-t border-blue-100 bg-blue-50 px-6 py-2.5 text-sm text-blue-800">
            Scan in progress — this page updates automatically as scanners report in.
          </div>
        )}
      </div>

      {/* Pillar cards */}
      {score && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map((pillar) => {
            const p = score.pillars.find((x) => x.pillar === pillar);
            const color = PILLAR_COLOR[pillar];
            return (
              <div key={pillar} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4">
                <MiniRing score={p?.score ?? 100} />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                    {PILLAR_LABEL[pillar]}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">{countsByPillar[pillar] ?? 0} finding(s)</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Charts */}
      {score && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="mb-1 px-2 text-sm font-medium text-slate-600">Pillar radar</h2>
            <PillarRadar pillars={score.pillars} />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="mb-1 px-2 text-sm font-medium text-slate-600">Severity breakdown</h2>
            <SeverityBar findings={scan.findings} />
          </div>
        </div>
      )}

      {/* Correlations */}
      {score && score.correlations.length > 0 && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
          <h2 className="mb-2 text-sm font-semibold text-indigo-900">
            Cross-pillar correlations ({score.correlations.length})
          </h2>
          <ul className="flex flex-col gap-2">
            {score.correlations.map((c) => (
              <li key={c.id} className="text-sm text-indigo-900">
                <span className={`mr-2 rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_BADGE[c.severity]}`}>
                  {c.severity}
                </span>
                <span className="font-medium">{c.pillars.join(' + ')}</span> — {c.rationale}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Findings + search/filter */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">
            Findings <span className="text-slate-400">({filtered.length} of {scan.findings.length})</span>
          </h2>
        </div>

        <div className="mb-3 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <svg viewBox="0 0 24 24" fill="none" className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
                <path d="m20 20-3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search findings — try “accessibility”, “security”, “LCP”, a file…"
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500"
              />
            </div>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as Severity | 'all')}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="all">All severities</option>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={pillarFilter === 'all'} onClick={() => setPillarFilter('all')}>
              All ({scan.findings.length})
            </FilterChip>
            {PILLARS.map((pillar) => (
              <FilterChip
                key={pillar}
                active={pillarFilter === pillar}
                color={PILLAR_COLOR[pillar]}
                onClick={() => setPillarFilter(pillarFilter === pillar ? 'all' : pillar)}
              >
                {PILLAR_LABEL[pillar]} ({countsByPillar[pillar] ?? 0})
              </FilterChip>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            {scan.findings.length === 0
              ? settled
                ? 'No findings.'
                : 'Waiting for scanners…'
              : 'No findings match your search.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {filtered.map((f) => (
              <FindingRow key={f.id} finding={f} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean;
  color?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
        active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
      }`}
    >
      {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
      {children}
    </button>
  );
}

function FindingRow({ finding }: { finding: Finding }) {
  const loc = [finding.location?.path, finding.location?.selector, finding.location?.line ? `line ${finding.location.line}` : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_BADGE[finding.severity]}`}>
          {finding.severity}
        </span>
        <span className="flex items-center gap-1 text-xs text-slate-500">
          <span className="h-2 w-2 rounded-full" style={{ background: PILLAR_COLOR[finding.pillar] }} />
          {PILLAR_LABEL[finding.pillar]}
        </span>
        <span className="font-mono text-xs text-slate-400">{finding.code}</span>
      </div>
      <div className="mt-1.5 font-medium">{finding.title}</div>
      {loc && <div className="mt-0.5 truncate text-xs text-slate-500">{loc}</div>}
      {finding.description && <p className="mt-1.5 text-sm text-slate-600">{finding.description}</p>}
      {finding.remediation && (
        <p className="mt-1.5 text-sm text-slate-700">
          <span className="font-medium text-slate-500">Fix:</span> {finding.remediation}
        </p>
      )}
      {finding.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {finding.tags.map((t) => (
            <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
              {t}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}
