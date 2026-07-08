import { fetchPr, parseGitHubPrUrl, type ChangedFile, type FetchImpl } from '@qa-prism/impact-analyser';
import type { PrInput } from './types.js';

/** Per-PR diff budget. PRs share the overall context; kept modest so several
 *  PRs fit. Overridable via BREAKAGE_MAX_PATCH_CHARS. */
const MAX_PATCH_CHARS = Number(process.env.BREAKAGE_MAX_PATCH_CHARS) || 120_000;

export interface ResolvedPr {
  id: string; // stable evidence id: PR1, PR2, …
  label: string; // "owner/repo#123" or "Pasted diff 1"
  url?: string;
  title: string;
  body: string;
  diffText: string; // bounded unified-diff text
  changedFiles: string[];
  truncated: boolean;
}

/** Concatenate GitHub file patches into one diff blob, bounded to the budget. */
function boundGithubFiles(files: ChangedFile[]): { text: string; changed: string[]; truncated: boolean } {
  let budget = MAX_PATCH_CHARS;
  let truncated = false;
  const parts: string[] = [];
  const changed: string[] = [];
  for (const f of files) {
    changed.push(f.filename);
    const header = `--- ${f.filename} (${f.status})`;
    if (!f.patch) {
      parts.push(`${header}\n(no textual diff — binary or too large)`);
      continue;
    }
    if (budget <= 0) {
      parts.push(`${header}\n(diff omitted — budget exhausted)`);
      truncated = true;
      continue;
    }
    if (f.patch.length > budget) {
      parts.push(`${header}\n${f.patch.slice(0, budget)}\n… (patch truncated)`);
      truncated = true;
      budget = 0;
    } else {
      parts.push(`${header}\n${f.patch}`);
      budget -= f.patch.length;
    }
  }
  return { text: parts.join('\n\n'), changed, truncated };
}

/** Best-effort filename extraction from a raw unified diff. */
function filesFromRawDiff(diff: string): string[] {
  const names = new Set<string>();
  for (const m of diff.matchAll(/^\+\+\+ b\/(.+)$/gm)) names.add(m[1]!.trim());
  for (const m of diff.matchAll(/^diff --git a\/(\S+) b\/\S+/gm)) names.add(m[1]!.trim());
  return [...names];
}

/**
 * Resolve every PR input into normalized, bounded diff text plus a manifest
 * label. GitHub is fetched via the reused impact-analyser fetcher; other
 * providers arrive as a pasted raw diff. One bad PR fails the whole request so
 * the caller can surface a clear error.
 */
export async function resolvePrs(
  prs: PrInput[],
  githubToken: string | undefined,
  fetchImpl: FetchImpl = fetch,
): Promise<ResolvedPr[]> {
  const out: ResolvedPr[] = [];
  let pasteCount = 0;
  for (let i = 0; i < prs.length; i++) {
    const id = `PR${i + 1}`;
    const pr = prs[i]!;
    if (pr.provider === 'github') {
      const ref = parseGitHubPrUrl(pr.url ?? '');
      if (!ref) throw new Error(`Not a GitHub pull request URL: ${pr.url ?? '(empty)'}`);
      const data = await fetchPr(ref, githubToken, fetchImpl);
      const bounded = boundGithubFiles(data.files);
      out.push({
        id,
        label: `${ref.owner}/${ref.repo}#${ref.number}`,
        url: pr.url,
        title: data.title,
        body: data.body,
        diffText: bounded.text,
        changedFiles: bounded.changed,
        truncated: bounded.truncated,
      });
    } else {
      pasteCount++;
      const raw = (pr.rawDiff ?? '').trim();
      if (!raw) throw new Error('A pasted PR has no diff content.');
      const truncated = raw.length > MAX_PATCH_CHARS;
      const diffText = truncated ? `${raw.slice(0, MAX_PATCH_CHARS)}\n… (diff truncated)` : raw;
      out.push({
        id,
        label: `Pasted diff ${pasteCount}`,
        title: pr.repoContext?.slice(0, 200) ?? `Pasted diff ${pasteCount}`,
        body: pr.repoContext ?? '',
        diffText,
        changedFiles: filesFromRawDiff(raw),
        truncated,
      });
    }
  }
  return out;
}
