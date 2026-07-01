import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createLlmClient } from './client.js';
import { LlmError } from './errors.js';

const schema = z.object({ answer: z.number() });

describe('completeJSON', () => {
  it('parses and validates a well-formed JSON response', async () => {
    const createMessage = vi.fn().mockResolvedValue('{"answer": 42}');
    const llm = createLlmClient({ createMessage });
    const result = await llm.completeJSON({ prompt: 'q', schema });
    expect(result.answer).toBe(42);
    expect(createMessage).toHaveBeenCalledTimes(1);
  });

  it('strips markdown fences and surrounding prose', async () => {
    const createMessage = vi
      .fn()
      .mockResolvedValue('Sure! Here you go:\n```json\n{"answer": 7}\n```');
    const llm = createLlmClient({ createMessage });
    expect((await llm.completeJSON({ prompt: 'q', schema })).answer).toBe(7);
  });

  it('retries once on invalid output, then succeeds', async () => {
    const createMessage = vi
      .fn()
      .mockResolvedValueOnce('not json at all')
      .mockResolvedValueOnce('{"answer": 1}');
    const llm = createLlmClient({ createMessage });
    expect((await llm.completeJSON({ prompt: 'q', schema })).answer).toBe(1);
    expect(createMessage).toHaveBeenCalledTimes(2);
  });

  it('throws a typed LlmError after one failed retry', async () => {
    const createMessage = vi.fn().mockResolvedValue('still not json');
    const llm = createLlmClient({ createMessage });
    await expect(llm.completeJSON({ prompt: 'q', schema })).rejects.toBeInstanceOf(LlmError);
    expect(createMessage).toHaveBeenCalledTimes(2);
  });

  it('rejects schema-mismatched JSON (wrong type)', async () => {
    const createMessage = vi.fn().mockResolvedValue('{"answer": "not a number"}');
    const llm = createLlmClient({ createMessage });
    await expect(llm.completeJSON({ prompt: 'q', schema })).rejects.toBeInstanceOf(LlmError);
  });
});

describe('complete', () => {
  it('passes the model + prompt through and returns text', async () => {
    const createMessage = vi.fn().mockResolvedValue('hello');
    const llm = createLlmClient({ createMessage, model: 'claude-sonnet-4-6' });
    const text = await llm.complete({ prompt: 'hi' });
    expect(text).toBe('hello');
    expect(createMessage).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'hi', model: 'claude-sonnet-4-6' }),
    );
  });
});
