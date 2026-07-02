'use client';

import { useEffect, useMemo, useState } from 'react';

interface Cell {
  id: string;
  framework: string;
  language: string;
  platforms: string[];
  reporters: string[];
  path: string;
}

export function GeneratorConfigurator() {
  const [cells, setCells] = useState<Cell[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cellId, setCellId] = useState<string>('');
  const [platform, setPlatform] = useState<string>('');
  const [reporter, setReporter] = useState<string>('');
  const [projectName, setProjectName] = useState('');
  const [webBaseUrl, setWebBaseUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/generator/cells')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`API ${r.status}`))))
      .then((data: Cell[]) => {
        setCells(data);
        if (data[0]) {
          setCellId(data[0].id);
          setPlatform(data[0].platforms[0] ?? '');
          setReporter(data[0].reporters[0] ?? '');
        }
      })
      .catch((e) => setLoadError(String(e)));
  }, []);

  const cell = useMemo(() => cells?.find((c) => c.id === cellId), [cells, cellId]);

  function selectCell(id: string) {
    const c = cells?.find((x) => x.id === id);
    setCellId(id);
    setPlatform(c?.platforms[0] ?? '');
    setReporter(c?.reporters[0] ?? '');
  }

  async function generate() {
    if (!cell) return;
    setBusy(true);
    setError(null);
    try {
      const selection = {
        platform,
        language: cell.language,
        framework: cell.framework,
        reporter,
        projectName: projectName.trim() || undefined,
        webBaseUrl: webBaseUrl.trim() || undefined,
      };
      const res = await fetch('/api/generator/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selection),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `API ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectName.trim() || cell.id}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Could not load stack cells ({loadError}). Is the API running?
      </p>
    );
  }
  if (!cells) {
    return <p className="text-sm text-slate-500">Loading stacks…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">1 · Pick a stack</label>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cells.map((c) => (
            <button
              key={c.id}
              onClick={() => selectCell(c.id)}
              className={`rounded-xl border p-4 text-left transition ${
                c.id === cellId
                  ? 'border-indigo-500 ring-1 ring-indigo-500'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="font-medium capitalize">{c.framework}</div>
              <div className="text-xs text-slate-500 capitalize">{c.language}</div>
            </button>
          ))}
        </div>
      </div>

      {cell && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">2 · Platform</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {cell.platforms.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">3 · Reporter</label>
            <select
              value={reporter}
              onChange={(e) => setReporter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {cell.reporters.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Project name</label>
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder={cell.id}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Web base URL (optional)</label>
            <input
              value={webBaseUrl}
              onChange={(e) => setWebBaseUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={generate}
          disabled={busy || !cell}
          className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Generating…' : 'Generate & download'}
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}
