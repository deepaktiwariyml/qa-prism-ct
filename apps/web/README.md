# @qa-prism/web

The QA Prism dashboard — Next.js (App Router) + Tailwind + Recharts (spec §8).

## Pages

- `/` — target picker (run-a-scan form) + recent scans, fetched from the API.
- `/scans/[id]` — overall score, pillar radar, severity breakdown, four pillar
  cards, cross-pillar correlations, and the findings list. Polls the API until
  the scan is `done`.

Server Components fetch data; Client Components (`RunScanForm`, `ScanDetail`,
charts) handle interactivity. All shapes come from `@qa-prism/core` — no
re-declared finding/score types. Loading (`loading.tsx`) and error
(`error.tsx`, inline API-error states) are handled for every async view.

## Running

Needs the API running (see `apps/api`). Set `NEXT_PUBLIC_API_URL` if the API
isn't at `http://localhost:3001`.

```bash
pnpm --filter @qa-prism/web dev     # http://localhost:3000
# or: pnpm --filter @qa-prism/web build && pnpm --filter @qa-prism/web start
```
