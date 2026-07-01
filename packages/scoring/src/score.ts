import {
  PILLARS,
  SEVERITIES,
  type Finding,
  type Pillar,
  type PillarScore,
  type ScanScore,
  type SeverityCounts,
} from '@qa-prism/core';
import { resolveConfig, type ResolvedConfig, type ScoringOptions } from './config.js';
import { findCorrelations } from './correlate.js';

function emptyCounts(): SeverityCounts {
  return { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
}

/** Score one pillar: start at 100, subtract severity penalties, floor at 0. */
export function computePillarScore(
  pillar: Pillar,
  findings: Finding[],
  config: ResolvedConfig,
): PillarScore {
  const counts = emptyCounts();
  let penalty = 0;
  for (const f of findings) {
    counts[f.severity] += 1;
    penalty += config.penalties[f.severity];
  }
  return {
    pillar,
    score: Math.max(0, 100 - penalty),
    findingCounts: counts,
  };
}

/**
 * Aggregate `Finding[]` into a `ScanScore` (spec §4.2, §6.6). Deterministic:
 * identical findings always yield identical scores and correlations. The only
 * time-dependent field is `computedAt`, which can be injected via `options.now`.
 */
export function scoreScan(
  scanId: string,
  findings: Finding[],
  options: ScoringOptions = {},
): ScanScore {
  const config = resolveConfig(options);

  // Every pillar is always represented (100 when it has no findings), so the
  // radar chart and overall aggregate are stable in shape.
  const byPillar = new Map<Pillar, Finding[]>(PILLARS.map((p) => [p, []]));
  for (const f of findings) {
    byPillar.get(f.pillar)?.push(f);
  }

  const pillars = PILLARS.map((p) => computePillarScore(p, byPillar.get(p) ?? [], config));

  const totalWeight = PILLARS.reduce((sum, p) => sum + config.weights[p], 0);
  const weightedSum = pillars.reduce((sum, ps) => sum + ps.score * config.weights[ps.pillar], 0);
  const overall = totalWeight === 0 ? 0 : Math.round(weightedSum / totalWeight);

  return {
    scanId,
    overall,
    pillars,
    correlations: findCorrelations(findings, options),
    computedAt: config.now,
  };
}

// Re-exported for callers that want the severity vocabulary alongside scoring.
export { SEVERITIES };
