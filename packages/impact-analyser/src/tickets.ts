/**
 * Best-effort extraction of issue-tracker references (Jira, Linear, …) from a
 * PR's text — title, body, branch name, and commit messages. Deterministic —
 * no LLM. "If available" means: link what we can.
 *
 * Explicit tracker URLs win (a Jira `…/browse/KEY` link, a Linear issue URL).
 * A bare key like `ABC-123` (common in branch names / commit messages) is
 * linked when we have a Jira host to build the URL from — either JIRA_BASE_URL
 * or a host inferred from a Jira URL seen elsewhere in the same PR.
 */
export interface TicketRef {
  key: string;
  url: string;
  source: 'jira' | 'linear' | 'other';
}

const JIRA_KEY = /[A-Z][A-Z0-9]+-\d+/;
const JIRA_KEY_G = /\b[A-Z][A-Z0-9]+-\d+\b/g;

function add(map: Map<string, TicketRef>, key: string, url: string, source: TicketRef['source']): void {
  const k = key.toUpperCase();
  // First writer wins so an explicit URL isn't overwritten by a constructed one.
  if (!map.has(k)) map.set(k, { key: k, url, source });
}

export function extractTickets(text: string, opts: { jiraBaseUrl?: string } = {}): TicketRef[] {
  if (!text) return [];
  const found = new Map<string, TicketRef>();
  let inferredJiraBase: string | undefined;

  // 1. Explicit tracker URLs anywhere in the text.
  for (const raw of text.match(/https?:\/\/[^\s)<>\]}'"]+/g) ?? []) {
    const url = raw.replace(/[.,;:]+$/, ''); // trim trailing sentence punctuation
    const browse = url.match(/\/browse\/([A-Z][A-Z0-9]+-\d+)/i);
    if (browse?.[1]) {
      add(found, browse[1], url, 'jira');
      inferredJiraBase ??= originOf(url);
      continue;
    }
    const linear = url.match(/linear\.app\/[^/]+\/issue\/([A-Za-z][A-Za-z0-9]+-\d+)/i);
    if (linear?.[1]) {
      add(found, linear[1], url, 'linear');
      continue;
    }
    // Atlassian host with a key elsewhere in the URL (e.g. selectedIssue=KEY).
    if (/atlassian\.net|\bjira\b/i.test(url)) {
      const key = url.match(JIRA_KEY);
      if (key?.[0]) {
        add(found, key[0], url, 'jira');
        inferredJiraBase ??= originOf(url);
      }
    }
  }

  // 2. Bare Jira keys → linkable with an explicit or inferred base URL.
  const base = normaliseBase(opts.jiraBaseUrl) ?? inferredJiraBase;
  if (base) {
    for (const key of text.match(JIRA_KEY_G) ?? []) {
      add(found, key, `${base}/browse/${key.toUpperCase()}`, 'jira');
    }
  }

  return [...found.values()].slice(0, 8);
}

/** Merge extra refs (e.g. GitHub linked issues) in, deduped by URL then key. */
export function mergeTickets(base: TicketRef[], extra: TicketRef[]): TicketRef[] {
  const out = [...base];
  const seenUrls = new Set(base.map((t) => t.url));
  const seenKeys = new Set(base.map((t) => t.key.toUpperCase()));
  for (const t of extra) {
    if (seenUrls.has(t.url) || seenKeys.has(t.key.toUpperCase())) continue;
    out.push(t);
    seenUrls.add(t.url);
    seenKeys.add(t.key.toUpperCase());
  }
  return out.slice(0, 8);
}

function normaliseBase(url?: string): string | undefined {
  return url ? url.replace(/\/+$/, '') : undefined;
}

function originOf(url: string): string | undefined {
  const m = url.match(/^(https?:\/\/[^/]+)/);
  return m?.[1];
}
