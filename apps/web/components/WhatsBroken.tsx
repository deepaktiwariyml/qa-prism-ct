'use client';

import { useEffect, useState } from 'react';
import { usePersistentState } from '@/lib/usePersistentState';
import { UsageChip } from '@/components/UsageChip';
import { SEVERITY_BADGE } from '@/lib/ui';
import { parseFile, ACCEPTED_EXTENSIONS, type ParsedDoc } from '@/lib/parseDocs';
import type { CallUsage } from '@/lib/usage';

// --- Response shape (mirrors @qa-prism/breakage-analyser) ---
type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
interface Evidence {
  kind: 'pr' | 'jira' | 'doc' | 'testcase';
  ref: string;
  note?: string;
}
interface Analysis {
  summary: string;
  riskScore: { level: RiskLevel; confidence: number; rationale: string };
  predictedBrokenAreas: Array<{ area: string; severity: RiskLevel; why: string; evidence: Evidence[] }>;
  impactedModules: Array<{ name: string; reason: string; evidence: Evidence[] }>;
  impactedApis: Array<{ endpoint: string; change: string; evidence: Evidence[] }>;
  impactedTestCases: Array<{
    tcId: string;
    title: string;
    verdict: 'impacted' | 'partially-impacted' | 'obsolete';
    confidence: number;
    reason: string;
    evidence: Evidence[];
  }>;
  missingCoverage: Array<{ area: string; gap: string; evidence: Evidence[] }>;
  recommendedTestCases: Array<{ title: string; type: string; steps: string[]; rationale: string; evidence: Evidence[] }>;
  suggestedRegressionSuite: { smoke: string[]; regression: string[]; rationale: string };
}
interface Manifest {
  prs: Array<{ id: string; label: string; url?: string }>;
  jira: Array<{ key: string; summary: string; url?: string }>;
  requirementDocs: Array<{ id: string; name: string }>;
  testCaseDocs: Array<{ id: string; name: string; count: number }>;
}
interface Result {
  analysis: Analysis;
  manifest: Manifest;
  limitations: string[];
  usage?: CallUsage;
}

interface PrRow {
  provider: 'github' | 'compare' | 'paste';
  url: string;
  rawDiff: string;
  repoContext: string;
}
const EMPTY_PR: PrRow = { provider: 'github', url: '', rawDiff: '', repoContext: '' };

function riskBadge(level: RiskLevel): string {
  return SEVERITY_BADGE[level.toLowerCase() as keyof typeof SEVERITY_BADGE] ?? SEVERITY_BADGE.info;
}

// Plain-language help, accurate to how the feature actually works.
const HOW_STEPS: Array<{ title: string; body: string }> = [
  {
    title: 'Add your inputs',
    body: 'Add one or more pull requests (a GitHub link, a whole release via a Compare link, or a pasted diff for Bitbucket / GitLab / Azure), pick Jira tickets or an epic, and upload your test cases and requirement/design docs. Anything else worth knowing goes in the “Additional context” box. Use whatever mix you have — nothing is required.',
  },
  {
    title: 'Your files are read in your browser',
    body: 'Excel, CSV, Word, PDF, Markdown, and JSON are read right here on your machine. Only the extracted text is sent for analysis — the original files never leave your computer.',
  },
  {
    title: 'It studies each input on its own',
    body: 'First it summarizes what each PR actually changes, pulls the requirements and acceptance criteria out of your documents, and tidies your uploaded test cases into a clean list.',
  },
  {
    title: 'It pulls in your Jira',
    body: 'If you selected tickets, it fetches their summary, description, acceptance criteria, labels, and linked issues. Choose an epic and it pulls in that epic’s child tickets too.',
  },
  {
    title: 'It connects the dots',
    body: 'Then it does one focused pass that links the code changes to your tests, requirements, and tickets — thinking about knock-on effects, not just the files that changed. For example, a change to invoice totals can ripple into discounts, taxes, and refunds.',
  },
  {
    title: 'You get an actionable report',
    body: 'An overall risk level, the areas most likely to break, impacted modules and APIs, which of your test cases to run (or new ones to add if you uploaded none), gaps with no coverage, and a suggested set of smoke and regression suites to run first.',
  },
  {
    title: 'Every point is traceable',
    body: 'Each finding links back to the exact PR, ticket, document, or test case it came from, so you can check the reasoning. Export the whole report to Markdown or PDF.',
  },
];

