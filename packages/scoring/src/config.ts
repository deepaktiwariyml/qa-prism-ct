import type { Pillar, Severity } from '@qa-prism/core';

/**
 * Penalty subtracted from a pillar's starting score (100) per finding, by
 * severity (spec §6.6). Configurable via {@link ScoringOptions.penalties}.
 */
export const DEFAULT_SEVERITY_PENALTIES: Record<Severity, number> = {
  critical: 25,
  high: 12,
  medium: 5,
  low: 2,
  info: 0,
};

/** Relative weight of each pillar in the overall score. Default: equal. */
export const DEFAULT_PILLAR_WEIGHTS: Record<Pillar, number> = {
  automation: 1,
  accessibility: 1,
  security: 1,
  performance: 1,
};

/**
 * A correlation's combined severity is bumped one level when it links at least
 * this many findings (spec §4.2). Configurable via
 * {@link ScoringOptions.bumpAtGroupSize}.
 */
export const DEFAULT_BUMP_AT_GROUP_SIZE = 3;

export interface ScoringOptions {
  /** Override any/all severity penalties. */
  penalties?: Partial<Record<Severity, number>>;
  /** Override any/all pillar weights for the overall aggregate. */
  weights?: Partial<Record<Pillar, number>>;
  /** Group size at/above which combined correlation severity is bumped. */
  bumpAtGroupSize?: number;
  /** Injectable clock for `computedAt` (keeps output deterministic in tests). */
  now?: Date | string;
}

export interface ResolvedConfig {
  penalties: Record<Severity, number>;
  weights: Record<Pillar, number>;
  bumpAtGroupSize: number;
  now: string;
}

/** Merge caller options over the defaults into a fully-resolved config. */
export function resolveConfig(options: ScoringOptions = {}): ResolvedConfig {
  const now =
    options.now instanceof Date
      ? options.now.toISOString()
      : (options.now ?? new Date().toISOString());
  return {
    penalties: { ...DEFAULT_SEVERITY_PENALTIES, ...options.penalties },
    weights: { ...DEFAULT_PILLAR_WEIGHTS, ...options.weights },
    bumpAtGroupSize: options.bumpAtGroupSize ?? DEFAULT_BUMP_AT_GROUP_SIZE,
    now,
  };
}
