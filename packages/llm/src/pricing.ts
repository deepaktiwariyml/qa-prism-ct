// Claude API pricing (USD per million tokens). These are the standard list
// prices; override any of them without a code change via LLM_PRICING_JSON,
// e.g. LLM_PRICING_JSON='{"claude-sonnet-4-6":{"input":3,"output":15}}'.

export interface ModelPrice {
  /** USD per 1M input tokens. */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
}

const DEFAULT_PRICES: Record<string, ModelPrice> = {
  'claude-opus-4': { input: 15, output: 75 },
  'claude-sonnet-4': { input: 3, output: 15 },
  'claude-haiku-4': { input: 1, output: 5 },
  'claude-3-5-haiku': { input: 0.8, output: 4 },
};

// Fallback when a model isn't matched — Sonnet-tier, the app's default.
const FALLBACK: ModelPrice = { input: 3, output: 15 };

let overrides: Record<string, ModelPrice> | null = null;
function getOverrides(): Record<string, ModelPrice> {
  if (overrides) return overrides;
  overrides = {};
  const raw = process.env.LLM_PRICING_JSON;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, ModelPrice>;
      if (parsed && typeof parsed === 'object') overrides = parsed;
    } catch {
      // ignore malformed override — fall back to defaults
    }
  }
  return overrides;
}

/** Resolve a model id (possibly with a date suffix) to a price by prefix. */
export function priceFor(model: string): ModelPrice {
  const all = { ...DEFAULT_PRICES, ...getOverrides() };
  if (all[model]) return all[model]!;
  // Longest matching prefix wins (e.g. "claude-sonnet-4-6-20260101").
  const key = Object.keys(all)
    .filter((k) => model.startsWith(k) || model.includes(k))
    .sort((a, b) => b.length - a.length)[0];
  return key ? all[key]! : FALLBACK;
}

/** Cost in USD for a call, rounded to 6 decimal places. */
export function costOf(model: string, inputTokens: number, outputTokens: number): number {
  const p = priceFor(model);
  const usd = (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
  return Math.round(usd * 1_000_000) / 1_000_000;
}
