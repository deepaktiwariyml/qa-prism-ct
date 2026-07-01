import Anthropic from '@anthropic-ai/sdk';
import { LlmError } from './errors.js';
import type { CreateMessage } from './client.js';

let client: Anthropic | undefined;

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new LlmError('ANTHROPIC_API_KEY is not set — cannot call the Claude API.');
  }
  // The SDK reads ANTHROPIC_API_KEY from the environment; never pass it in code.
  client ??= new Anthropic();
  return client;
}

/**
 * Real Claude call (spec §7). Returns the concatenated text of the response.
 * The API key is read from the environment by the SDK and never logged.
 */
export const anthropicCreateMessage: CreateMessage = async ({ system, prompt, maxTokens, model }) => {
  const response = await getClient().messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: prompt }],
  });
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
};
