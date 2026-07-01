import { z } from 'zod';
import type { Pillar } from './pillar.js';

/**
 * The canonical severity rubric (spec §4.4). Ordered most → least severe.
 * All scanners and the LLM layer must map native severities onto these values.
 */
export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;

export const SeveritySchema = z.enum(SEVERITIES);
export type Severity = z.infer<typeof SeveritySchema>;

/** Rank for ordering/aggregation — higher means more severe. */
export const SEVERITY_RANK: Record<Severity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const RANK_TO_SEVERITY: Severity[] = ['info', 'low', 'medium', 'high', 'critical'];

/** The more severe of two severities. */
export function maxSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

/**
 * The most severe severity in a list. Empty list -> `info` (nothing to act on).
 */
export function highestSeverity(severities: readonly Severity[]): Severity {
  return severities.reduce<Severity>((acc, s) => maxSeverity(acc, s), 'info');
}

/** Bump a severity up one level, capped at `critical`. */
export function bumpSeverity(severity: Severity): Severity {
  const next = Math.min(SEVERITY_RANK[severity] + 1, SEVERITY_RANK.critical);
  // Safe: next is clamped into the valid rank range above.
  return RANK_TO_SEVERITY[next]!;
}

/**
 * Common native severity vocabularies (axe impact, ESLint-style levels, generic
 * words) mapped onto the rubric. Keys are lower-cased.
 */
const BASE_SEVERITY_MAP: Record<string, Severity> = {
  // rubric values pass through
  critical: 'critical',
  high: 'high',
  medium: 'medium',
  low: 'low',
  info: 'info',
  // axe-core impacts
  serious: 'high',
  moderate: 'medium',
  minor: 'low',
  // generic / tool words
  blocker: 'critical',
  fatal: 'critical',
  error: 'high',
  major: 'high',
  warning: 'medium',
  warn: 'medium',
  notice: 'low',
  information: 'info',
  informational: 'info',
  none: 'info',
};

/**
 * Per-pillar overrides layered on top of {@link BASE_SEVERITY_MAP}. Empty today,
 * but this is the documented hook for pillar-specific tuning (e.g. a security
 * tool whose "warning" should count as high). Kept per-scanner-aware via the
 * `pillar` argument so scanners don't each reinvent the mapping (spec §4.4).
 */
const PER_PILLAR_SEVERITY_MAP: Partial<Record<Pillar, Record<string, Severity>>> = {};

/**
 * Map a tool's native severity onto the canonical rubric. Case-insensitive.
 * Unknown values fall back to `medium` (surface it, don't silently drop).
 */
export function normalizeSeverity(toolSeverity: string, pillar: Pillar): Severity {
  const key = toolSeverity.trim().toLowerCase();
  const override = PER_PILLAR_SEVERITY_MAP[pillar]?.[key];
  return override ?? BASE_SEVERITY_MAP[key] ?? 'medium';
}
