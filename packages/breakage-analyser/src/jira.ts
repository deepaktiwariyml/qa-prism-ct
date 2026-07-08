import type { FetchImpl } from '@qa-prism/impact-analyser';

/** A normalized Jira issue used as an analysis input + evidence anchor. */
export interface JiraItem {
  key: string;
  url: string;
  summary: string;
  description: string;
  acceptanceCriteria: string;
  labels: string[];
  linkedIssues: Array<{ key: string; relation: string; summary: string }>;
  comments: string[];
}

export interface JiraResolution {
  items: JiraItem[];
  limitations: string[];
}

interface AdfNode {
  type?: string;
  text?: string;
  content?: AdfNode[];
}

/** Minimal HTML→text for Jira rendered fields (mirrors the app's helper). */
function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Recursively extract plain text from an Atlassian Document Format node. */
function adfToText(node: AdfNode | null | undefined): string {
  if (!node || typeof node !== 'object') return '';
  if (node.type === 'text' && typeof node.text === 'string') return node.text;
  const inner = Array.isArray(node.content) ? node.content.map(adfToText).join('') : '';
  const blocks = ['paragraph', 'heading', 'blockquote', 'codeBlock', 'listItem', 'rule'];
  if (node.type && blocks.includes(node.type)) return `${inner}\n`;
  return inner;
}

function jiraEnv(): { base: string; auth: string } | null {
  const base = (process.env.JIRA_BASE_URL || '').replace(/\/+$/, '');
  const email = process.env.JIRA_EMAIL || '';
  const token = process.env.JIRA_API_TOKEN || '';
  if (!base || !email || !token) return null;
  return { base, auth: Buffer.from(`${email}:${token}`).toString('base64') };
}

const CHILDREN_CAP = 30;

/** Fetch one issue with the fields the analysis needs. */
async function fetchIssue(base: string, auth: string, key: string, fetchImpl: FetchImpl): Promise<JiraItem | null> {
  const fields = 'summary,description,labels,issuelinks,comment';
  const url = `${base}/rest/api/3/issue/${encodeURIComponent(key)}?fields=${fields}&expand=renderedFields,names`;
  const res = await fetchImpl(url, { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    fields?: {
      summary?: string;
      description?: AdfNode | null;
      labels?: string[];
      issuelinks?: Array<{
        type?: { inward?: string; outward?: string };
        inwardIssue?: { key?: string; fields?: { summary?: string } };
        outwardIssue?: { key?: string; fields?: { summary?: string } };
      }>;
      comment?: { comments?: Array<{ author?: { displayName?: string }; body?: AdfNode }> };
      [k: string]: unknown;
    };
    renderedFields?: { description?: string; [k: string]: unknown };
    names?: Record<string, string>;
  };

  const description = htmlToText(data.renderedFields?.description ?? '') || adfToText(data.fields?.description).trim();

  // Acceptance criteria usually lives in a custom field whose display name
  // contains "acceptance". Find it via the `names` map, else leave blank.
  let acceptanceCriteria = '';
  const acId = Object.entries(data.names ?? {}).find(([, name]) => /acceptance/i.test(name))?.[0];
  if (acId) {
    const rendered = (data.renderedFields as Record<string, unknown> | undefined)?.[acId];
    if (typeof rendered === 'string') acceptanceCriteria = htmlToText(rendered);
    else acceptanceCriteria = adfToText((data.fields as Record<string, unknown>)?.[acId] as AdfNode).trim();
  }

  const linkedIssues = (data.fields?.issuelinks ?? [])
    .map((l) => {
      const other = l.inwardIssue ?? l.outwardIssue;
      const relation = (l.inwardIssue ? l.type?.inward : l.type?.outward) ?? 'relates to';
      return other?.key ? { key: other.key, relation, summary: other.fields?.summary ?? '' } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const comments = (data.fields?.comment?.comments ?? [])
    .map((c) => `${c.author?.displayName ?? 'Someone'}: ${adfToText(c.body).trim()}`)
    .filter((t) => t.length > 0);

  return {
    key,
    url: `${base}/browse/${key}`,
    summary: data.fields?.summary ?? '',
    description,
    acceptanceCriteria,
    labels: data.fields?.labels ?? [],
    linkedIssues,
    comments,
  };
}

/** Resolve an Epic key to its child issue keys via JQL. */
async function fetchEpicChildren(base: string, auth: string, epicKey: string, fetchImpl: FetchImpl): Promise<string[]> {
  const jql = `parent = ${JSON.stringify(epicKey)} OR "Epic Link" = ${JSON.stringify(epicKey)}`;
  const url = `${base}/rest/api/3/search?jql=${encodeURIComponent(jql)}&fields=summary&maxResults=${CHILDREN_CAP}`;
  const res = await fetchImpl(url, { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } });
  if (!res.ok) return [];
  const data = (await res.json()) as { issues?: Array<{ key?: string }> };
  return (data.issues ?? []).map((i) => i.key ?? '').filter(Boolean);
}

/**
 * Resolve a Jira selection (explicit keys and/or an epic) into normalized
 * issues. Never throws: when Jira isn't configured or a fetch fails it returns
 * whatever it got plus a limitation note, so the rest of the analysis proceeds.
 */
export async function resolveJira(
  selection: { keys?: string[]; epicKey?: string; includeComments?: boolean } | undefined,
  fetchImpl: FetchImpl = fetch,
): Promise<JiraResolution> {
  const limitations: string[] = [];
  if (!selection || (!selection.keys?.length && !selection.epicKey)) return { items: [], limitations };

  const env = jiraEnv();
  if (!env) {
    return { items: [], limitations: ['Jira was selected but is not configured — add your Jira URL, email, and API token in Settings.'] };
  }

  const keys = new Set((selection.keys ?? []).map((k) => k.trim().toUpperCase()).filter(Boolean));
  if (selection.epicKey) {
    try {
      const children = await fetchEpicChildren(env.base, env.auth, selection.epicKey.trim().toUpperCase(), fetchImpl);
      children.forEach((k) => keys.add(k.toUpperCase()));
      if (!children.length) limitations.push(`No child issues found for epic ${selection.epicKey}.`);
    } catch {
      limitations.push(`Could not load epic ${selection.epicKey}.`);
    }
  }

  const capped = [...keys].slice(0, CHILDREN_CAP + 20);
  if (capped.length < keys.size) limitations.push(`Jira selection was capped at ${capped.length} issues.`);

  const settled = await Promise.all(
    capped.map((k) => fetchIssue(env.base, env.auth, k, fetchImpl).catch(() => null)),
  );
  const items = settled.filter((x): x is JiraItem => x !== null);
  if (!selection.includeComments) items.forEach((it) => (it.comments = []));
  if (items.length < capped.length) limitations.push('Some Jira issues could not be fetched (missing or no access).');

  return { items, limitations };
}
