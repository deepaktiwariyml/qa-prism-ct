# @qa-prism/core

The canonical contracts every QA Prism module depends on. This package is the
root of the dependency graph — it imports nothing else in the workspace.

## Public API

Types + matching zod schemas (schema is the source of truth; each TS type is
`z.infer` of its schema, so they can never drift):

- **Finding** / `FindingSchema`, **Location** / `LocationSchema` — the canonical
  finding shape every scanner and the impact analyser emit (spec §4.1).
- **ScanScore** / `ScanScoreSchema`, **PillarScore**, **Correlation**,
  **SeverityCounts** — scoring outputs (§4.2).
- **Selection** / `SelectionSchema` — generator stack selection (§4.3).
- **Pillar** / `PillarSchema`, **Severity** / `SeveritySchema` — enums + rubric.

Helpers:

- `normalizeSeverity(toolSeverity, pillar)` — map a tool's native severity onto
  the canonical rubric (§4.4). Case-insensitive; unknown → `medium`.
- `makeFindingCode(pillar, slug)` — build a stable, pillar-namespaced code, e.g.
  `makeFindingCode('accessibility', 'Image Alt')` → `a11y.image-alt`.
- `maxSeverity`, `highestSeverity`, `bumpSeverity`, `SEVERITY_RANK` — ordering
  helpers used by scoring/correlation.

## Tests

```bash
pnpm --filter @qa-prism/core test
```

Covers the code helpers, the severity mapping (all rubric values + failure
fallback), and schema accept/reject paths for `Finding`, `ScanScore`, and
`Selection`.
