import type { Severity } from '@qa-prism/core';

export interface MetricThreshold {
  slug: string;
  label: string;
  unit: 'ms' | 'score' | 'bytes';
  /** At/above `medium` → medium; at/above `high` → high; below → info. */
  medium: number;
  high: number;
}

/**
 * Core Web Vitals + bundle thresholds (spec §6.2). All numbers live here — no
 * inline magic numbers in the scanner.
 */
export const PERF_THRESHOLDS: Record<string, MetricThreshold> = {
  lcp: { slug: 'lcp', label: 'Largest Contentful Paint', unit: 'ms', medium: 2500, high: 4000 },
  cls: { slug: 'cls', label: 'Cumulative Layout Shift', unit: 'score', medium: 0.1, high: 0.25 },
  tbt: { slug: 'tbt', label: 'Total Blocking Time', unit: 'ms', medium: 200, high: 600 },
  tti: { slug: 'tti', label: 'Time to Interactive', unit: 'ms', medium: 3800, high: 7300 },
  jsBundle: {
    slug: 'js-bundle',
    label: 'Total JavaScript size',
    unit: 'bytes',
    medium: 1_000_000,
    high: 3_000_000,
  },
};

/** Map a measured value onto the rubric using a metric's thresholds. */
export function severityForMetric(value: number, t: MetricThreshold): Severity {
  if (value >= t.high) return 'high';
  if (value >= t.medium) return 'medium';
  return 'info';
}

export const PERF_CONFIG = {
  formFactors: ['mobile', 'desktop'] as const,
  chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
} as const;
