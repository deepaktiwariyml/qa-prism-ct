'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePersistentState } from '@/lib/usePersistentState';
import { UsageChip } from '@/components/UsageChip';
import { Markdown } from '@/components/Markdown';
import type { CallUsage } from '@/lib/usage';

type Scope = 'all' | 'approved';

type Status = 'pending' | 'approved' | 'discarded';
type CaseType = 'positive' | 'negative' | 'edge';
type TypeFilter = 'all' | CaseType;

interface Column {
  id: string;
  name: string;
}

/** The standard columns a QA test-case document can carry. The "Add column"
 *  menu offers exactly these — checking adds, unchecking removes. */
const PRESET_COLUMNS = [
  'Priority',
  'Severity',
  'Status', // execution result — Pass / Fail
  'Author',
  'Preconditions',
  'Test Steps',
  'Test Data',
  'Expected Result',
  'Module',
  'Test Type',
  'Automation Status',
  'Remarks',
] as const;

interface Row {
  id: string;
  text: string;
  type: CaseType;
  status: Status;
  values: Record<string, string>; // keyed by column id
}

const uid = () => (typeof crypto !== 'undefined' ? crypto.randomUUID() : String(Math.random()));

const TYPE_BADGE: Record<CaseType, string> = {
  positive: 'bg-emerald-100 text-emerald-700',
  negative: 'bg-rose-100 text-rose-700',
  edge: 'bg-violet-100 text-violet-700',
};
const TYPE_LABEL: Record<CaseType, string> = {
  positive: 'Positive',
  negative: 'Negative',
  edge: 'Edge',
};

