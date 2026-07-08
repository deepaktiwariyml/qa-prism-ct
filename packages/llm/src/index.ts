// @qa-prism/llm — the one place Claude is called (spec §7).
export { createLlmClient } from './client.js';
export type {
  LlmClient,
  LlmClientOptions,
  CreateMessage,
  CreateMessageResult,
  CompleteArgs,
  CompleteJsonArgs,
} from './client.js';
export { LlmError } from './errors.js';
export { extractJson } from './json.js';
export { resetAnthropicClient } from './anthropic.js';
export { setUsageRecorder, getUsageRecorder } from './usage.js';
export type { RawUsage, TokenUsage, UsageRecorder } from './usage.js';
export { priceFor, costOf } from './pricing.js';
export type { ModelPrice } from './pricing.js';
export { IMPACT_ANALYSIS_SYSTEM, buildImpactAnalysisPrompt } from './prompts/impact-analysis.js';
export { DEFAULT_TESTCASE_SYSTEM } from './prompts/testcase-system.js';
export {
  SYSTEM_PROMPTS,
  resolveSystemPrompt,
  setSystemPromptOverrides,
  getSystemPromptOverrides,
} from './prompts/registry.js';
export type { SystemPromptDef } from './prompts/registry.js';
