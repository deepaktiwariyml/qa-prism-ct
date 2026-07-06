// Token-usage accounting for every Claude call (spec §7). A single pluggable
// recorder is fired from inside the client, so no call site can forget to
// report — generate / explain / combine / fill-columns / impact / login / fun
// all flow through here.

export interface RawUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface TokenUsage extends RawUsage {
  model: string;
  operation: string;
  costUsd: number;
}

export type UsageRecorder = (usage: TokenUsage) => void | Promise<void>;

let recorder: UsageRecorder | undefined;

/** Register the process-wide recorder (the API writes it to Postgres). */
export function setUsageRecorder(next: UsageRecorder | undefined): void {
  recorder = next;
}

export function getUsageRecorder(): UsageRecorder | undefined {
  return recorder;
}
