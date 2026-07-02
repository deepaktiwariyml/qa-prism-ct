'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  url: string;
  onClose: () => void;
}

const SPECIAL_KEYS = new Set([
  'Enter',
  'Backspace',
  'Tab',
  'Delete',
  'Escape',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
]);

export function ScanPreviewModal({ url, onClose }: Props) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ width: 1280, height: 800 });
  const [currentUrl, setCurrentUrl] = useState(url);
  const [status, setStatus] = useState<'starting' | 'ready' | 'error'>('starting');
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);

  const imgRef = useRef<HTMLImageElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const confirmedRef = useRef(false);
  const sessionRef = useRef<string | null>(null);

  // Launch the server browser session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/browser', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `API ${res.status}`);
        if (cancelled) return;
        setSessionId(data.id);
        sessionRef.current = data.id;
        setViewport({ width: data.width ?? 1280, height: data.height ?? 800 });
        setCurrentUrl(data.url ?? url);
        setStatus('ready');
      } catch (e) {
        if (!cancelled) {
          setError(String(e instanceof Error ? e.message : e));
          setStatus('error');
        }
      }
    })();
    return () => {
      cancelled = true;
      // Tear the session down if the user closed without confirming.
      const id = sessionRef.current;
      if (id && !confirmedRef.current) {
        void fetch(`/api/browser/${id}`, { method: 'DELETE' });
      }
    };
  }, [url]);

  // Poll screenshots.
  useEffect(() => {
    if (status !== 'ready') return;
    const t = setInterval(() => setTick((n) => n + 1), 800);
    return () => clearInterval(t);
  }, [status]);

  const sendInput = useCallback(
    async (ev: Record<string, unknown>) => {
      const id = sessionRef.current;
      if (!id) return;
      try {
        const res = await fetch(`/api/browser/${id}/input`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ev),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.url) setCurrentUrl(data.url);
        }
      } catch {
        /* transient */
      }
      // Refresh promptly so the user sees the effect of their action.
      setTimeout(() => setTick((n) => n + 1), 200);
      setTimeout(() => setTick((n) => n + 1), 600);
    },
    [],
  );

  function toPageCoords(e: React.MouseEvent) {
    const img = imgRef.current;
    if (!img) return { x: 0, y: 0 };
    const rect = img.getBoundingClientRect();
    return {
      x: Math.round(((e.clientX - rect.left) / rect.width) * viewport.width),
      y: Math.round(((e.clientY - rect.top) / rect.height) * viewport.height),
    };
  }

  function onImgClick(e: React.MouseEvent) {
    const { x, y } = toPageCoords(e);
    void sendInput({ type: 'click', x, y });
    surfaceRef.current?.focus();
  }

  function onWheel(e: React.WheelEvent) {
    void sendInput({ type: 'scroll', deltaY: Math.round(e.deltaY) });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      void sendInput({ type: 'text', text: e.key });
    } else if (SPECIAL_KEYS.has(e.key)) {
      e.preventDefault();
      void sendInput({ type: 'key', key: e.key });
    }
  }

  async function confirmScan() {
    const id = sessionRef.current;
    if (!id) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/browser/${id}/confirm`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `API ${res.status}`);
      confirmedRef.current = true;
      window.location.assign(`/scans/${data.scanId}`);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setBusy(false);
    }
  }

  async function cancel() {
    const id = sessionRef.current;
    if (id) void fetch(`/api/browser/${id}`, { method: 'DELETE' });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/70 p-4 backdrop-blur-sm">
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Top bar with the CTAs */}
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
          <button
            onClick={cancel}
            className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <div className="min-w-0 flex-1 truncate rounded-lg bg-slate-100 px-3 py-1.5 text-center text-xs text-slate-500">
            {currentUrl}
          </div>
          <button
            onClick={confirmScan}
            disabled={busy || status !== 'ready'}
            className="rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Starting scan…' : 'Confirm scan'}
          </button>
        </div>

        <p className="border-b border-slate-100 bg-slate-50 px-4 py-1.5 text-center text-xs text-slate-500">
          Live view of a real browser on the server. Click and type to log in or navigate, then
          Confirm scan to scan the page you’re on (accessibility + security).
        </p>

        {/* Live view */}
        <div className="relative flex-1 overflow-auto bg-slate-100">
          {status === 'starting' && (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Launching browser…
            </div>
          )}
          {status === 'error' && (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-red-600">
              {error ?? 'Could not start the browser session.'}
            </div>
          )}
          {status === 'ready' && sessionId && (
            <div
              ref={surfaceRef}
              tabIndex={0}
              onKeyDown={onKeyDown}
              className="mx-auto w-full max-w-5xl outline-none"
            >
              <img
                ref={imgRef}
                src={`/api/browser/${sessionId}/screenshot?t=${tick}`}
                alt="Live browser preview"
                draggable={false}
                onClick={onImgClick}
                onWheel={onWheel}
                className="block w-full cursor-crosshair select-none"
              />
            </div>
          )}
          {error && status === 'ready' && (
            <p className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded bg-red-600 px-3 py-1 text-xs text-white">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
