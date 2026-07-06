import type { z } from 'zod';
import { LlmError } from './errors.js';
import { extractJson } from './json.js';
import { costOf } from './pricing.js';
import { getUsageRecorder, type RawUsage, type TokenUsage } from './usage.js';

/** The transport returns the model's text plus (when available) token usage. */
export type CreateMessageResult = string | { text: string; usage?: RawUsage };

/** The one primitive every call goes through. */
export type CreateMessage = (args: {
  system: string;
  prompt: string;
  maxTokens: number;
  model: string;
}) => Promise<CreateMessageResult>;

export interface CompleteArgs {
  system?: string;
  prompt: string;
  maxTokens?: number;
  model?: string;
  /** Label for accounting, e.g. "testcases.generate". Defaults to "uncategorized". */
  operation?: string;
  /** Fired once with the total usage for this logical call (for per-call UI). */
  onUsage?: (usage: TokenUsage) => void;
}

export interface CompleteJsonArgs<T> extends CompleteArgs {
  schema: z.ZodType<T>;
}

export interface LlmClientOptions {
  /** Injectable transport (defaults to the Anthropic SDK). Handy for tests. */
  createMessage?: CreateMessage;
  /** Default model. Spec §6.7 chooses claude-sonnet-4-6 for analysis. */
  model?: string;
  defaultMaxTokens?: number;
}

export interface LlmClient {
  complete(args: CompleteArgs): Promise<string>;
  completeJSON<T>(args: CompleteJsonArgs<T>): Promise<T>;
}

const JSON_INSTRUCTION =
  'Return only valid JSON matching the described schema. No prose, no explanation, no markdown fences.';

/**
 * Centralized Claude wrapper (spec §7). `completeJSON` instructs the model to
 * return only JSON, parses it, validates against a zod schema, and retries
 * once before throwing a typed {@link LlmError}. Every underlying API call's
 * token usage is reported to the process-wide usage recorder — including the
 * failing attempt of a retry, since it is still billed.
 */
export function createLlmClient(options: LlmClientOptions = {}): LlmClient {
  const model = options.model ?? process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';
  const defaultMaxTokens = options.defaultMaxTokens ?? 16_000;

  // Lazy: only require the real transport (and the API key) when first used.
  let transport = options.createMessage;
  const getTransport = async (): Promise<CreateMessage> => {
    if (!transport) {
      transport = (await import('./anthropic.js')).anthropicCreateMessage;
    }
    return transport;
  };

  async function complete(args: CompleteArgs): Promise<string> {
    const send = await getTransport();
    const useModel = args.model ?? model;
    const operation = args.operation ?? 'uncategorized';
    const res = await send({
      system: args.system ?? '',
      prompt: args.prompt,
      maxTokens: args.maxTokens ?? defaultMaxTokens,
      model: useModel,
    });
    const { text, usage } = normalize(res);
    if (usage) {
      await report(useModel, operation, usage);
      fireOnUsage(args, useModel, operation, usage);
    }
    return text;
  }

  async function completeJSON<T>(args: CompleteJsonArgs<T>): Promise<T> {
    const send = await getTransport();
    const system = [args.system, JSON_INSTRUCTION].filter(Boolean).join('\n\n');
    const maxTokens = args.maxTokens ?? defaultMaxTokens;
    const useModel = args.model ?? model;
    const operation = args.operation ?? 'uncategorized';
    const acc: RawUsage = { inputTokens: 0, outputTokens: 0 };

    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const prompt =
        attempt === 0
          ? args.prompt
          : `${args.prompt}\n\nYour previous response was not valid JSON for the schema. ${JSON_INSTRUCTION}`;
      let res: CreateMessageResult;
      try {
        res = await send({ system, prompt, maxTokens, model: useModel });
      } catch (err) {
        // Preserve a clear typed message (e.g. missing key); wrap anything else.
        throw err instanceof LlmError ? err : new LlmError('LLM request failed', err);
      }
      const { text, usage } = normalize(res);
      if (usage) {
        acc.inputTokens += usage.inputTokens;
        acc.outputTokens += usage.outputTokens;
        await report(useModel, operation, usage); // record every billed attempt
      }
      const parsed = args.schema.safeParse(safeJsonParse(text));
      if (parsed.success) {
        fireOnUsage(args, useModel, operation, acc);
        return parsed.data;
      }
      lastError = parsed.error;
    }
    fireOnUsage(args, useModel, operation, acc);
    throw new LlmError('LLM did not return schema-valid JSON after one retry', lastError);
  }

  return { complete, completeJSON };
}

function normalize(res: CreateMessageResult): { text: string; usage?: RawUsage } {
  return typeof res === 'string' ? { text: res } : { text: res.text, usage: res.usage };
}

/** Report one billed API call to the process-wide recorder. Never throws. */
async function report(model: string, operation: string, usage: RawUsage): Promise<void> {
  const recorder = getUsageRecorder();
  if (!recorder) return;
  try {
    await recorder({
      model,
      operation,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: costOf(model, usage.inputTokens, usage.outputTokens),
    });
  } catch {
    // Accounting must never break the actual LLM response.
  }
}

function fireOnUsage(
  args: CompleteArgs,
  model: string,
  operation: string,
  acc: RawUsage,
): void {
  if (!args.onUsage) return;
  args.onUsage({
    model,
    operation,
    inputTokens: acc.inputTokens,
    outputTokens: acc.outputTokens,
    costUsd: costOf(model, acc.inputTokens, acc.outputTokens),
  });
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(extractJson(raw));
  } catch {
    return undefined; // schema validation will fail and trigger the retry
  }
}
