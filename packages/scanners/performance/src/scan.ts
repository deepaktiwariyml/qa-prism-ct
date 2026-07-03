import { randomUUID } from 'node:crypto';
import { launch, type LaunchedChrome } from 'chrome-launcher';
import lighthouse from 'lighthouse';
import { chromium } from 'playwright';
import {
  makeFindingCode,
  type Finding,
  type Severity,
  type ScanContext,
  type Scanner,
} from '@qa-prism/core';
import { PERF_CONFIG, PERF_THRESHOLDS, severityForMetric, type MetricThreshold } from './config.js';

type FormFactor = (typeof PERF_CONFIG.formFactors)[number];

/** Loose shape of the Lighthouse result we consume. */
interface Lhr {
  audits: Record<string, { numericValue?: number; details?: { items?: Array<Record<string, unknown>> } }>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function fmt(value: number, unit: MetricThreshold['unit']): string {
  if (unit === 'ms') return `${Math.round(value)}ms`;
  if (unit === 'bytes') return `${(value / 1_000_000).toFixed(2)}MB`;
  return value.toFixed(3);
}

/** Hard ceiling per Lighthouse run — a hung navigation must not pin a Chrome. */
const LH_TIMEOUT_MS = 90_000;

async function runLighthouse(url: string, formFactor: FormFactor): Promise<Lhr> {
  const chrome: LaunchedChrome = await launch({
    chromePath: chromium.executablePath(),
    chromeFlags: [...PERF_CONFIG.chromeFlags],
  });
  try {
    const run = lighthouse(
      url,
      {
        port: chrome.port,
        output: 'json',
        onlyCategories: ['performance'],
        formFactor,
        screenEmulation:
          formFactor === 'desktop'
            ? { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false }
            : { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
      },
      undefined,
    );
    // If Lighthouse hangs, time out so `finally` kills Chrome (no orphan).
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Lighthouse timed out')), LH_TIMEOUT_MS);
    });
    let result;
    try {
      result = await Promise.race([run, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (!result?.lhr) throw new Error('Lighthouse returned no result');
    return result.lhr as unknown as Lhr;
  } finally {
    // kill() reaps the Chrome process tree and its temp profile dir.
    try {
      await chrome.kill();
    } catch {
      // best effort
    }
  }
}

function metricValue(lhr: Lhr, auditId: string): number | undefined {
  return lhr.audits[auditId]?.numericValue;
}

function totalScriptBytes(lhr: Lhr): number | undefined {
  const items = lhr.audits['network-requests']?.details?.items;
  if (!items) return undefined;
  let bytes = 0;
  for (const item of items) {
    if (item.resourceType === 'Script') bytes += Number(item.resourceSize ?? 0);
  }
  return bytes;
}

function finding(
  scanId: string,
  slug: string,
  severity: Severity,
  title: string,
  description: string,
  remediation: string,
  url: string,
  evidence: Record<string, unknown>,
  tags: string[],
): Finding {
  return {
    id: randomUUID(),
    scanId,
    pillar: 'performance',
    severity,
    code: makeFindingCode('performance', slug),
    title,
    description,
    location: { path: url },
    remediation,
    tags: ['web-vitals', ...tags],
    evidence,
    createdAt: nowIso(),
  };
}

function metricFindings(scanId: string, url: string, formFactor: FormFactor, lhr: Lhr): Finding[] {
  const measured: Record<string, number> = {};
  const readings: Array<{ t: MetricThreshold; value: number }> = [];

  const push = (key: string, auditId: string): void => {
    const t = PERF_THRESHOLDS[key]!;
    const value = key === 'jsBundle' ? totalScriptBytes(lhr) : metricValue(lhr, auditId);
    if (value === undefined) return;
    measured[key] = value;
    readings.push({ t, value });
  };
  push('lcp', 'largest-contentful-paint');
  push('cls', 'cumulative-layout-shift');
  push('tbt', 'total-blocking-time');
  push('tti', 'interactive');
  push('jsBundle', 'network-requests');

  const findings: Finding[] = [];
  for (const { t, value } of readings) {
    const severity = severityForMetric(value, t);
    if (severity === 'info') continue; // only breaches get their own finding
    findings.push(
      finding(
        scanId,
        t.slug,
        severity,
        `${t.label} is ${fmt(value, t.unit)} on ${formFactor}`,
        `Measured ${fmt(value, t.unit)} — medium threshold ${fmt(t.medium, t.unit)}, high ${fmt(t.high, t.unit)}.`,
        remediationFor(t.slug),
        url,
        { metric: t.slug, value, threshold: { medium: t.medium, high: t.high }, formFactor },
        [t.slug, formFactor],
      ),
    );
  }

  // Always emit one info summary per form factor (guarantees a measured record).
  findings.push(
    finding(
      scanId,
      'report',
      'info',
      `Performance metrics captured on ${formFactor}`,
      'Core Web Vitals measured by Lighthouse. Thresholds are in the exported PERF_THRESHOLDS config.',
      'Review the metrics; no action needed for values within thresholds.',
      url,
      { formFactor, measured },
      [formFactor],
    ),
  );
  return findings;
}

function remediationFor(slug: string): string {
  switch (slug) {
    case 'lcp':
      return 'Preload the largest image/font and defer non-critical JavaScript.';
    case 'cls':
      return 'Reserve space for images/ads/embeds and avoid inserting content above existing content.';
    case 'tbt':
      return 'Break up long tasks and reduce main-thread JavaScript work.';
    case 'tti':
      return 'Reduce and defer JavaScript so the page becomes interactive sooner.';
    case 'js-bundle':
      return 'Code-split, tree-shake, and lazy-load JavaScript to shrink the bundle.';
    default:
      return 'Investigate the metric and reduce the contributing work.';
  }
}

/**
 * Performance scanner (spec §6.2). Runs Lighthouse (mobile + desktop) and emits
 * findings for Core Web Vitals + JS bundle weight that breach thresholds, plus
 * an info summary per form factor. Never throws.
 */
export const performanceScanner: Scanner = async (ctx: ScanContext): Promise<Finding[]> => {
  if (ctx.target.kind !== 'url') return [];
  const url = ctx.target.value;

  const findings: Finding[] = [];
  let anySucceeded = false;
  for (const formFactor of PERF_CONFIG.formFactors) {
    try {
      const lhr = await runLighthouse(url, formFactor);
      findings.push(...metricFindings(ctx.scanId, url, formFactor, lhr));
      anySucceeded = true;
    } catch {
      // Skip this form factor; try the next.
    }
  }

  if (!anySucceeded) {
    // Surface as a real (medium) finding, not a silent info — otherwise the
    // pillar would default to a perfect 100 and look healthy when in fact
    // nothing was measured.
    return [
      finding(
        ctx.scanId,
        'probe-failed',
        'medium',
        'Performance could not be measured',
        'Lighthouse failed to analyse the target, so Core Web Vitals were not captured. This is not a clean bill of health — the scan simply could not measure performance.',
        'Verify the URL is reachable and that a Chromium binary is available, then re-run the scan.',
        url,
        {},
        ['scan-error'],
      ),
    ];
  }
  return findings;
};
