import type { PrRef } from './parse-url.js';

export interface ChangedFile {
  filename: string;
  status: string;
  patch?: string;
}
export interface PrData {
  title: string;
  body: string;
  files: ChangedFile[];
}

export type FetchImpl = typeof fetch;

const GH_API = 'https://api.github.com';

function headers(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'qa-prism', // GitHub rejects requests without a User-Agent
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

/**
 * Fetch a PR's title/body and its changed files (with diffs) via the GitHub
 * REST API. Throws on a non-OK response (rate limit, private repo without a
 * token, not found) so the caller can surface a clear error.
 */
export async function fetchPr(
  ref: PrRef,
  token: string | undefined,
  fetchImpl: FetchImpl,
): Promise<PrData> {
  const base = `${GH_API}/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`;

  const prRes = await fetchImpl(base, { headers: headers(token) });
  if (!prRes.ok) {
    throw new Error(await ghError(prRes, 'pull request'));
  }
  const pr = (await prRes.json()) as { title?: string; body?: string };

  const filesRes = await fetchImpl(`${base}/files?per_page=100`, { headers: headers(token) });
  if (!filesRes.ok) {
    throw new Error(await ghError(filesRes, 'changed files'));
  }
  const files = (await filesRes.json()) as ChangedFile[];

  return {
    title: pr.title ?? '',
    body: pr.body ?? '',
    files: files.map((f) => ({ filename: f.filename, status: f.status, patch: f.patch })),
  };
}

async function ghError(res: Response, what: string): Promise<string> {
  if (res.status === 404) return `GitHub returned 404 for the ${what} — private repo without a token, or wrong URL.`;
  if (res.status === 403) return `GitHub returned 403 for the ${what} — rate limited or forbidden. Add a GitHub token.`;
  return `GitHub returned ${res.status} for the ${what}.`;
}
