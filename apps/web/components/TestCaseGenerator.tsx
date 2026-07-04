'use client';

import { useMemo, useState } from 'react';

type Status = 'pending' | 'approved' | 'discarded';

interface Column {
  id: string;
  name: string;
}

interface Row {
  id: string;
  text: string;
  status: Status;
  values: Record<string, string>; // keyed by column id
}

const uid = () => (typeof crypto !== 'undefined' ? crypto.randomUUID() : String(Math.random()));

export function TestCaseGenerator() {
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);

  const counts = useMemo(() => {
    let approved = 0;
    let discarded = 0;
    for (const r of rows) {
      if (r.status === 'approved') approved++;
      else if (r.status === 'discarded') discarded++;
    }
    return { approved, discarded, total: rows.length };
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
      const cases: string[] = Array.isArray(data.testcases) ? data.testcases : [];
      setRows(
        cases.map((text) => ({ id: uid(), text, status: 'pending' as Status, values: {} })),
      );
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
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

  /** [header row, ...data rows] including status + all custom columns. */
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

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Test Case <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">Generator</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Describe a feature or paste a requirement — get clear, high-level manual test cases.
          Approve the ones you want, add your own columns, and export to Excel or PDF.
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
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                {counts.total} test cases
              </span>
              <span className="rounded-md bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700">
                {counts.approved} approved
              </span>
              <span className="rounded-md bg-red-100 px-2 py-0.5 font-medium text-red-700">
                {counts.discarded} discarded
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={addColumn}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                + Add column
              </button>
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
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[720px] border-collapse text-sm">
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
                {rows.map((r, i) => (
                  <tr key={r.id} className={`border-b border-slate-100 align-top ${rowTone[r.status]}`}>
                    <td className="px-3 py-3 text-slate-400">{i + 1}</td>
                    <td className="px-3 py-3 text-slate-800">{r.text}</td>
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
            Tip: click a column header to rename it, fill cells inline, then export — your columns
            and decisions are included.
          </p>
        </div>
      )}
    </div>
  );
}
