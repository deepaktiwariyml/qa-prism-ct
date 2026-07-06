import { fmtTokens, fmtUsd, type CallUsage } from '@/lib/usage';

/** Small, noticeable "what this LLM call cost" chip shown after a call. */
export function UsageChip({ usage, className = '' }: { usage?: CallUsage | null; className?: string }) {
  if (!usage) return null;
  return (
    <div
      className={`inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 ${className}`}
      title="Token usage and estimated cost of the last AI call"
    >
      <span className="font-semibold">💰 This AI call</span>
      <span className="text-amber-700">
        {fmtTokens(usage.inputTokens)} in + {fmtTokens(usage.outputTokens)} out tokens
      </span>
      <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold">{fmtUsd(usage.costUsd)}</span>
      <span className="text-amber-600">· {usage.model}</span>
    </div>
  );
}
