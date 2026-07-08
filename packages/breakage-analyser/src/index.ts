// @qa-prism/breakage-analyser — "What's Broken": PRs + docs + test cases + Jira
// → an evidence-cited breakage / regression prediction for QA.
export { analyzeBreakage, type AnalyzeDeps } from './pipeline.js';
export {
  BreakageInputSchema,
  BreakageAnalysisSchema,
  RiskLevelSchema,
  EvidenceRefSchema,
  type BreakageInput,
  type BreakageResult,
  type BreakageAnalysis,
  type BreakageManifest,
  type EvidenceRef,
  type RiskLevel,
  type PrInput,
  type DocInput,
  type JiraSelection,
  type UsageTotals,
} from './types.js';