const TIPS: string[] = [
  'More inputs, sharper results. A PR on its own works, but adding requirements and your existing test cases makes the predictions far more grounded.',
  'Upload your existing test cases so it can point to the exact ones to re-run. With none uploaded, it suggests brand-new tests to write instead.',
  'Private GitHub repo? Add a GitHub token. On Bitbucket, GitLab, or Azure DevOps, paste the raw diff instead of a link.',
  'Use “Additional context” for things the code and docs don’t say — like “this only affects mobile” or “the payments flow is in scope”.',
  'Pick a Jira epic to pull in all its child tickets at once, instead of adding them one by one.',
  'Larger inputs cost a little more and take a bit longer. Trim to what’s relevant for a faster, cheaper run.',
  'Treat it as a smart head-start, not a guarantee. Start by verifying the highest-risk items it flags.',
];

const COMPARE_STEPS: Array<{ title: string; body: string }> = [
  { title: 'Open your repository on GitHub', body: 'Go to the repo you want to analyze.' },
  {
    title: 'Open the Compare page',
    body: 'Click the branch dropdown and choose “Compare”, or just add /compare to the repo’s URL in the address bar.',
  },
  {
    title: 'Pick the “base” — where to compare from',
    body: 'Usually your last release: a tag like v1.2.0 or a release branch. This is the starting point.',
  },
  {
    title: 'Pick the “head” — where to compare to',
    body: 'Usually main (or the new release branch). GitHub now shows every change between the two points.',
  },
  {
    title: 'Copy the URL and paste it here',
    body: 'Copy it straight from your browser’s address bar. It looks like: https://github.com/org/repo/compare/v1.2.0...main',
  },
];

const HELP_TITLES: Record<'how' | 'tips' | 'compare', string> = {
  how: 'How it works',
  tips: 'Tips for better results',
  compare: 'How to get a compare URL',
};

