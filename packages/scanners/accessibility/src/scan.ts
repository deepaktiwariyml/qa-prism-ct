import { randomUUID } from 'node:crypto';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import {
  makeFindingCode,
  normalizeSeverity,
  SEVERITY_RANK,
  type Finding,
  type ScanContext,
  type Scanner,
} from '@qa-prism/core';
import { ACCESSIBILITY_CONFIG } from './config.js';

/** Minimal shape of an axe violation node we rely on (avoids axe-core types). */
interface AxeNode {
  target: Array<string | string[]>;
  html?: string;
  failureSummary?: string;
}
interface AxeViolation {
  id: string;
  impact?: string | null;
  help: string;
  description: string;
  helpUrl: string;
  tags: string[];
  nodes: AxeNode[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function selectorOf(node: AxeNode | undefined): string | undefined {
  const t = node?.target?.[0];
  if (t === undefined) return undefined;
  return Array.isArray(t) ? t.join(' >>> ') : String(t);
}

/** axe rule tags → correlation-friendly tags (drop the `cat.` prefix). */
function tagsFor(violation: AxeViolation): string[] {
  const out = new Set<string>();
  for (const t of violation.tags) out.add(t.startsWith('cat.') ? t.slice(4) : t);
  return [...out];
}

function violationToFinding(scanId: string, pageUrl: string, v: AxeViolation): Finding {
  const nodes = v.nodes.slice(0, ACCESSIBILITY_CONFIG.maxNodesPerViolation);
  return {
    id: randomUUID(),
    scanId,
    pillar: 'accessibility',
    severity: normalizeSeverity(v.impact ?? 'moderate', 'accessibility'),
    code: makeFindingCode('accessibility', v.id),
    title: v.help.slice(0, 120),
    description: v.description,
    location: { path: pageUrl, selector: selectorOf(v.nodes[0]) },
    remediation: `${v.help}. See ${v.helpUrl}`,
    tags: tagsFor(v),
    evidence: {
      impact: v.impact ?? null,
      helpUrl: v.helpUrl,
      nodeCount: v.nodes.length,
      selectors: nodes.map(selectorOf).filter(Boolean),
      failureSummary: v.nodes[0]?.failureSummary,
    },
    createdAt: nowIso(),
  };
}

function loadErrorFinding(ctx: ScanContext, err: unknown): Finding {
  return {
    id: randomUUID(),
    scanId: ctx.scanId,
    pillar: 'accessibility',
    severity: 'info',
    code: 'a11y.page-load-failed',
    title: 'Page could not be loaded for accessibility scanning',
    description: `The target could not be rendered, so no accessibility rules were evaluated: ${String(err)}`,
    location: { path: ctx.target.value },
    remediation: 'Verify the URL is reachable and returns HTML, then re-run the scan.',
    tags: ['scan-error'],
    evidence: { error: String(err) },
    createdAt: nowIso(),
  };
}

/** Discover up to N same-origin links from the landing page's anchors. */
async function discoverLinks(page: Page, baseUrl: string, max: number): Promise<string[]> {
  let hrefs: string[] = [];
  try {
    hrefs = await page.$$eval('a[href]', (els) =>
      els.map((el) => (el as HTMLAnchorElement).href),
    );
  } catch {
    return [];
  }
  const origin = new URL(baseUrl).origin;
  const seen = new Set<string>([baseUrl]);
  const out: string[] = [];
  for (const href of hrefs) {
    let normalized: string;
    try {
      const u = new URL(href);
      u.hash = '';
      normalized = u.toString();
      if (u.origin !== origin) continue;
    } catch {
      continue;
    }
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= max) break;
  }
  return out;
}

async function scanPage(context: BrowserContext, url: string, scanId: string): Promise<Finding[]> {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'load', timeout: ACCESSIBILITY_CONFIG.navTimeoutMs });
    const results = (await new AxeBuilder({ page }).analyze()) as unknown as {
      violations: AxeViolation[];
    };
    return results.violations.map((v) => violationToFinding(scanId, url, v));
  } finally {
    await page.close();
  }
}

/**
 * Accessibility scanner (spec §6.1). Crawls the landing page plus up to 5
 * same-origin links, runs axe-core on each, and maps violations to findings.
 * Never throws: an unreachable target yields a single `info` finding.
 */
export const accessibilityScanner: Scanner = async (ctx: ScanContext): Promise<Finding[]> => {
  if (ctx.target.kind !== 'url') return [];

  const baseUrl = ctx.target.value;
  let context: BrowserContext | undefined;
  try {
    const browser = await chromium.launch({ headless: true });
    // axe-core/playwright requires pages from an explicit context, not
    // browser.newPage() (see axe-core-npm error-handling docs).
    // An interactive scan passes storageState (cookies/localStorage) so the
    // context is already logged in.
    const storageState = ctx.options?.storageState;
    context = await browser.newContext(
      storageState
        ? ({ storageState } as Parameters<typeof browser.newContext>[0])
        : undefined,
    );

    // Landing page first — if it can't load, that's the single info finding.
    let landingFindings: Finding[];
    try {
      landingFindings = await scanPage(context, baseUrl, ctx.scanId);
    } catch (err) {
      return [loadErrorFinding(ctx, err)];
    }

    // Crawl a bounded set of same-origin links; skip any that fail.
    const landingPage = await context.newPage();
    let links: string[] = [];
    try {
      await landingPage.goto(baseUrl, {
        waitUntil: 'load',
        timeout: ACCESSIBILITY_CONFIG.navTimeoutMs,
      });
      links = await discoverLinks(landingPage, baseUrl, ACCESSIBILITY_CONFIG.maxCrawlLinks);
    } catch {
      links = [];
    } finally {
      await landingPage.close();
    }

    const crawled: Finding[] = [];
    for (const link of links) {
      try {
        crawled.push(...(await scanPage(context, link, ctx.scanId)));
      } catch {
        // A single unreachable sub-page shouldn't sink the whole scan.
      }
    }

    return dedupe([...landingFindings, ...crawled]);
  } catch (err) {
    // Browser launch or other unexpected failure — degrade to one info finding.
    return [loadErrorFinding(ctx, err)];
  } finally {
    await context?.browser()?.close();
  }
};

/**
 * Collapse to one finding per WCAG rule (code). The same rule fires on every
 * crawled page, so keying by code+selector+page would count a single site-wide
 * issue many times and crush the score. We keep one representative per rule
 * (highest severity), record how many places it occurred, and note the count in
 * the title so the aggregation is visible.
 */
function dedupe(findings: Finding[]): Finding[] {
  const byCode = new Map<string, Finding>();
  const instances = new Map<string, number>();
  const places = new Map<string, Array<{ path: string; selector?: string }>>();

  for (const f of findings) {
    instances.set(f.code, (instances.get(f.code) ?? 0) + 1);
    const list = places.get(f.code) ?? [];
    if (list.length < ACCESSIBILITY_CONFIG.maxNodesPerViolation) {
      list.push({ path: f.location.path, selector: f.location.selector });
    }
    places.set(f.code, list);
    const existing = byCode.get(f.code);
    if (!existing || SEVERITY_RANK[f.severity] > SEVERITY_RANK[existing.severity]) {
      byCode.set(f.code, f);
    }
  }

  return [...byCode.values()].map((f) => {
    const count = instances.get(f.code) ?? 1;
    return {
      ...f,
      title: count > 1 ? `${f.title} (${count} places)` : f.title,
      evidence: { ...(f.evidence ?? {}), instances: count, places: places.get(f.code) },
    };
  });
}
