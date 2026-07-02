/* Single-page, self-contained HTML report for a scan (no external assets). */

interface ReportFinding {
  pillar: string;
  severity: string;
  code: string;
  title: string;
  description: string;
  location: unknown;
  remediation: string;
  tags: string[];
}
interface ReportScore {
  overall: number;
  pillars: Array<{ pillar: string; score: number; findingCounts: Record<string, number> }>;
  correlations: Array<{ severity: string; pillars: string[]; rationale: string }>;
}
export interface ReportScan {
  id: string;
  status: string;
  createdAt: Date | string;
  startedAt: Date | string | null;
  finishedAt: Date | string | null;
  target: { name: string; value: string; kind: string };
  findings: ReportFinding[];
  score: ReportScore | null;
}

const SEVERITY_ORDER: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};
const SEVERITY_BG: Record<string, string> = {
  critical: '#fee2e2;color:#991b1b',
  high: '#ffedd5;color:#9a3412',
  medium: '#fef3c7;color:#92400e',
  low: '#dbeafe;color:#1e40af',
  info: '#f1f5f9;color:#475569',
};
const PILLAR_COLOR: Record<string, string> = {
  automation: '#0ea5e9',
  accessibility: '#d946ef',
  security: '#10b981',
  performance: '#f59e0b',
};

function esc(s: unknown): string {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

function scoreColor(score: number): string {
  if (score >= 90) return '#10b981';
  if (score >= 70) return '#f59e0b';
  if (score >= 40) return '#f97316';
  return '#ef4444';
}

function fmt(d: Date | string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
function durationOf(a: Date | string | null, b: Date | string | null): string {
  if (!a || !b) return '—';
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (ms < 0) return '—';
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function gaugeSvg(score: number): string {
  const r = 54;
  const c = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, score)) / 100) * c;
  const col = scoreColor(score);
  return `<svg width="132" height="132" viewBox="0 0 132 132" style="transform:rotate(-90deg)">
    <circle cx="66" cy="66" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="12"/>
    <circle cx="66" cy="66" r="${r}" fill="none" stroke="${col}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${dash} ${c}"/>
  </svg>`;
}

function locationOf(loc: unknown): string {
  const l = (loc ?? {}) as { path?: string; selector?: string; line?: number };
  return [l.path, l.selector, l.line ? `line ${l.line}` : null].filter(Boolean).map(esc).join(' · ');
}

