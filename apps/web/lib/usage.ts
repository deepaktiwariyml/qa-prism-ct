export interface CallUsage {
  model: string;
  operation: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface UsageBreakdown {
  model: string;
  operation: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}
export interface UsageDay {
  date: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  breakdown: UsageBreakdown[];
}
export interface UsageResponse {
  days: UsageDay[];
  totals: { calls: number; inputTokens: number; outputTokens: number; costUsd: number };
}

/** Compact token count, e.g. 12,345. */
export function fmtTokens(n: number): string {
  return n.toLocaleString('en-US');
}

/** USD with more precision for sub-cent amounts (per-call costs are tiny). */
export function fmtUsd(n: number): string {
  if (n === 0) return '$0';
  if (n < 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

/** Friendly label for an operation key like "testcases.generate". */
export function operationLabel(op: string): string {
  const MAP: Record<string, string> = {
    'testcases.generate': 'Generate test cases',
    'testcases.fill-columns': 'Fill columns',
    'testcases.combine': 'Combine test cases',
    'testcases.explain': 'Explain test case',
    'impact.analyze': 'PR impact analysis',
    'fun.words': 'Fun word game',
    'scan.login-detect': 'Scan login detection',
    uncategorized: 'Other',
  };
  return MAP[op] ?? op;
}
