# @qa-prism/scanner-automation

Assesses the health of an existing test suite (spec §6.4). It does **not** run
or generate tests — it reads them. Depends on `@qa-prism/core`, `typescript`
(AST parsing), and `fast-xml-parser`.

## Inputs

Resolved from the scan context:

- a **repo path** — `target.value` when `kind === 'repo'`, or `options.repoPath`
  on a URL scan (so one scan can cover both a site and its test repo).
- **report artifacts** — auto-discovered JUnit XML in the repo, or explicit
  `options.reportPaths`.

If neither is available it emits a single `info` finding (`automation.no-input`)
— it degrades gracefully rather than failing.

## What it flags

- **Static analysis** (TS/JS via the TypeScript AST; regex for Python/Java):
  `automation.no-assertions`, `automation.hardcoded-wait`,
  `automation.brittle-selector` (XPath / deep CSS / nth-child).
- **Report ingestion** (JUnit-style XML): `automation.flaky`
  (flakyFailure/rerunFailure), `automation.skipped`, `automation.slow`.

## Tests

```bash
pnpm --filter @qa-prism/scanner-automation test
```

Uses a temp-dir fixture repo (a no-assertions spec, a brittle/waiting spec, and
a JUnit report with a flaky test) to assert each finding type, plus report-only
and no-input degradation paths.
