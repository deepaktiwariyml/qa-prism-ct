# @qa-prism/scoring

Turns `Finding[]` into a `ScanScore` — pillar scores, a weighted overall, and
cross-pillar correlations (spec §6.6). Depends only on `@qa-prism/core`.

## Public API

- `scoreScan(scanId, findings, options?) => ScanScore` — the main entry point.
- `computePillarScore(pillar, findings, config)` — one pillar's score.
- `findCorrelations(findings, options?) => Correlation[]` — cross-pillar links.
- `resolveConfig`, `DEFAULT_SEVERITY_PENALTIES`, `DEFAULT_PILLAR_WEIGHTS`,
  `DEFAULT_BUMP_AT_GROUP_SIZE`, and the `ScoringOptions` type for tuning.

## How scoring works

- **Pillar score**: start at 100, subtract a penalty per finding by severity
  (critical 25, high 12, medium 5, low 2, info 0), floor at 0. Every pillar is
  always present (100 when empty) so the radar chart is stable.
- **Overall**: weighted mean of the four pillar scores (equal weights by
  default), rounded to an integer.
- **Correlation**: findings are linked when they share any tag, `location.
  component`, or `location.selector`; connected components form groups. A group
  spanning ≥2 pillars becomes one `Correlation`, with combined severity = the
  max of its findings, bumped one level once the group reaches 3+ findings.

## Determinism

Identical findings always yield identical scores and correlations — input is
id-sorted, correlation ids are derived from member ids (no uuids/randomness).
The only time-dependent field is `computedAt`, injectable via `options.now`.

## Tests

```bash
pnpm --filter @qa-prism/scoring test
```

Covers empty findings (100), all-critical (0), penalty/weight math, order
independence, the `checkout` cross-pillar correlation, single-pillar
non-correlation, the 3+ severity bump, and component-based linking.
