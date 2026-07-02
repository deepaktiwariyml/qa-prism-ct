'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function RunScanForm() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: url,
        target: { kind: 'url', value: url },
      };
      if (repoPath.trim()) body.options = { repoPath: repoPath.trim() };
      const res = await fetch('/api/scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`API responded ${res.status}`);
      const { scanId } = (await res.json()) as { scanId: string };
      router.push(`/scans/${scanId}`);
    } catch (err) {
      setError(String(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Run a scan</h2>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
        />
        <input
          type="text"
          value={repoPath}
          onChange={(e) => setRepoPath(e.target.value)}
          placeholder="optional repo path (automation)"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
        />
        <button
          type="submit"
          disabled={busy || !url}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? 'Starting…' : 'Run scan'}
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">Could not start scan: {error}</p>}
    </form>
  );
}
