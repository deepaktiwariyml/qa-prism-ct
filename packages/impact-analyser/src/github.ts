import type { PrRef } from './parse-url.js';

export interface ChangedFile {
  filename: string;
  status: string;
  patch?: string;
}
export interface LinkedIssue {
  key: string; // e.g. "#123"
  url: string;
  title: string;
}
export interface PrData {
  title: string;
  body: string;
  branch: string; // head ref, e.g. "feature/SHOP-123-add-coupons"
  commitMessages: string[];
  linkedIssues: LinkedIssue[];
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
  const pr = (await prRes.json()) as {
    title?: string;
    body?: string;
    head?: { ref?: string };
  };

  const filesRes = await fetchImpl(`${base}/files?per_page=100`, { headers: headers(token) });
  if (!filesRes.ok) {
    throw new Error(await ghError(filesRes, 'changed files'));
  }
  const files = (await filesRes.json()) as ChangedFile[];

  // Commit messages and linked issues are best-effort — they enrich ticket
  // detection but must never fail the analysis.
  const commitMessages = await fetchCommitMessages(base, token, fetchImpl);
  const linkedIssues = token ? await fetchLinkedIssues(ref, token, fetchImpl) : [];

  return {
    title: pr.title ?? '',
    body: pr.body ?? '',
    branch: pr.head?.ref ?? '',
    commitMessages,
    linkedIssues,
    files: files.map((f) => ({ filename: f.filename, status: f.status, patch: f.patch })),
  };
}

/** Commit messages on the PR — a common home for ticket keys. Best-effort. */
async function fetchCommitMessages(
  base: string,
  token: string | undefined,
  fetchImpl: FetchImpl,
): Promise<string[]> {
  try {
    const res = await fetchImpl(`${base}/commits?per_page=100`, { headers: headers(token) });
    if (!res.ok) return [];
    const commits = (await res.json()) as Array<{ commit?: { message?: string } }>;
    return commits.map((c) => c.commit?.message ?? '').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Issues linked to the PR via GitHub's "Development" panel (closing
 * references). GraphQL requires auth, so this only runs with a token.
 * Best-effort — returns [] on any failure.
 */
async function fetchLinkedIssues(
  ref: PrRef,
  token: string,
  fetchImpl: FetchImpl,
): Promise<LinkedIssue[]> {
  try {
    const query =
      'query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){closingIssuesReferences(first:20){nodes{number url title}}}}}';
    const res = await fetchImpl(`${GH_API}/graphql`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'qa-prism',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables: { o: ref.owner, r: ref.repo, n: ref.number } }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      data?: {
        repository?: {
          pullRequest?: {
            closingIssuesReferences?: { nodes?: Array<{ number: number; url: string; title?: string }> };
          };
        };
      };
    };
    const nodes = data.data?.repository?.pullRequest?.closingIssuesReferences?.nodes ?? [];
    return nodes.map((nd) => ({ key: `#${nd.number}`, url: nd.url, title: nd.title ?? '' }));
  } catch {
    return [];
  }
}

async function ghError(res: Response, what: string): Promise<string> {
  if (res.status === 404) return `GitHub returned 404 for the ${what} — private repo without a token, or wrong URL.`;
  if (res.status === 403) return `GitHub returned 403 for the ${what} — rate limited or forbidden. Add a GitHub token.`;
  return `GitHub returned ${res.status} for the ${what}.`;
}
