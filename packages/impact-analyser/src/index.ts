// @qa-prism/impact-analyser — GitHub PR → bounded diff → Claude → impact report (spec §6.5).
export {
  analyzePr,
  type AnalyzeInput,
  type AnalyzeDeps,
  type ImpactResult,
  type RawImpactAnalysis,
} from './analyze.js';
export { parseGitHubPrUrl, type PrRef } from './parse-url.js';
