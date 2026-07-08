import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { TokenUsage } from '@qa-prism/llm';

/**
 * File-backed LLM usage accounting for the desktop app — the local stand-in
 * for the server's Postgres LlmUsageDaily table. One record per
 * (day, model, operation); increments in place. Mirrors the /usage response
 * shape the web Consumption page expects.
 */
interface UsageRow {
  day: string; // YYYY-MM-DD (UTC)
  model: string;
  operation: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export class UsageStore {
  private rows: UsageRow[] = [];

  constructor(private readonly file: string) {
    try {
      if (existsSync(file)) {
        const parsed = JSON.parse(readFileSync(file, 'utf8')) as UsageRow[];
        if (Array.isArray(parsed)) this.rows = parsed;
      }
    } catch {
      this.rows = []; // corrupt file → start fresh rather than crash
    }
  }

  /** Record one billed LLM call (called from the shared usage recorder). */
  record(u: TokenUsage): void {
    const day = new Date().toISOString().slice(0, 10);
    let row = this.rows.find((r) => r.day === day && r.model === u.model && r.operation === u.operation);
    if (!row) {
      row = { day, model: u.model, operation: u.operation, calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
      this.rows.push(row);
    }
    row.calls += 1;
    row.inputTokens += u.inputTokens;
    row.outputTokens += u.outputTokens;
    row.costUsd += u.costUsd;
    this.persist();
  }

  /** Paginated per-day aggregate + all-time totals (matches GET /usage). */
  query(limit: number, offset: number) {
    const round = (n: number) => Math.round(n * 10_000) / 10_000;
    const allDays = [...new Set(this.rows.map((r) => r.day))].sort((a, b) => (a < b ? 1 : -1));
    const hasMore = allDays.length > offset + limit;
    const pageDays = allDays.slice(offset, offset + limit);

    const days = pageDays.map((date) => {
      const dayRows = this.rows
        .filter((r) => r.day === date)
        .sort((a, b) => b.costUsd - a.costUsd);
      const agg = dayRows.reduce(
        (acc, r) => {
          acc.calls += r.calls;
          acc.inputTokens += r.inputTokens;
          acc.outputTokens += r.outputTokens;
          acc.costUsd += r.costUsd;
          return acc;
        },
        { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 },
      );
      return {
        date,
        calls: agg.calls,
        inputTokens: agg.inputTokens,
        outputTokens: agg.outputTokens,
        costUsd: round(agg.costUsd),
        breakdown: dayRows.map((r) => ({
          model: r.model,
          operation: r.operation,
          calls: r.calls,
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
          costUsd: round(r.costUsd),
        })),
      };
    });

    const totals = this.rows.reduce(
      (acc, r) => {
        acc.calls += r.calls;
        acc.inputTokens += r.inputTokens;
        acc.outputTokens += r.outputTokens;
        acc.costUsd += r.costUsd;
        return acc;
      },
      { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 },
    );
    totals.costUsd = round(totals.costUsd);

    return { days, hasMore, totals };
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file, JSON.stringify(this.rows, null, 2), 'utf8');
    } catch {
      // best-effort — accounting must never break the actual LLM response
    }
  }
}