export function buildHtmlReport(scan: ReportScan): string {
  const title = scan.target.name || scan.target.value;
  const findings = [...scan.findings].sort(
    (a, b) => (SEVERITY_ORDER[b.severity] ?? 0) - (SEVERITY_ORDER[a.severity] ?? 0),
  );
  const overall = scan.score?.overall ?? 0;

  const pillarRows = (scan.score?.pillars ?? [])
    .map((p) => {
      const counts = Object.entries(p.findingCounts)
        .filter(([, n]) => n > 0)
        .map(([s, n]) => `${n} ${s}`)
        .join(', ');
      return `<tr>
        <td><span class="dot" style="background:${PILLAR_COLOR[p.pillar] ?? '#64748b'}"></span>${esc(p.pillar)}</td>
        <td style="font-weight:600;color:${scoreColor(p.score)}">${p.score}</td>
        <td class="muted">${esc(counts || 'no findings')}</td>
      </tr>`;
    })
    .join('');

  const correlations = (scan.score?.correlations ?? [])
    .map(
      (c) =>
        `<li><span class="sev" style="background:${SEVERITY_BG[c.severity] ?? SEVERITY_BG.info}">${esc(c.severity)}</span> <strong>${esc(c.pillars.join(' + '))}</strong> — ${esc(c.rationale)}</li>`,
    )
    .join('');

  const findingRows = findings
    .map(
      (f) => `<div class="finding">
      <div class="frow">
        <span class="sev" style="background:${SEVERITY_BG[f.severity] ?? SEVERITY_BG.info}">${esc(f.severity)}</span>
        <span class="pill"><span class="dot" style="background:${PILLAR_COLOR[f.pillar] ?? '#64748b'}"></span>${esc(f.pillar)}</span>
        <span class="code">${esc(f.code)}</span>
      </div>
      <div class="ftitle">${esc(f.title)}</div>
      ${f.location ? `<div class="loc">${locationOf(f.location)}</div>` : ''}
      ${f.description ? `<div class="desc">${esc(f.description)}</div>` : ''}
      ${f.remediation ? `<div class="fix"><strong>Fix:</strong> ${esc(f.remediation)}</div>` : ''}
      ${f.tags?.length ? `<div class="tags">${f.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
    </div>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>QA Prism report — ${esc(title)}</title>
<style>
  :root{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a}
  *{box-sizing:border-box}
  body{margin:0;background:#f8fafc;padding:32px}
  .wrap{max-width:860px;margin:0 auto}
  .brand{font-weight:600;font-size:18px;margin-bottom:16px}
  .brand span{background:linear-gradient(90deg,#4f46e5,#7c3aed);-webkit-background-clip:text;background-clip:text;color:transparent}
  .card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:24px;margin-bottom:16px}
  .head{display:flex;justify-content:space-between;align-items:center;gap:24px;flex-wrap:wrap}
  h1{font-size:22px;margin:4px 0}
  .muted{color:#64748b;font-size:13px}
  .meta{color:#64748b;font-size:12px;margin-top:8px;display:flex;gap:16px;flex-wrap:wrap}
  .gauge{position:relative;width:132px;text-align:center}
  .gauge .num{position:absolute;top:44px;left:0;right:0;font-size:30px;font-weight:600}
  .gauge .den{position:absolute;top:80px;left:0;right:0;font-size:11px;color:#94a3b8}
  table{width:100%;border-collapse:collapse;font-size:14px}
  td{padding:8px 6px;border-bottom:1px solid #f1f5f9}
  .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle}
  h2{font-size:14px;text-transform:uppercase;letter-spacing:.04em;color:#475569;margin:0 0 12px}
  .sev{display:inline-block;border-radius:5px;padding:2px 8px;font-size:11px;font-weight:600;background:#f1f5f9}
  .pill{font-size:12px;color:#64748b}
  .code{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#94a3b8}
  .finding{border:1px solid #e2e8f0;border-radius:12px;padding:14px;margin-bottom:10px}
  .frow{display:flex;gap:10px;align-items:center;margin-bottom:6px}
  .ftitle{font-weight:600}
  .loc{font-size:12px;color:#64748b;margin-top:2px}
  .desc{font-size:13px;color:#475569;margin-top:6px}
  .fix{font-size:13px;color:#334155;margin-top:6px}
  .tags{margin-top:8px}
  .tag{display:inline-block;background:#f1f5f9;color:#64748b;border-radius:5px;padding:1px 7px;font-size:11px;margin-right:4px}
  .corr{background:#eef2ff;border-color:#c7d2fe}
  .corr ul{margin:0;padding-left:18px}.corr li{font-size:14px;color:#3730a3;margin-bottom:6px}
  .foot{color:#94a3b8;font-size:12px;text-align:center;margin-top:8px}
</style></head>
<body><div class="wrap">
  <div class="brand">QA <span>Prism</span> — scan report</div>
  <div class="card"><div class="head">
    <div>
      <div class="muted">${esc(scan.target.kind)} · ${esc(scan.status)}</div>
      <h1>${esc(title)}</h1>
      <div class="muted">${esc(scan.target.value)}</div>
      <div class="meta">
        <span>Started ${fmt(scan.startedAt)}</span>
        <span>Finished ${fmt(scan.finishedAt)}</span>
        <span>Duration ${durationOf(scan.startedAt, scan.finishedAt)}</span>
      </div>
    </div>
    <div class="gauge">${gaugeSvg(overall)}<div class="num" style="color:${scoreColor(overall)}">${overall}</div><div class="den">/ 100</div></div>
  </div></div>

  <div class="card"><h2>Pillar scores</h2><table>${pillarRows || '<tr><td class="muted">No score.</td></tr>'}</table></div>

  ${correlations ? `<div class="card corr"><h2>Cross-pillar correlations</h2><ul>${correlations}</ul></div>` : ''}

  <div class="card"><h2>Findings (${findings.length})</h2>${findingRows || '<div class="muted">No findings.</div>'}</div>

  <div class="foot">Generated by QA Prism on ${fmt(new Date())} · reports are retained for 1 hour</div>
</div></body></html>`;
}