function HelpModal({ which, onClose }: { which: 'how' | 'tips' | 'compare'; onClose: () => void }) {
  const steps = which === 'how' ? HOW_STEPS : which === 'compare' ? COMPARE_STEPS : null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{HELP_TITLES[which]}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            ✕
          </button>
        </div>
        <div className="overflow-auto px-5 py-4">
          {steps ? (
            <ol className="space-y-4">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 text-xs font-semibold text-white">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-medium text-slate-800">{s.title}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <ul className="space-y-3">
              {TIPS.map((t, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed text-slate-700">
                  <span className="mt-0.5 shrink-0 text-indigo-500">•</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export function WhatsBroken() {
  // Inputs (small, persisted). Tokens and parsed docs are not persisted.
  const [prs, setPrs] = usePersistentState<PrRow[]>('qa-prism:wb:prs', [{ ...EMPTY_PR }]);
  const [githubToken, setGithubToken] = useState('');
  const [jiraSelected, setJiraSelected] = usePersistentState<Array<{ key: string; summary: string }>>('qa-prism:wb:jira', []);
  const [epicKey, setEpicKey] = usePersistentState('qa-prism:wb:epic', '');
  const [includeComments, setIncludeComments] = usePersistentState('qa-prism:wb:comments', false);
  const [additionalContext, setAdditionalContext] = usePersistentState('qa-prism:wb:context', '');
  // Persisted so inputs and the last result survive navigating away and back.
  const [reqDocs, setReqDocs] = usePersistentState<ParsedDoc[]>('qa-prism:wb:reqDocs', []);
  const [tcDocs, setTcDocs] = usePersistentState<ParsedDoc[]>('qa-prism:wb:tcDocs', []);

  const [busy, setBusy] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = usePersistentState<Result | null>('qa-prism:wb:result', null);
  const [help, setHelp] = useState<'how' | 'tips' | 'compare' | null>(null);

  // --- Jira typeahead (reuses the existing search endpoint) ---
  const [jiraQuery, setJiraQuery] = useState('');
  const [jiraResults, setJiraResults] = useState<Array<{ key: string; summary: string }>>([]);
  const [jiraSearching, setJiraSearching] = useState(false);
  useEffect(() => {
    const q = jiraQuery.trim();
    if (q.length < 2) {
      setJiraResults([]);
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
  }, [jiraQuery]);

  function addJira(item: { key: string; summary: string }) {
    setJiraSelected((prev) => (prev.some((p) => p.key === item.key) ? prev : [...prev, item]));
    setJiraQuery('');
    setJiraResults([]);
  }

  // --- PR rows ---
  const setPr = (i: number, patch: Partial<PrRow>) => setPrs((prev) => prev.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const addPr = () => setPrs((prev) => [...prev, { ...EMPTY_PR }]);
  const removePr = (i: number) => setPrs((prev) => (prev.length > 1 ? prev.filter((_, j) => j !== i) : prev));

  // --- File uploads ---
  async function onFiles(files: FileList | null, setDocs: React.Dispatch<React.SetStateAction<ParsedDoc[]>>) {
    if (!files || !files.length) return;
    setParsing(true);
    try {
      const parsed = await Promise.all(Array.from(files).map(parseFile));
      setDocs((prev) => [...prev, ...parsed]);
    } finally {
      setParsing(false);
    }
  }

  const hasInput =
    prs.some((p) => (p.provider === 'paste' ? p.rawDiff.trim() : p.url.trim())) ||
    reqDocs.some((d) => d.text.trim()) ||
    tcDocs.some((d) => d.text.trim() || d.structured?.length) ||
    jiraSelected.length > 0 ||
    epicKey.trim().length > 0 ||
    additionalContext.trim().length > 0;

  async function analyze() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const payload = {
        prs: prs
          .filter((p) => (p.provider === 'paste' ? p.rawDiff.trim() : p.url.trim()))
          .map((p) =>
            p.provider === 'paste'
              ? { provider: 'paste', rawDiff: p.rawDiff, repoContext: p.repoContext.trim() || undefined }
              : { provider: p.provider, url: p.url.trim() },
          ),
        githubToken: githubToken.trim() || undefined,
        jira:
          jiraSelected.length || epicKey.trim()
            ? { keys: jiraSelected.map((j) => j.key), epicKey: epicKey.trim() || undefined, includeComments }
            : undefined,
        additionalContext: additionalContext.trim() || undefined,
        requirementDocs: reqDocs
          .filter((d) => d.text.trim())
          .map((d, i) => ({ id: `REQ${i + 1}`, name: d.name, text: d.text })),
        testCaseDocs: tcDocs
          .filter((d) => d.text.trim() || d.structured?.length)
          .map((d, i) => ({ id: `TCDOC${i + 1}`, name: d.name, text: d.text, structured: d.structured })),
      };
      const res = await fetch('/api/breakage/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `API ${res.status}`);
      setResult(data as Result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-indigo-600">Pre-QA regression radar</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Predictive Analysis</h1>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => setHelp('how')}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            How it works
          </button>
          <button
            onClick={() => setHelp('tips')}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            💡 Tips
          </button>
        </div>
      </div>
      <p className="mt-3 max-w-2xl text-slate-600">
        Point it at your PRs, requirement docs, test cases, and Jira. It predicts what may be broken,
        which tests to run, what coverage is missing, and how risky the change is — every prediction
        citing its source.
      </p>

      {help && <HelpModal which={help} onClose={() => setHelp(null)} />}

      <div className="mt-8 space-y-6">
        <PrSection prs={prs} setPr={setPr} addPr={addPr} removePr={removePr} githubToken={githubToken} setGithubToken={setGithubToken} onCompareHelp={() => setHelp('compare')} />

        <JiraSection
          selected={jiraSelected}
          remove={(k) => setJiraSelected((prev) => prev.filter((p) => p.key !== k))}
          query={jiraQuery}
          setQuery={setJiraQuery}
          results={jiraResults}
          searching={jiraSearching}
          pick={addJira}
          epicKey={epicKey}
          setEpicKey={setEpicKey}
          includeComments={includeComments}
          setIncludeComments={setIncludeComments}
          extraContext={additionalContext}
          setExtraContext={setAdditionalContext}
        />

        <UploadSection title="Test cases" hint="Excel, CSV, Word, PDF, Markdown, JSON, TestRail / Xray exports" docs={tcDocs} setDocs={setTcDocs} onFiles={onFiles} />
        <UploadSection title="Requirement & design docs" hint="SOW, BRD, PRD, TAD, functional / architecture docs — any format" docs={reqDocs} setDocs={setReqDocs} onFiles={onFiles} />
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={analyze}
          disabled={busy || parsing || !hasInput}
          className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Analyzing…' : 'Predict what breaks'}
        </button>
        {parsing && <span className="text-sm text-slate-500">Parsing files…</span>}
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {busy && <LoadingSkeleton />}
      {result && !busy && <Report result={result} />}
    </div>
  );
}

// --- Sections ------------------------------------------------------------

function SectionCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">{children}</div>;
}
function Label({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold text-slate-800">{children}</h2>;
}

function PrSection(props: {
  prs: PrRow[];
  setPr: (i: number, patch: Partial<PrRow>) => void;
  addPr: () => void;
  removePr: (i: number) => void;
  githubToken: string;
  setGithubToken: (v: string) => void;
  onCompareHelp: () => void;
}) {
  const { prs, setPr, addPr, removePr, githubToken, setGithubToken, onCompareHelp } = props;
  return (
    <SectionCard>
      <div className="flex items-center justify-between">
        <Label>Pull requests</Label>
        <button onClick={addPr} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
          + Add PR
        </button>
      </div>
      <div className="mt-3 space-y-3">
        {prs.map((pr, i) => (
          <div key={i} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <div className="flex items-center gap-2">
              <select
                value={pr.provider}
                onChange={(e) => setPr(i, { provider: e.target.value as PrRow['provider'] })}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-indigo-500"
              >
                <option value="github">GitHub PR</option>
                <option value="compare">Compare / Release</option>
                <option value="paste">Paste diff</option>
              </select>
              {pr.provider === 'paste' ? (
                <input
                  type="text"
                  value={pr.repoContext}
                  onChange={(e) => setPr(i, { repoContext: e.target.value })}
                  placeholder="Optional: what/where this diff is (e.g. Bitbucket · payments-service)"
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
                />
              ) : (
                <input
                  type="text"
                  value={pr.url}
                  onChange={(e) => setPr(i, { url: e.target.value })}
                  placeholder={
                    pr.provider === 'compare'
                      ? 'https://github.com/org/repo/compare/v1.2.0...main'
                      : 'https://github.com/org/repo/pull/123'
                  }
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
                />
              )}
              {prs.length > 1 && (
                <button onClick={() => removePr(i)} title="Remove" className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700">
                  ✕
                </button>
              )}
            </div>
            {pr.provider === 'compare' && (
              <p className="mt-1.5 text-xs text-slate-400">
                Analyzes everything that changed between two points (e.g. your last release → main).{' '}
                <button onClick={onCompareHelp} className="font-medium text-indigo-600 hover:underline">
                  How to get this?
                </button>
              </p>
            )}
            {pr.provider === 'paste' && (
              <textarea
                value={pr.rawDiff}
                onChange={(e) => setPr(i, { rawDiff: e.target.value })}
                rows={5}
                placeholder="Paste a unified diff / patch here (works for Bitbucket, GitLab, Azure DevOps, or any git diff)."
                className="mt-2 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-indigo-500"
              />
            )}
          </div>
        ))}
      </div>
      <input
        type="password"
        value={githubToken}
        onChange={(e) => setGithubToken(e.target.value)}
        placeholder="GitHub token (optional — for private repos; never stored)"
        autoComplete="off"
        className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
      />
    </SectionCard>
  );
}

function JiraSection(props: {
  selected: Array<{ key: string; summary: string }>;
  remove: (k: string) => void;
  query: string;
  setQuery: (v: string) => void;
  results: Array<{ key: string; summary: string }>;
  searching: boolean;
  pick: (item: { key: string; summary: string }) => void;
  epicKey: string;
  setEpicKey: (v: string) => void;
  includeComments: boolean;
  setIncludeComments: (v: boolean) => void;
  extraContext: string;
  setExtraContext: (v: string) => void;
}) {
  const { selected, remove, query, setQuery, results, searching, pick, epicKey, setEpicKey, includeComments, setIncludeComments, extraContext, setExtraContext } = props;
  return (
    <SectionCard>
      <Label>Jira</Label>
      <div className="mt-3 flex flex-wrap gap-2">
        {selected.map((j) => (
          <span key={j.key} className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
            <span className="font-mono">{j.key}</span>
            <button onClick={() => remove(j.key)} className="text-indigo-400 hover:text-indigo-700">
              ✕
            </button>
          </span>
        ))}
      </div>
      <div className="relative mt-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tickets by key or title to add…"
          autoComplete="off"
          className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
        />
        {(searching || results.length > 0) && (
          <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            {searching && results.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">Searching…</li>}
            {results.map((r) => (
              <li key={r.key}>
                <button onClick={() => pick(r)} className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-indigo-50">
                  <span className="shrink-0 font-mono text-xs font-semibold text-indigo-600">{r.key}</span>
                  <span className="truncate text-slate-600">{r.summary}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          value={epicKey}
          onChange={(e) => setEpicKey(e.target.value)}
          placeholder="Epic key (optional — pulls its child issues)"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={includeComments} onChange={(e) => setIncludeComments(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-indigo-600" />
          Include comments
        </label>
      </div>
      <label className="mb-1.5 mt-4 block text-xs font-medium uppercase tracking-wide text-slate-500">
        Additional context <span className="normal-case text-slate-400">— optional, free text</span>
      </label>
      <textarea
        value={extraContext}
        onChange={(e) => setExtraContext(e.target.value)}
        rows={3}
        placeholder="Anything else the analysis should know — non-obvious scope, environment, known risks, related work…"
        className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
      />
    </SectionCard>
  );
}

function UploadSection(props: {
  title: string;
  hint: string;
  docs: ParsedDoc[];
  setDocs: React.Dispatch<React.SetStateAction<ParsedDoc[]>>;
  onFiles: (files: FileList | null, setDocs: React.Dispatch<React.SetStateAction<ParsedDoc[]>>) => void;
}) {
  const { title, hint, docs, setDocs, onFiles } = props;
  return (
    <SectionCard>
      <Label>{title}</Label>
      <p className="mt-0.5 text-xs text-slate-400">{hint}</p>
      <label className="mt-3 flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500 hover:border-indigo-400 hover:text-indigo-600">
        <input type="file" multiple accept={ACCEPTED_EXTENSIONS} className="hidden" onChange={(e) => onFiles(e.target.files, setDocs)} />
        + Choose files to upload
      </label>
      {docs.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {docs.map((d, i) => (
            <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[10px] uppercase text-slate-600">{d.kind}</span>
                <span className="truncate text-slate-700">{d.name}</span>
                {d.error ? (
                  <span className="text-xs text-red-600">{d.error}</span>
                ) : (
                  <span className="text-xs text-slate-400">
                    {d.structured?.length ? `${d.structured.length} rows` : `${d.text.length.toLocaleString()} chars`}
                  </span>
                )}
              </span>
              <button onClick={() => setDocs((prev) => prev.filter((_, j) => j !== i))} className="shrink-0 text-slate-400 hover:text-slate-700">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

// --- Loading + Report ----------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="mt-8">
      <div className="flex items-center gap-3 text-slate-500">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
        <span className="text-sm">Reading changes, mapping tests, and predicting regressions…</span>
      </div>
      <div className="mt-4 space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-2xl border border-slate-200 p-4">
            <div className="h-4 w-1/3 animate-pulse rounded bg-slate-200" />
            <div className="mt-3 h-3 w-full animate-pulse rounded bg-slate-100" />
            <div className="mt-2 h-3 w-5/6 animate-pulse rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

function EvidenceChips({ evidence, manifest }: { evidence: Evidence[]; manifest: Manifest }) {
  if (!evidence?.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {evidence.map((e, i) => {
        let text = e.ref;
        let url: string | undefined;
        if (e.kind === 'pr') {
          const pr = manifest.prs.find((p) => p.id === e.ref);
          if (pr) {
            text = pr.label;
            url = pr.url;
          }
        } else if (e.kind === 'jira') {
          url = manifest.jira.find((j) => j.key === e.ref)?.url;
        } else if (e.kind === 'doc') {
          text = manifest.requirementDocs.find((d) => d.id === e.ref)?.name ?? e.ref;
        }
        const cls = 'inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600';
        const inner = (
          <>
            <span className="uppercase text-slate-400">{e.kind}</span>
            <span className="font-mono">{text}</span>
          </>
        );
        return url ? (
          <a key={i} href={url} target="_blank" rel="noreferrer" className={`${cls} hover:bg-slate-200`} title={e.note}>
            {inner}
          </a>
        ) : (
          <span key={i} className={cls} title={e.note}>
            {inner}
          </span>
        );
      })}
    </div>
  );
}

function ReportSection({ n, title, count, children }: { n: number; title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 text-xs font-semibold text-white">{n}</span>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {count != null && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{count}</span>}
      </div>
      {children}
    </section>
  );
}

function RecommendedCases({ cases, manifest }: { cases: Analysis['recommendedTestCases']; manifest: Manifest }) {
  return (
    <div className="space-y-3">
      {cases.map((t, i) => (
        <div key={i} className="rounded-lg border border-slate-100 p-3">
          <div className="flex items-center gap-2">
            <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">{t.type}</span>
            <span className="font-medium text-slate-800">{t.title}</span>
          </div>
          {t.steps.length > 0 && (
            <ol className="mt-1 list-decimal pl-5 text-sm text-slate-600">
              {t.steps.map((s, j) => (
                <li key={j}>{s}</li>
              ))}
            </ol>
          )}
          <p className="mt-1 text-sm text-slate-500">{t.rationale}</p>
          <EvidenceChips evidence={t.evidence} manifest={manifest} />
        </div>
      ))}
    </div>
  );
}

function Report({ result }: { result: Result }) {
  const { analysis: a, manifest } = result;
  const verdictColor: Record<string, string> = {
    impacted: 'bg-orange-100 text-orange-800',
    'partially-impacted': 'bg-amber-100 text-amber-800',
    obsolete: 'bg-slate-200 text-slate-600',
  };
  // Whether the user uploaded any test cases. When they did, the "Impacted Test
  // Cases" section maps those; when they didn't, it surfaces the recommended
  // (new) test cases instead — and we drop the separate recommended section to
  // avoid showing the same list twice.
  const hasUploadedTCs = (manifest.testCaseDocs ?? []).reduce((n, d) => n + d.count, 0) > 0;

  return (
    <div className="mt-8 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`rounded-lg px-3 py-1 text-sm font-bold ${riskBadge(a.riskScore.level)}`}>{a.riskScore.level} RISK</span>
          <span className="text-sm text-slate-500">Confidence {a.riskScore.confidence}%</span>
        </div>
        <div className="flex items-center gap-2">
          {result.usage && <UsageChip usage={result.usage} />}
          <button onClick={() => downloadMarkdown(result)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
            ↓ Markdown
          </button>
          <button onClick={() => downloadPdf(result)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
            ↓ PDF
          </button>
        </div>
      </div>

      {result.limitations.length > 0 && (
        <div className="rounded-lg bg-amber-50 px-4 py-2 text-xs text-amber-800">{result.limitations.join(' ')}</div>
      )}

      <ReportSection n={1} title="AI Summary">
        <p className="whitespace-pre-wrap text-sm text-slate-700">{a.summary}</p>
        <p className="mt-2 text-sm text-slate-500">{a.riskScore.rationale}</p>
      </ReportSection>

      <ReportSection n={2} title="Predicted Broken Areas" count={a.predictedBrokenAreas.length}>
        <div className="space-y-3">
          {a.predictedBrokenAreas.map((b, i) => (
            <div key={i} className="rounded-lg border border-slate-100 p-3">
              <div className="flex items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${riskBadge(b.severity)}`}>{b.severity}</span>
                <span className="font-medium text-slate-800">{b.area}</span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{b.why}</p>
              <EvidenceChips evidence={b.evidence} manifest={manifest} />
            </div>
          ))}
        </div>
      </ReportSection>

      <div className="grid gap-4 md:grid-cols-2">
        <ReportSection n={3} title="Impacted Modules" count={a.impactedModules.length}>
          <ul className="space-y-2">
            {a.impactedModules.map((m, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium text-slate-800">{m.name}</span>
                <span className="text-slate-600"> — {m.reason}</span>
                <EvidenceChips evidence={m.evidence} manifest={manifest} />
              </li>
            ))}
          </ul>
        </ReportSection>
        <ReportSection n={4} title="Impacted APIs" count={a.impactedApis.length}>
          <ul className="space-y-2">
            {a.impactedApis.map((m, i) => (
              <li key={i} className="text-sm">
                <span className="font-mono text-xs text-slate-800">{m.endpoint}</span>
                <span className="text-slate-600"> — {m.change}</span>
                <EvidenceChips evidence={m.evidence} manifest={manifest} />
              </li>
            ))}
          </ul>
        </ReportSection>
      </div>

      {hasUploadedTCs ? (
        <ReportSection n={5} title="Impacted Test Cases" count={a.impactedTestCases.length}>
          {a.impactedTestCases.length === 0 ? (
            <p className="text-sm text-slate-500">None of the uploaded test cases appear impacted by these changes.</p>
          ) : (
            <div className="space-y-2">
              {a.impactedTestCases.map((t, i) => (
                <div key={i} className="rounded-lg border border-slate-100 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${verdictColor[t.verdict] ?? 'bg-slate-100'}`}>{t.verdict}</span>
                    <span className="font-mono text-xs text-slate-400">{t.tcId}</span>
                    <span className="font-medium text-slate-800">{t.title}</span>
                    <span className="text-xs text-slate-400">· {t.confidence}%</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{t.reason}</p>
                  <EvidenceChips evidence={t.evidence} manifest={manifest} />
                </div>
              ))}
            </div>
          )}
        </ReportSection>
      ) : (
        <ReportSection n={5} title="Test Cases to Run" count={a.recommendedTestCases.length}>
          <p className="mb-3 text-sm text-slate-500">
            No test cases were uploaded, so here are the tests to create and run for this change.
          </p>
          <RecommendedCases cases={a.recommendedTestCases} manifest={manifest} />
        </ReportSection>
      )}

      <ReportSection n={6} title="Missing Test Coverage" count={a.missingCoverage.length}>
        <ul className="space-y-2">
          {a.missingCoverage.map((m, i) => (
            <li key={i} className="text-sm">
              <span className="font-medium text-slate-800">{m.area}</span>
              <span className="text-slate-600"> — {m.gap}</span>
              <EvidenceChips evidence={m.evidence} manifest={manifest} />
            </li>
          ))}
        </ul>
      </ReportSection>

      {hasUploadedTCs && (
        <ReportSection n={7} title="Recommended New Test Cases" count={a.recommendedTestCases.length}>
          <RecommendedCases cases={a.recommendedTestCases} manifest={manifest} />
        </ReportSection>
      )}

      <ReportSection n={8} title="Suggested Regression Suite">
        <div className="grid gap-4 sm:grid-cols-2">
          <SuiteList title="Smoke" items={a.suggestedRegressionSuite.smoke} />
          <SuiteList title="Regression" items={a.suggestedRegressionSuite.regression} />
        </div>
        <p className="mt-3 text-sm text-slate-500">{a.suggestedRegressionSuite.rationale}</p>
      </ReportSection>
    </div>
  );
}

function SuiteList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <ul className="mt-1 space-y-1">
        {items.map((s, i) => (
          <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
            <span className="text-green-600">✓</span>
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Export --------------------------------------------------------------

function toMarkdown(result: Result): string {
  const a = result.analysis;
  const ev = (e: Evidence[]) => (e?.length ? ` _(evidence: ${e.map((x) => `${x.kind}:${x.ref}`).join(', ')})_` : '');
  const lines: string[] = [];
  lines.push(`# Predictive Analysis\n`);
  lines.push(`**Risk: ${a.riskScore.level}** (confidence ${a.riskScore.confidence}%) — ${a.riskScore.rationale}\n`);
  lines.push(`## AI Summary\n\n${a.summary}\n`);
  lines.push(`## Predicted Broken Areas`);
  a.predictedBrokenAreas.forEach((b) => lines.push(`- **[${b.severity}] ${b.area}** — ${b.why}${ev(b.evidence)}`));
  lines.push(`\n## Impacted Modules`);
  a.impactedModules.forEach((m) => lines.push(`- **${m.name}** — ${m.reason}${ev(m.evidence)}`));
  lines.push(`\n## Impacted APIs`);
  a.impactedApis.forEach((m) => lines.push(`- \`${m.endpoint}\` — ${m.change}${ev(m.evidence)}`));
  lines.push(`\n## Impacted Test Cases`);
  a.impactedTestCases.forEach((t) => lines.push(`- [${t.verdict} · ${t.confidence}%] ${t.tcId} ${t.title} — ${t.reason}${ev(t.evidence)}`));
  lines.push(`\n## Missing Coverage`);
  a.missingCoverage.forEach((m) => lines.push(`- **${m.area}** — ${m.gap}${ev(m.evidence)}`));
  lines.push(`\n## Recommended New Test Cases`);
  a.recommendedTestCases.forEach((t) => lines.push(`- [${t.type}] ${t.title} — ${t.rationale}${ev(t.evidence)}`));
  lines.push(`\n## Suggested Regression Suite`);
  lines.push(`**Smoke:** ${a.suggestedRegressionSuite.smoke.join(', ')}`);
  lines.push(`**Regression:** ${a.suggestedRegressionSuite.regression.join(', ')}`);
  lines.push(`\n${a.suggestedRegressionSuite.rationale}`);
  return lines.join('\n');
}

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadMarkdown(result: Result) {
  download('predictive-analysis.md', new Blob([toMarkdown(result)], { type: 'text/markdown' }));
}

async function downloadPdf(result: Result) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 40;
  const width = doc.internal.pageSize.getWidth() - margin * 2;
  let y = margin;
  const write = (text: string, size = 10, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size);
    for (const line of doc.splitTextToSize(text, width) as string[]) {
      if (y > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += size + 4;
    }
  };
  // Strip markdown markers for a clean text PDF.
  toMarkdown(result)
    .split('\n')
    .forEach((raw) => {
      const line = raw.replace(/[*_`]/g, '');
      if (line.startsWith('# ')) write(line.slice(2), 16, true);
      else if (line.startsWith('## ')) write(line.slice(3), 13, true);
      else if (line.trim()) write(line);
      else y += 6;
    });
  doc.save('predictive-analysis.pdf');
}
