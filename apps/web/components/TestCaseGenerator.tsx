'use client';

import { useMemo, useState } from 'react';

type Status = 'pending' | 'approved' | 'discarded';
type CaseType = 'positive' | 'negative' | 'edge';
type TypeFilter = 'all' | CaseType;

interface Column {
  id: string;
  name: string;
}

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
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [filling, setFilling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

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
        body: JSON.stringify({ description: description.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `API ${res.status}`);
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
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  }

  /** Fill empty custom-column cells via the LLM. Test case titles are never changed. */
  async function fillColumns() {
    if (columns.length === 0 || rows.length === 0) return;
    setFilling(true);
    setError(null);
    try {
      const res = await fetch('/api/testcases/columns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testcases: rows.map((r) => r.text),
          columns: columns.map((c) => c.name || 'Column'),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `API ${res.status}`);
      const matrix: string[][] = Array.isArray(data.rows) ? data.rows : [];
      setRows((rs) =>
        rs.map((r, i) => {
          const values = { ...r.values };
          columns.forEach((c, j) => {
            if (!values[c.id]) values[c.id] = matrix[i]?.[j] ?? '';
          });
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

  function addColumn() {
    setColumns((c) => [...c, { id: uid(), name: `Column ${c.length + 1}` }]);
  }
  function renameColumn(id: string, name: string) {
    setColumns((c) => c.map((col) => (col.id === id ? { ...col, name } : col)));
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

  /** Export matrix — classification (type) is UI-only and intentionally excluded. */
  function toMatrix(): string[][] {
    const header = ['#', 'Test Case', 'Status', ...columns.map((c) => c.name || 'Column')];
    const body = rows.map((r, i) => [
      String(i + 1),
      r.text,
      r.status,
      ...columns.map((c) => r.values[c.id] ?? ''),
    ]);
    return [header, ...body];
  }

  async function downloadXlsx() {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet(toMatrix());
    ws['!cols'] = [{ wch: 5 }, { wch: 60 }, { wch: 12 }, ...columns.map(() => ({ wch: 24 }))];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Test Cases');
    XLSX.writeFile(wb, 'test-cases.xlsx');
  }

  async function downloadPdf() {
    const { jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
    const matrix = toMatrix();
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text('Test Cases', 14, 16);
    autoTable(doc, {
      head: [matrix[0] as string[]],
      body: matrix.slice(1) as string[][],
      startY: 22,
      styles: { fontSize: 9, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [79, 70, 229] },
      columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 110 } },
    });
    doc.save('test-cases.pdf');
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
            {busy ? 'Generating…' : 'Generate test cases'}
          </button>
          <button
            type="button"
            disabled
            title="Jira import — coming soon (needs Atlassian setup)"
            className="cursor-not-allowed rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-400"
          >
            Import from Jira (soon)
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

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
            <button
              onClick={addColumn}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              + Add column
            </button>
            {columns.length > 0 && (
              <button
                onClick={fillColumns}
                disabled={filling}
                className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {filling ? 'Filling…' : '✨ Fill columns with AI'}
              </button>
            )}
            <button
              onClick={downloadXlsx}
              className="rounded-lg border border-emerald-300 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
            >
              Download XLSX
            </button>
            <button
              onClick={downloadPdf}
              className="rounded-lg border border-indigo-300 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
            >
              Download PDF
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="w-10 px-3 py-2.5">#</th>
                  <th className="px-3 py-2.5">Test case</th>
                  {columns.map((c) => (
                    <th key={c.id} className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <input
                          value={c.name}
                          onChange={(e) => renameColumn(c.id, e.target.value)}
                          className="w-28 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-600 hover:border-slate-300 focus:border-indigo-400 focus:outline-none"
                        />
                        <button
                          onClick={() => removeColumn(c.id)}
                          title="Remove column"
                          className="text-slate-300 hover:text-red-500"
                        >
                          ✕
                        </button>
                      </div>
                    </th>
                  ))}
                  <th className="w-40 px-3 py-2.5 text-center">Decision</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(({ r, i }) => (
                  <tr key={r.id} className={`border-b border-slate-100 align-top ${rowTone[r.status]}`}>
                    <td className="px-3 py-3 text-slate-400">{i + 1}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`mr-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TYPE_BADGE[r.type]}`}
                      >
                        {TYPE_LABEL[r.type]}
                      </span>
                      <span className="text-slate-800">{r.text}</span>
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
            Tip: click a column header to rename it, then “Fill columns with AI” to auto-populate.
            Positive / Negative / Edge tags are shown here to help you review — they’re not included
            in the export.
          </p>
        </div>
      )}
    </div>
  );
}
