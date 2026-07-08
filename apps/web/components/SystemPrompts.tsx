'use client';

import { useEffect, useState } from 'react';

interface PromptDef {
  key: string;
  label: string;
  description: string;
  prompt: string;
}

export function SystemPrompts() {
  const [prompts, setPrompts] = useState<PromptDef[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/prompts', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (Array.isArray(d?.prompts)) setPrompts(d.prompts);
        else setError('Could not load system prompts.');
      })
      .catch(() => alive && setError('Could not load system prompts.'));
    return () => {
      alive = false;
    };
  }, []);

  async function copy(p: PromptDef) {
    try {
      await navigator.clipboard.writeText(p.prompt);
      setCopied(p.key);
      setTimeout(() => setCopied((c) => (c === p.key ? null : c)), 1500);
    } catch {
      /* clipboard unavailable — no-op */
    }
  }

  if (error) {
    return <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>;
  }
  if (!prompts) {
    return <p className="text-sm text-slate-500">Loading system prompts…</p>;
  }

  return (
    <div className="space-y-5">
      {prompts.map((p) => (
        <section key={p.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">{p.label}</h2>
              <p className="mt-1 text-sm text-slate-500">{p.description}</p>
              <code className="mt-1 inline-block text-[11px] text-slate-400">{p.key}</code>
            </div>
            <button
              onClick={() => copy(p)}
              className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
            >
              {copied === p.key ? 'Copied ✓' : 'Copy'}
            </button>
          </div>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words px-5 py-4 text-[13px] leading-relaxed text-slate-700">
            {p.prompt}
          </pre>
        </section>
      ))}
    </div>
  );
}
