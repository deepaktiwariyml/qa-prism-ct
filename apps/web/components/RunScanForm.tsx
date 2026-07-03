'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function RunScanForm() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Authenticated (scripted-login) scan.
  const [showAuth, setShowAuth] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loginUrl, setLoginUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [usernameSelector, setUsernameSelector] = useState('');
  const [passwordSelector, setPasswordSelector] = useState('');
  const [submitSelector, setSubmitSelector] = useState('');

  async function startScan(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
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

  function scan(e: React.FormEvent) {
    e.preventDefault();
    if (!url) return;
    const body: Record<string, unknown> = { name: url, target: { kind: 'url', value: url } };
    if (repoPath.trim()) body.options = { repoPath: repoPath.trim() };
    void startScan(body);
  }

  function authScan() {
    if (!url || !username || !password) return;
    const auth: Record<string, string> = { username, password };
    if (loginUrl.trim()) auth.loginUrl = loginUrl.trim();
    if (usernameSelector.trim()) auth.usernameSelector = usernameSelector.trim();
    if (passwordSelector.trim()) auth.passwordSelector = passwordSelector.trim();
    if (submitSelector.trim()) auth.submitSelector = submitSelector.trim();
    void startScan({ name: url, target: { kind: 'url', value: url }, auth });
  }

  const inputCls =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500';

  return (
    <form onSubmit={scan} className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Run a scan</h2>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          className={`flex-1 ${inputCls}`}
        />
        <input
          type="text"
          value={repoPath}
          onChange={(e) => setRepoPath(e.target.value)}
          placeholder="optional repo path (automation)"
          className={`flex-1 ${inputCls}`}
        />
        <button
          type="submit"
          disabled={busy || !url}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? 'Starting…' : 'Scan'}
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Scans all pillars (accessibility, performance, security) and captures a screenshot of the
        page.
      </p>

      <div className="mt-2">
        <button
          type="button"
          onClick={() => setShowAuth((v) => !v)}
          className="text-xs text-slate-500 underline underline-offset-2 hover:text-slate-700"
        >
          {showAuth ? 'hide authenticated scan' : 'authenticated scan (log in first)'}
        </button>
      </div>

      {showAuth && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="mb-3 text-xs text-slate-500">
            We log in headlessly with these credentials, then scan the page above while
            authenticated. Credentials are used only for this scan and never stored. Not suitable
            for SSO/MFA logins.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="url"
              value={loginUrl}
              onChange={(e) => setLoginUrl(e.target.value)}
              placeholder="Login page URL (defaults to the URL above)"
              className={`sm:col-span-2 ${inputCls}`}
            />
            <input
              type="text"
              autoComplete="off"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username / email"
              className={inputCls}
            />
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className={inputCls}
            />
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="mt-3 text-xs text-slate-500 underline underline-offset-2 hover:text-slate-700"
          >
            {showAdvanced ? 'hide field selectors' : 'advanced: field selectors (optional)'}
          </button>
          {showAdvanced && (
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <input
                type="text"
                value={usernameSelector}
                onChange={(e) => setUsernameSelector(e.target.value)}
                placeholder="username selector"
                className={inputCls}
              />
              <input
                type="text"
                value={passwordSelector}
                onChange={(e) => setPasswordSelector(e.target.value)}
                placeholder="password selector"
                className={inputCls}
              />
              <input
                type="text"
                value={submitSelector}
                onChange={(e) => setSubmitSelector(e.target.value)}
                placeholder="submit selector"
                className={inputCls}
              />
            </div>
          )}

          <button
            type="button"
            onClick={authScan}
            disabled={busy || !url || !username || !password}
            className="mt-3 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Starting…' : 'Run authenticated scan'}
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">Could not start scan: {error}</p>}
    </form>
  );
}
