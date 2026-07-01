/** Typed error for all LLM-layer failures (missing key, parse/validation). */
export class LlmError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}