export function TestCaseGenerator() {
  const [description, setDescription] = usePersistentState('qa-prism:tc:description', '');
  const [busy, setBusy] = useState(false);
  const [filling, setFilling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = usePersistentState<Row[]>('qa-prism:tc:rows', []);
  const [columns, setColumns] = usePersistentState<Column[]>('qa-prism:tc:columns', []);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [openMenu, setOpenMenu] = useState<'xlsx' | 'pdf' | null>(null);
  const downloadsRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [combining, setCombining] = useState(false);
  const [explain, setExplain] = useState<{
    rowId: string;
    loading: boolean;
    content: string;
    error: string | null;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [usage, setUsage] = useState<CallUsage | null>(null);
  const [bdd, setBdd] = usePersistentState('qa-prism:tc:bdd', false);
  // System-prompt override: '' means "use the server default".
  const [systemPrompt, setSystemPrompt] = usePersistentState('qa-prism:tc:system', '');
  const [systemOpen, setSystemOpen] = useState(false);
  const [systemLoading, setSystemLoading] = useState(false);
  const [feature, setFeature] = useState<{ loading: boolean; content: string; error: string | null } | null>(
    null,
  );
  const [featureCopied, setFeatureCopied] = useState(false);
  const [jiraOpen, setJiraOpen] = useState(false);
  const [jiraTicket, setJiraTicket] = useState('');
  const [jiraBusy, setJiraBusy] = useState(false);
  const [jiraErr, setJiraErr] = useState<string | null>(null);
  const [jiraResults, setJiraResults] = useState<Array<{ key: string; summary: string }>>([]);
  const [jiraSearching, setJiraSearching] = useState(false);
  // Set right after a pick/import so the follow-up value change doesn't re-open
  // the dropdown for the value we just chose.
  const jiraSuppress = useRef(false);

  // Debounced typeahead: query Jira for matching tickets as the user types.
  useEffect(() => {
    if (!jiraOpen) return;
    const q = jiraTicket.trim();
    if (jiraSuppress.current) {
      jiraSuppress.current = false;
      return;
    }
    if (q.length < 2) {
      setJiraResults([]);
      setJiraSearching(false);
      return;
    }
    let alive = true;
    setJiraSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/testcases/jira-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q }),
        });
        const data = await res.json();
        if (alive) setJiraResults(Array.isArray(data.results) ? data.results : []);
      } catch {
        if (alive) setJiraResults([]);
      } finally {
        if (alive) setJiraSearching(false);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [jiraTicket, jiraOpen]);

  async function importFromJira(ticket?: string) {
    const key = (ticket ?? jiraTicket).trim();
    if (!key) return;
    setJiraBusy(true);
    setJiraErr(null);
    setJiraResults([]);
    try {
      const res = await fetch('/api/testcases/jira-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket: key }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `API ${res.status}`);
      const summary = String(data.summary ?? '').trim();
      const desc = String(data.description ?? '').trim();
      const composed = [summary && `Feature: ${summary}`, desc].filter(Boolean).join('\n\n');
      setDescription(composed || summary || desc);
      setJiraOpen(false);
      setJiraTicket('');
    } catch (err) {
      setJiraErr(String(err instanceof Error ? err.message : err));
    } finally {
      setJiraBusy(false);
    }
  }

  function pickTicket(key: string) {
    jiraSuppress.current = true;
    setJiraTicket(key);
    setJiraResults([]);
    void importFromJira(key);
  }

  // Lazy-load the default system prompt into the editor the first time the
  // Advanced panel is opened (and it hasn't been customised yet).
  async function openSystemPanel() {
    const next = !systemOpen;
    setSystemOpen(next);
    if (next && !systemPrompt.trim()) {
      setSystemLoading(true);
      try {
        const res = await fetch('/api/testcases/system-prompt', { cache: 'no-store' });
        const data = await res.json();
        if (res.ok && data.prompt) setSystemPrompt(data.prompt as string);
      } catch {
        /* leave empty — server falls back to its default on generate */
      } finally {
        setSystemLoading(false);
      }
    }
  }

  async function resetSystemPrompt() {
    setSystemLoading(true);
    try {
      const res = await fetch('/api/testcases/system-prompt', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && data.prompt) setSystemPrompt(data.prompt as string);
    } catch {
      /* ignore */
    } finally {
      setSystemLoading(false);
    }
  }

  async function explainFeature() {
    if (!description.trim()) return;
    setFeature({ loading: true, content: '', error: null });
    setFeatureCopied(false);
    try {
      const res = await fetch('/api/testcases/explain-feature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `API ${res.status}`);
      if (data.usage) setUsage(data.usage as CallUsage);
      setFeature({ loading: false, content: String(data.explanation ?? ''), error: null });
    } catch (err) {
      setFeature({ loading: false, content: '', error: String(err instanceof Error ? err.message : err) });
    }
  }

  async function copyFeature() {
    const text = feature?.content;
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      setFeatureCopied(true);
      setTimeout(() => setFeatureCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const colMenuRef = useRef<HTMLDivElement>(null);
  // Per-column pixel widths (drag-to-resize). Keyed by 'text' for the Test
  // Case column and by column id for each added column.
  const [colWidths, setColWidths] = usePersistentState<Record<string, number>>(
    'qa-prism:tc:colWidths',
    {},
  );
  const widthOf = (key: string, fallback: number) => colWidths[key] ?? fallback;

  /** Start a horizontal column-resize drag from a header handle. */
  function startResize(e: React.PointerEvent, key: string, fallback: number) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widthOf(key, fallback);
    const onMove = (ev: PointerEvent) => {
      const next = Math.max(90, startW + (ev.clientX - startX));
      setColWidths((w) => ({ ...w, [key]: next }));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  const TEXT_COL_DEFAULT = 380;
  const CUSTOM_COL_DEFAULT = 190;
  const tableWidth =
    36 + 44 + widthOf('text', TEXT_COL_DEFAULT) + 150 +
    columns.reduce((sum, c) => sum + widthOf(c.id, CUSTOM_COL_DEFAULT), 0);

  // Close the download dropdown when clicking outside it.
  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e: MouseEvent) => {
      if (downloadsRef.current && !downloadsRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [openMenu]);

  // Close the "Add column" dropdown when clicking outside it.
  useEffect(() => {
    if (!colMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) {
        setColMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [colMenuOpen]);

  const counts = useMemo(() => {
    const c = { total: rows.length, approved: 0, discarded: 0, positive: 0, negative: 0, edge: 0 };
    for (const r of rows) {
      if (r.status === 'approved') c.approved++;
      else if (r.status === 'discarded') c.discarded++;
      c[r.type]++;
    }
    return c;
  }, [rows]);

  async function generate() {
    if (!description.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/testcases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description.trim(),
          format: bdd ? 'bdd' : 'standard',
          ...(systemPrompt.trim() ? { system: systemPrompt.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `API ${res.status}`);
      if (data.usage) setUsage(data.usage as CallUsage);
      const cases: Array<{ title: string; type: CaseType }> = Array.isArray(data.testcases)
        ? data.testcases
        : [];
      setRows(
        cases.map((c) => ({
          id: uid(),
          text: c.title,
          type: c.type,
          status: 'pending' as Status,
          values: {},
        })),
      );
      setTypeFilter('all');
      setSelected(new Set());
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Fill ONLY empty column cells via the LLM — filled cells are left untouched
   * and never re-sent. We request just the rows and columns that actually have
   * a gap, and if nothing is empty we don't call the API at all.
   */
  async function fillColumns() {
    if (columns.length === 0 || rows.length === 0) return;
    const isEmpty = (r: Row, c: Column) => !(r.values[c.id] ?? '').trim();
    const rowsToFill = rows.filter((r) => columns.some((c) => isEmpty(r, c)));
    const colsToFill = columns.filter((c) => rows.some((r) => isEmpty(r, c)));
    if (rowsToFill.length === 0 || colsToFill.length === 0) {
      setError('All column cells are already filled — nothing to generate.');
      return;
    }
    setFilling(true);
    setError(null);
    try {
      const res = await fetch('/api/testcases/columns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testcases: rowsToFill.map((r) => r.text),
          columns: colsToFill.map((c) => c.name || 'Column'),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `API ${res.status}`);
      if (data.usage) setUsage(data.usage as CallUsage);
      const matrix: string[][] = Array.isArray(data.rows) ? data.rows : [];
      // Map generated values back to the exact empty cells they were for.
      const fills = new Map<string, Record<string, string>>();
      rowsToFill.forEach((r, i) => {
        const add: Record<string, string> = {};
        colsToFill.forEach((c, j) => {
          if (isEmpty(r, c)) {
            const v = matrix[i]?.[j] ?? '';
            if (v) add[c.id] = v;
          }
        });
        if (Object.keys(add).length) fills.set(r.id, add);
      });
      setRows((rs) =>
        rs.map((r) => {
          const add = fills.get(r.id);
          if (!add) return r;
          const values = { ...r.values };
          for (const [colId, v] of Object.entries(add)) {
            if (!(values[colId] ?? '').trim()) values[colId] = v; // never overwrite
          }
          return { ...r, values };
        }),
      );
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setFilling(false);
    }
  }

  function setStatus(id: string, status: Status) {
    setRows((rs) =>
      rs.map((r) => (r.id === id ? { ...r, status: r.status === status ? 'pending' : status } : r)),
    );
  }

  /** Toggle a preset column on/off. Removing also clears its cell values. */
  function toggleColumn(name: string) {
    const existing = columns.find((c) => c.name === name);
    if (existing) {
      removeColumn(existing.id);
    } else {
      setColumns((c) => [...c, { id: uid(), name }]);
    }
  }
  function removeColumn(id: string) {
    setColumns((c) => c.filter((col) => col.id !== id));
    setRows((rs) =>
      rs.map((r) => {
        const values = { ...r.values };
        delete values[id];
        return { ...r, values };
      }),
    );
  }
  function setCell(rowId: string, colId: string, value: string) {
    setRows((rs) =>
      rs.map((r) => (r.id === rowId ? { ...r, values: { ...r.values, [colId]: value } } : r)),
    );
  }
  function setText(rowId: string, text: string) {
    setRows((rs) => rs.map((r) => (r.id === rowId ? { ...r, text } : r)));
  }

  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Merge the selected test cases into one via the LLM. Unselected rows are
   * left untouched; the combined case replaces the selected ones in place. */
  async function combineSelected() {
    const chosen = rows.filter((r) => selected.has(r.id));
    if (chosen.length < 2) return;
    setCombining(true);
    setError(null);
    try {
      const res = await fetch('/api/testcases/combine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testcases: chosen.map((r) => r.text) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `API ${res.status}`);
      if (data.usage) setUsage(data.usage as CallUsage);
      const combined: Row = {
        id: uid(),
        text: String(data.title ?? '').trim(),
        type: (['positive', 'negative', 'edge'] as CaseType[]).includes(data.type)
          ? data.type
          : 'positive',
        status: 'pending',
        values: {},
      };
      setRows((rs) => {
        const out: Row[] = [];
        let inserted = false;
        for (const r of rs) {
          if (selected.has(r.id)) {
            if (!inserted) {
              out.push(combined); // drop the selected in place, insert the merged one once
              inserted = true;
            }
          } else {
            out.push(r);
          }
        }
        return out;
      });
      setSelected(new Set());
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setCombining(false);
    }
  }

  async function openExplain(row: Row) {
    setExplain({ rowId: row.id, loading: true, content: '', error: null });
    setCopied(false);
    try {
      const res = await fetch('/api/testcases/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testcase: row.text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `API ${res.status}`);
      if (data.usage) setUsage(data.usage as CallUsage);
      setExplain({ rowId: row.id, loading: false, content: String(data.explanation ?? ''), error: null });
    } catch (err) {
      setExplain({ rowId: row.id, loading: false, content: '', error: String(err instanceof Error ? err.message : err) });
    }
  }

  async function copyExplanation() {
    const text = explain?.content;
    if (!text) return;
    let ok = false;
    // Preferred path — needs a secure context and clipboard-write permission.
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      // fall through to the legacy path
    }
    // Fallback for insecure contexts / permission-restricted iframes.
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  /** Export matrix — classification (type) is UI-only and intentionally excluded. */
  function toMatrix(scope: Scope): string[][] {
    const source = scope === 'approved' ? rows.filter((r) => r.status === 'approved') : rows;
    const header = ['#', 'Test Case', 'Decision', ...columns.map((c) => c.name || 'Column')];
    const body = source.map((r, i) => [
      String(i + 1),
      r.text,
      r.status,
      ...columns.map((c) => r.values[c.id] ?? ''),
    ]);
    return [header, ...body];
  }

  const fileSuffix = (scope: Scope) => (scope === 'approved' ? '-approved' : '');

  async function downloadXlsx(scope: Scope = 'all') {
    setOpenMenu(null);
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet(toMatrix(scope));
    ws['!cols'] = [{ wch: 5 }, { wch: 60 }, { wch: 12 }, ...columns.map(() => ({ wch: 24 }))];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Test Cases');
    XLSX.writeFile(wb, `test-cases${fileSuffix(scope)}.xlsx`);
  }

  async function downloadPdf(scope: Scope = 'all') {
    setOpenMenu(null);
    const { jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
    const matrix = toMatrix(scope);
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text(scope === 'approved' ? 'Test Cases (approved)' : 'Test Cases', 14, 16);
    autoTable(doc, {
      head: [matrix[0] as string[]],
      body: matrix.slice(1) as string[][],
      startY: 22,
      styles: { fontSize: 9, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [79, 70, 229] },
      columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 110 } },
    });
    doc.save(`test-cases${fileSuffix(scope)}.pdf`);
  }

  const rowTone: Record<Status, string> = {
    pending: 'bg-white',
    approved: 'bg-emerald-50',
    discarded: 'bg-red-50',
  };

  const visibleRows = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => typeFilter === 'all' || r.type === typeFilter);

  const filterChips: Array<{ key: TypeFilter; label: string; n: number }> = [
    { key: 'all', label: 'All', n: counts.total },
    { key: 'positive', label: 'Positive', n: counts.positive },
    { key: 'negative', label: 'Negative', n: counts.negative },
    { key: 'edge', label: 'Edge', n: counts.edge },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Test Case <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">Generator</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Describe a feature or paste a requirement — get a comprehensive set of clear, high-level
          manual test cases (positive, negative, and edge). Approve the ones you want, add your own
          columns, auto-fill them with AI, and export to Excel or PDF.
        </p>
      </div>

      {/* Input */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          What are we testing?
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          placeholder="e.g. A login screen with email + password, 'remember me', forgot-password link, lockout after 5 failed attempts, and SSO via Google."
          className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={generate}
            disabled={busy || !description.trim()}
            className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Generating…' : `Generate test cases${bdd ? ' (BDD)' : ''}`}
          </button>
          <button
            type="button"
            onClick={() => {
              setJiraErr(null);
              setJiraOpen((o) => !o);
            }}
            title="Pull a Jira ticket's summary and description into the prompt"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Import from Jira
          </button>
          <button
            type="button"
            onClick={explainFeature}
            disabled={!description.trim()}
            title="Explain this feature in plain language"
            className="rounded-lg border border-indigo-300 px-4 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-50"
          >
            💡 Explain Feature
          </button>
        </div>

        {jiraOpen && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Jira ticket — search by key or title, or paste a URL
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={jiraTicket}
                  onChange={(e) => setJiraTicket(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && importFromJira()}
                  placeholder="Start typing — e.g. PROJ-1, “login page”, or a ticket URL"
                  autoComplete="off"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                />
                {(jiraSearching || jiraResults.length > 0) && (
                  <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                    {jiraSearching && jiraResults.length === 0 && (
                      <li className="px-3 py-2 text-sm text-slate-400">Searching…</li>
                    )}
                    {jiraResults.map((r) => (
                      <li key={r.key}>
                        <button
                          type="button"
                          onClick={() => pickTicket(r.key)}
                          className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition hover:bg-indigo-50"
                        >
                          <span className="shrink-0 font-mono text-xs font-semibold text-indigo-600">{r.key}</span>
                          <span className="truncate text-slate-600">{r.summary}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                type="button"
                onClick={() => importFromJira()}
                disabled={jiraBusy || !jiraTicket.trim()}
                className="shrink-0 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {jiraBusy ? 'Importing…' : 'Import'}
              </button>
            </div>
            {jiraErr && <p className="mt-2 text-sm text-red-600">{jiraErr}</p>}
            <p className="mt-2 text-xs text-slate-400">
              Pulls the ticket’s summary and description into the prompt above. Set your Jira site
              URL, email, and API token in Settings first.
            </p>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={bdd}
              onChange={(e) => setBdd(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-400"
            />
            Generate in BDD (Gherkin) format
          </label>
          <button
            type="button"
            onClick={openSystemPanel}
            className="text-sm font-medium text-indigo-600 hover:underline"
          >
            {systemOpen ? 'Hide' : 'Customise'} QA system prompt{systemPrompt.trim() ? ' ✎' : ''}
          </button>
        </div>

        {systemOpen && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                QA system prompt (override the default)
              </label>
              <button
                type="button"
                onClick={resetSystemPrompt}
                className="text-xs font-medium text-slate-500 hover:text-slate-700"
              >
                ↺ Reset to default
              </button>
            </div>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={10}
              placeholder={systemLoading ? 'Loading default…' : 'Leave blank to use the built-in QA-Bot V3 default.'}
              className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs leading-relaxed text-slate-700 outline-none focus:border-indigo-500"
            />
            <p className="mt-1.5 text-xs text-slate-400">
              This steers how test cases are reasoned about. The output format (table rows / Gherkin)
              is controlled by the app, so your changes here shape coverage, not the shape.
            </p>
          </div>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      {usage && (
        <div className="mt-4">
          <UsageChip usage={usage} />
        </div>
      )}

      {/* Results */}
      {rows.length > 0 && (
        <div className="mt-8">
          {/* Filters (UI only — not exported) */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {filterChips.map((chip) => (
              <button
                key={chip.key}
                onClick={() => setTypeFilter(chip.key)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  typeFilter === chip.key
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                {chip.label} <span className="opacity-70">({chip.n})</span>
              </button>
            ))}
            <span className="ml-1 text-xs text-slate-400">
              {counts.approved} approved · {counts.discarded} discarded
            </span>
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
            {selected.size >= 2 && (
              <button
                onClick={combineSelected}
                disabled={combining}
                className="mr-auto rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {combining ? 'Combining…' : `⧉ Combine ${selected.size} test cases`}
              </button>
            )}
            <div ref={colMenuRef} className="relative">
              <button
                onClick={() => setColMenuOpen((o) => !o)}
                aria-expanded={colMenuOpen}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                + Add column
                <svg viewBox="0 0 20 20" fill="currentColor" className={`h-4 w-4 text-slate-400 transition-transform ${colMenuOpen ? 'rotate-180' : ''}`} aria-hidden="true">
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.06l3.71-3.83a.75.75 0 1 1 1.08 1.04l-4.25 4.38a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
                </svg>
              </button>
              {colMenuOpen && (
                <div className="absolute right-0 z-20 mt-1 w-60 rounded-xl border border-slate-200 bg-white p-1.5 text-left shadow-lg">
                  <div className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                    Test case columns
                  </div>
                  {PRESET_COLUMNS.map((name) => {
                    const checked = columns.some((c) => c.name === name);
                    return (
                      <label
                        key={name}
                        className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleColumn(name)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-400"
                        />
                        {name}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
            {columns.length > 0 && (
              <button
                onClick={fillColumns}
                disabled={filling}
                className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {filling ? 'Filling…' : '✨ Fill columns with AI'}
              </button>
            )}
            <div ref={downloadsRef} className="flex flex-wrap items-center gap-2">
              <SplitDownload
                label="Download XLSX"
                tone="emerald"
                open={openMenu === 'xlsx'}
                approvedCount={counts.approved}
                onAll={() => downloadXlsx('all')}
                onApproved={() => downloadXlsx('approved')}
                onToggle={() => setOpenMenu((m) => (m === 'xlsx' ? null : 'xlsx'))}
              />
              <SplitDownload
                label="Download PDF"
                tone="indigo"
                open={openMenu === 'pdf'}
                approvedCount={counts.approved}
                onAll={() => downloadPdf('all')}
                onApproved={() => downloadPdf('approved')}
                onToggle={() => setOpenMenu((m) => (m === 'pdf' ? null : 'pdf'))}
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table
              className="table-fixed border-collapse text-sm"
              style={{ width: tableWidth, minWidth: '100%' }}
            >
              <colgroup>
                <col style={{ width: 36 }} />
                <col style={{ width: 44 }} />
                <col style={{ width: widthOf('text', TEXT_COL_DEFAULT) }} />
                {columns.map((c) => (
                  <col key={c.id} style={{ width: widthOf(c.id, CUSTOM_COL_DEFAULT) }} />
                ))}
                <col style={{ width: 150 }} />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2.5" />
                  <th className="px-3 py-2.5">#</th>
                  <th className="relative px-3 py-2.5">
                    Test case
                    <ResizeHandle onPointerDown={(e) => startResize(e, 'text', TEXT_COL_DEFAULT)} />
                  </th>
                  {columns.map((c) => (
                    <th key={c.id} className="relative px-3 py-2.5">
                      <div className="flex items-center gap-1.5 pr-2">
                        <span className="truncate text-xs font-semibold uppercase tracking-wide text-slate-600">
                          {c.name}
                        </span>
                        <button
                          onClick={() => removeColumn(c.id)}
                          title="Remove column"
                          className="shrink-0 text-slate-300 hover:text-red-500"
                        >
                          ✕
                        </button>
                      </div>
                      <ResizeHandle onPointerDown={(e) => startResize(e, c.id, CUSTOM_COL_DEFAULT)} />
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-center">Decision</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(({ r, i }) => (
                  <tr key={r.id} className={`group border-b border-slate-100 align-top ${rowTone[r.status]}`}>
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                        aria-label="Select test case for combining"
                        className="mt-0.5 h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-400"
                      />
                    </td>
                    <td className="px-3 py-3 text-slate-400">{i + 1}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`mb-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TYPE_BADGE[r.type]}`}
                      >
                        {TYPE_LABEL[r.type]}
                      </span>
                      <div className="relative">
                        <textarea
                          value={r.text}
                          onChange={(e) => setText(r.id, e.target.value)}
                          rows={2}
                          aria-label="Test case (editable)"
                          className="w-full resize-y rounded border border-transparent bg-transparent px-2 py-1 pr-24 text-sm text-slate-800 hover:border-slate-200 focus:border-indigo-400 focus:bg-white focus:outline-none"
                        />
                        <button
                          onClick={() => openExplain(r)}
                          className="absolute right-1.5 top-1.5 rounded-md border border-indigo-300 bg-white/90 px-2 py-0.5 text-xs font-medium text-indigo-700 opacity-0 shadow-sm transition hover:bg-indigo-50 focus:opacity-100 group-hover:opacity-100"
                        >
                          💡 Explain
                        </button>
                      </div>
                    </td>
                    {columns.map((c) => (
                      <td key={c.id} className="px-3 py-2">
                        <input
                          value={r.values[c.id] ?? ''}
                          onChange={(e) => setCell(r.id, c.id, e.target.value)}
                          className="w-full rounded border border-slate-200 px-2 py-1 text-sm outline-none focus:border-indigo-400"
                        />
                      </td>
                    ))}
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setStatus(r.id, 'approved')}
                          className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                            r.status === 'approved'
                              ? 'bg-emerald-600 text-white'
                              : 'border border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                          }`}
                        >
                          ✓ Approve
                        </button>
                        <button
                          onClick={() => setStatus(r.id, 'discarded')}
                          className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                            r.status === 'discarded'
                              ? 'bg-red-600 text-white'
                              : 'border border-red-300 text-red-700 hover:bg-red-50'
                          }`}
                        >
                          ✕ Discard
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Tip: use “Add column” to pick standard QA columns, then “Fill columns with AI” to
            auto-populate only the empty cells (filled ones are never overwritten or re-sent).
            Positive / Negative / Edge tags are shown here to help you review — they’re not included
            in the export.
          </p>
        </div>
      )}

      {explain && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setExplain(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Test case explanation"
            className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <h3 className="text-sm font-semibold text-slate-800">💡 Explanation</h3>
              <button
                onClick={() => setExplain(null)}
                aria-label="Close"
                className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <div className="min-h-[80px] flex-1 overflow-y-auto px-5 py-4">
              {explain.loading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-600" />
                  Explaining this test case…
                </div>
              ) : explain.error ? (
                <p className="text-sm text-red-600">{explain.error}</p>
              ) : (
                <Markdown text={explain.content} />
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <button
                onClick={() => setExplain(null)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
              <button
                onClick={copyExplanation}
                disabled={explain.loading || !!explain.error}
                className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      )}

      {feature && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setFeature(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Feature explanation"
            className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <h3 className="text-sm font-semibold text-slate-800">💡 Feature explained (for everyone)</h3>
              <button
                onClick={() => setFeature(null)}
                aria-label="Close"
                className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <div className="min-h-[80px] flex-1 overflow-y-auto px-5 py-4">
              {feature.loading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-600" />
                  Explaining this feature in plain language…
                </div>
              ) : feature.error ? (
                <p className="text-sm text-red-600">{feature.error}</p>
              ) : (
                <Markdown text={feature.content} />
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <button
                onClick={() => setFeature(null)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
              <button
                onClick={copyFeature}
                disabled={feature.loading || !!feature.error}
                className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {featureCopied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Drag handle on a column's right edge to resize it. */
function ResizeHandle({ onPointerDown }: { onPointerDown: (e: React.PointerEvent) => void }) {
  return (
    <span
      onPointerDown={onPointerDown}
      role="separator"
      aria-orientation="vertical"
      title="Drag to resize column"
      className="absolute right-0 top-0 z-10 flex h-full w-2 cursor-col-resize touch-none items-center justify-center hover:bg-indigo-200/60"
    >
      <span className="h-1/2 w-px bg-slate-300" />
    </span>
  );
}

/** Split download button: main action downloads all; the caret opens a menu
 *  with an "approved only" option. */
function SplitDownload({
  label,
  tone,
  open,
  approvedCount,
  onAll,
  onApproved,
  onToggle,
}: {
  label: string;
  tone: 'emerald' | 'indigo';
  open: boolean;
  approvedCount: number;
  onAll: () => void;
  onApproved: () => void;
  onToggle: () => void;
}) {
  const toneCls =
    tone === 'emerald'
      ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
      : 'border-indigo-300 text-indigo-700 hover:bg-indigo-50';
  return (
    <div className="relative inline-flex">
      <button
        onClick={onAll}
        className={`flex items-center gap-1.5 rounded-l-lg border ${toneCls} px-3 py-1.5 text-sm font-medium`}
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
          <path d="M12 4v10m0 0 4-4m-4 4-4-4M5 19h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {label}
      </button>
      <button
        onClick={onToggle}
        aria-label={`${label} options`}
        aria-expanded={open}
        className={`rounded-r-lg border border-l-0 ${toneCls} px-2 py-1.5`}
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
          <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <button
            onClick={onAll}
            className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            Download all test cases
          </button>
          <button
            onClick={onApproved}
            disabled={approvedCount === 0}
            className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Download approved only{approvedCount > 0 ? ` (${approvedCount})` : ''}
          </button>
        </div>
      )}
    </div>
  );
}
