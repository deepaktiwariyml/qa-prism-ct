# @qa-prism/impact-analyser

Turns a GitHub pull request into a risk-ranked list of manual-test areas
(spec §6.5). Depends on `@qa-prism/core` and `@qa-prism/llm`.

## Public API

- `analyzePr({ prUrl, githubToken? }, deps?)` → `ImpactResult` with
  `{ owner, repo, prNumber, title, areas, changedFiles, limitations }`. Each
  area is `{ name, riskLevel, reason, suggestedTests[], relatedFiles[] }`.
- `parseGitHubPrUrl(url)` → `{ owner, repo, number } | null`.

`deps` lets you inject `fetchImpl` and an `llm` client — used by tests to run
the whole flow with mocked GitHub + Claude responses (no network, no keys).

## How it works

1. Parse the PR URL; fetch the PR + changed files (with diffs) from the GitHub
   REST API (`githubToken` for private repos / rate limits).
2. Bound the diff to a token budget.
3. Ask Claude (via `@qa-prism/llm`) for a schema-validated impact report;
   malformed output triggers one retry, then a typed error.

Cross-linking impact areas to existing scanner findings ("shipping into an
already-Critical area") happens in the API, which has DB access.

## Scope note

Dependency analysis is **changed-files-first**: the analyser does not clone the
repo, so it does not build a full reverse-dependency graph. This limitation is
returned in `limitations` and surfaced in the UI.

## Tests

```bash
pnpm --filter @qa-prism/impact-analyser test
```
