# @qa-prism/scanner-performance

Core Web Vitals + JS bundle weight via Lighthouse (spec §6.2). Depends on
`@qa-prism/core`, `lighthouse`, `chrome-launcher`, and `playwright` (for the
Chromium binary).

## What it does

Runs Lighthouse against the URL on **mobile and desktop** presets and emits:

- A breach finding for **LCP, CLS, TBT, TTI, and total JS bundle** when they
  exceed thresholds (severity from the thresholds).
- An info `perf.report` summary per form factor with all measured values in
  `evidence` (so a scan always records what was measured).

Thresholds live in one exported object — `PERF_THRESHOLDS` — with no inline
magic numbers. Never throws: if Lighthouse can't run, it returns one `info`
finding.

Chrome is located via Playwright's bundled Chromium
(`chromium.executablePath()`), so no system Chrome install is required.

## Tests

```bash
pnpm --filter @qa-prism/scanner-performance test
```

Fast unit tests cover the threshold→severity mapping; one integration test runs
Lighthouse against a local fixture and asserts a `perf.report` finding with
measured values (allow up to ~3 min — it launches Chrome twice).
