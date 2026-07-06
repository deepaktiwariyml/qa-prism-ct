/**
 * Best-effort extraction of issue-tracker references (Jira, Linear, …) from a
 * PR's title and body. Deterministic — no LLM. "If available" means: link what
 * we can. Explicit tracker URLs (e.g. a Jira `…/browse/KEY` link, which Jira's
 * GitHub integration injects into the PR body) always win; bare keys like
 * `ABC-123` only become links when JIRA_BASE_URL is configured.
 */
export interface TicketRef {
  key: string;
  url: string;
  source: 'jira' | 'linear' | 'other';
}

const JIRA_KEY = /[A-Z][A-Z0-9]+-\d+/;

function add(map: Map<string, TicketRef>, key: string, url: string, source: TicketRef['source']): void {
  const k = key.toUpperCase();
  // First writer wins so an explicit URL isn't overwritten by a constructed one.
  if (!map.has(k)) map.set(k, { key: k, url, source });
}

export function extractTickets(text: string, opts: { jiraBaseUrl?: string } = {}): TicketRef[] {
  if (!text) return [];
  const found = new Map<string, TicketRef>();

  // 1. Explicit tracker URLs anywhere in the text.
  for (const raw of text.match(/https?:\/\/[^\s)<>\]}'"]+/g) ?? []) {
    const url = raw.replace(/[.,;:]+$/, ''); // trim trailing sentence punctuation
    const browse = url.match(/\/browse\/([A-Z][A-Z0-9]+-\d+)/i);
    if (browse?.[1]) {
      add(found, browse[1], url, 'jira');
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
      if (key?.[0]) add(found, key[0], url, 'jira');
    }
  }

  // 2. Bare Jira keys → linkable only with a configured base URL.
  if (opts.jiraBaseUrl) {
    const base = opts.jiraBaseUrl.replace(/\/+$/, '');
    for (const key of text.match(/\b[A-Z][A-Z0-9]+-\d+\b/g) ?? []) {
      add(found, key, `${base}/browse/${key.toUpperCase()}`, 'jira');
    }
  }

  return [...found.values()].slice(0, 5);
}
