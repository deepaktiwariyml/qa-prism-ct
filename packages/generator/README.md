# @qa-prism/generator

Turns a stack `Selection` into a runnable automation framework (spec §6.7).
Ported from the `/generator` prototype, keeping its template-registry design:
`registry/<cell>/` folders with a `manifest.json` + `files/` of `.tmpl`
templates, shared `partials/` (CI), and a `resolve → render → validate` engine.

## Public API

- `loadRegistry()` → the master cell index (the dashboard dropdowns read this).
- `resolve(selection)` → the matching cell, or `matched:false` + reason
  (the LLM-fallback branch).
- `render(manifest, cellPath, selection, outDir)` → writes the framework.
- `generate(selection)` → resolve + render into a temp dir; returns
  `{ outDir, files, rootName }`. Deterministic — no install/compile.
- `zipDir(dir, rootName)` → a zip `Buffer` for download.
- `validate(manifest, outDir)` → runs `postGenerate` (install + typecheck) —
  the CI trust step, not the download path.

## Adding a stack

Drop in `registry/<cell>/` (manifest + `files/`) and add a row to
`registry/index.json`. The engine never changes.

## Tests

```bash
pnpm --filter @qa-prism/generator test
```
