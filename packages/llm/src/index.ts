// @qa-prism/llm — the one place Claude is called (spec §7).
export { createLlmClient } from './client.js';
export type { LlmClient, LlmClientOptions, CreateMessage, CompleteArgs, CompleteJsonArgs } from './client.js';
export { LlmError } from './errors.js';
export { extractJson } from './json.js';
export { IMPACT_ANALYSIS_SYSTEM, buildImpactAnalysisPrompt } from './prompts/impact-analysis.js';
