// @qa-prism/impact-analyser — GitHub PR → bounded diff → Claude → impact report (spec §6.5).
export {
  analyzePr,
  type AnalyzeInput,
  type AnalyzeDeps,
  type ImpactResult,
  type RawImpactAnalysis,
} from './analyze.js';
export { parseGitHubPrUrl, type PrRef } from './parse-url.js';
export { extractTickets, type TicketRef } from './tickets.js';
// Reused by @qa-prism/breakage-analyser to fetch GitHub PR diffs.
export { fetchPr, type PrData, type ChangedFile, type LinkedIssue, type FetchImpl } from './github.js';
