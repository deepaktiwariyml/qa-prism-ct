# @qa-prism/llm

The one place Claude is called (spec §7). No other module talks to the Anthropic
SDK directly. Depends on `@anthropic-ai/sdk`, `@qa-prism/core`, and `zod`.

## Public API

- `createLlmClient(options?)` → an `LlmClient` with:
  - `complete({ system?, prompt, maxTokens?, model? })` → text.
  - `completeJSON({ system?, prompt, schema, ... })` → validated `T`. Instructs
    the model to return only JSON, parses it, validates against the zod
    `schema`, and **retries once** before throwing a typed `LlmError`.
- `LlmError` — typed error for missing key / parse / validation failures.
- Prompt templates in `src/prompts/` (one file per use case; each documents its
  expected output schema). Ships `impact-analysis`.

## Configuration

- The API key is read from `ANTHROPIC_API_KEY` by the SDK — never passed in code
  or logged.
- Default model is `claude-sonnet-4-6` (spec §6.7's analysis choice); override
  with `ANTHROPIC_MODEL` or `createLlmClient({ model })`.
- `createLlmClient({ createMessage })` injects a transport — used by tests to
  exercise parsing/validation/retry without a network call or API key.

## Tests

```bash
pnpm --filter @qa-prism/llm test
```

Covers JSON parsing (incl. fenced/prose-wrapped output), schema validation, the
one-retry path, and typed-error-after-retry — all with a mocked transport.
