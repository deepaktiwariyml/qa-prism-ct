// @qa-prism/scoring — turns Finding[] into a ScanScore (spec §6.6).
// Deterministic aggregation + cross-pillar correlation.

export {
  DEFAULT_SEVERITY_PENALTIES,
  DEFAULT_PILLAR_WEIGHTS,
  DEFAULT_BUMP_AT_GROUP_SIZE,
  resolveConfig,
  type ScoringOptions,
  type ResolvedConfig,
} from './config.js';
export { findCorrelations } from './correlate.js';
export { scoreScan, computePillarScore } from './score.js';
