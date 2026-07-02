'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PILLARS, SEVERITY_RANK, type Finding, type Pillar } from '@qa-prism/core';
import type { ScanDetail } from '@/lib/api';
import { SEVERITY_BADGE, scoreTextClass, statusBadge } from '@/lib/ui';
import { PillarRadar } from './PillarRadar';
import { SeverityBar } from './SeverityBar';

const PILLAR_LABEL: Record<Pillar, string> = {
  automation: 'Automation',
  accessibility: 'Accessibility',
  security: 'Security',
  performance: 'Performance',
};

export function ScanDetailView({ initial }: { initial: ScanDetail }) {
  const [scan, setScan] = useState<ScanDetail>(initial);
  const settled = scan.status === 'done' || scan.status === 'failed';

  useEffect(() => {
    if (settled) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/scans/${scan.id}`, { cache: 'no-store' });
        if (res.ok) {
          const next = (await res.json()) as ScanDetail;
          setScan(next);
        }
      } catch {
        // transient; keep polling
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [settled, scan.id]);

  const score = scan.score;
  const findings = [...scan.findings].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{scan.target.name || scan.target.value}</h1>
          <p className="text-sm text-slate-500">{scan.target.value}</p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${statusBadge(scan.status)}`}
          >
            {scan.status === 'running' || scan.status === 'queued' ? 'scanning…' : scan.status}
          </span>
          <Link
            href="/"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
          >
            New scan
          </Link>
        </div>
      </div>

      {!settled && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Scan in progress — this page updates automatically as scanners report in.
        </div>
      )}

      {score && (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-5">
            <span className="text-xs uppercase tracking-wide text-slate-500">Overall</span>
            <span className={`text-5xl font-semibold ${scoreTextClass(score.overall)}`}>
              {score.overall}
            </span>
            <span className="text-xs text-slate-400">/ 100</span>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3 md:col-span-1">
            <PillarRadar pillars={score.pillars} />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <SeverityBar findings={scan.findings} />
          </div>
        </div>
      )}

      {score && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map((pillar) => {
            const p = score.pillars.find((x) => x.pillar === pillar);
            const count = scan.findings.filter((f) => f.pillar === pillar).length;
            return (
              <div key={pillar} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  {PILLAR_LABEL[pillar]}
                </div>
                <div className={`text-3xl font-semibold ${scoreTextClass(p?.score ?? 100)}`}>
                  {p?.score ?? '—'}
                </div>
                <div className="text-xs text-slate-400">{count} finding(s)</div>
              </div>
            );
          })}
        </div>
      )}

      {score && score.correlations.length > 0 && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
          <h2 className="mb-2 text-sm font-semibold text-indigo-900">
            Cross-pillar correlations ({score.correlations.length})
          </h2>
          <ul className="flex flex-col gap-2">
            {score.correlations.map((c) => (
              <li key={c.id} className="text-sm text-indigo-900">
                <span
                  className={`mr-2 rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_BADGE[c.severity]}`}
                >
                  {c.severity}
                </span>
                <span className="font-medium">{c.pillars.join(' + ')}</span> — {c.rationale}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Findings ({findings.length})</h2>
          <div className="flex gap-2">
            <button
              disabled
              title="Coming in Phase 8"
              className="cursor-not-allowed rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-400"
            >
              Create tickets
            </button>
            <button
              disabled
              title="Coming later"
              className="cursor-not-allowed rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-400"
            >
              Export report
            </button>
          </div>
        </div>
        {findings.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            {settled ? 'No findings.' : 'Waiting for scanners…'}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {findings.map((f) => (
              <FindingRow key={f.id} finding={f} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FindingRow({ finding }: { finding: Finding }) {
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_BADGE[finding.severity]}`}
        >
          {finding.severity}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{finding.title}</div>
          <div className="text-xs text-slate-500">
            {finding.pillar} · {finding.code}
            {finding.location?.path ? ` · ${finding.location.path}` : ''}
            {finding.location?.selector ? ` · ${finding.location.selector}` : ''}
          </div>
          {finding.remediation && (
            <div className="mt-1 text-sm text-slate-600">Fix: {finding.remediation}</div>
          )}
        </div>
      </div>
    </li>
  );
}
