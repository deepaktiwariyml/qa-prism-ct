import type { z } from 'zod';
import { LlmError } from './errors.js';
import { extractJson } from './json.js';

/** The one primitive every call goes through — returns the model's text. */
export type CreateMessage = (args: {
  system: string;
  prompt: string;
  maxTokens: number;
  model: string;
}) => Promise<string>;

export interface CompleteArgs {
  system?: string;
  prompt: string;
  maxTokens?: number;
  model?: string;
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
 * once before throwing a typed {@link LlmError}.
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
    return send({
      system: args.system ?? '',
      prompt: args.prompt,
      maxTokens: args.maxTokens ?? defaultMaxTokens,
      model: args.model ?? model,
    });
  }

  async function completeJSON<T>(args: CompleteJsonArgs<T>): Promise<T> {
    const send = await getTransport();
    const system = [args.system, JSON_INSTRUCTION].filter(Boolean).join('\n\n');
    const maxTokens = args.maxTokens ?? defaultMaxTokens;
    const useModel = args.model ?? model;

    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const prompt =
        attempt === 0
          ? args.prompt
          : `${args.prompt}\n\nYour previous response was not valid JSON for the schema. ${JSON_INSTRUCTION}`;
      let raw: string;
      try {
        raw = await send({ system, prompt, maxTokens, model: useModel });
      } catch (err) {
        // Preserve a clear typed message (e.g. missing key); wrap anything else.
        throw err instanceof LlmError ? err : new LlmError('LLM request failed', err);
      }
      const parsed = args.schema.safeParse(safeJsonParse(raw));
      if (parsed.success) return parsed.data;
      lastError = parsed.error;
    }
    throw new LlmError('LLM did not return schema-valid JSON after one retry', lastError);
  }

  return { complete, completeJSON };
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(extractJson(raw));
  } catch {
    return undefined; // schema validation will fail and trigger the retry
  }
}
