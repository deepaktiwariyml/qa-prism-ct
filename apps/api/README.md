# @qa-prism/api

Fastify gateway that orchestrates scans over a BullMQ queue (spec §2, §3).

## Endpoints

- `GET /health` → `{ ok: true }`
- `POST /scans` — body `{ target: { kind: 'url' | 'repo', value: string }, name? }`.
  Finds-or-creates the `Target`, creates a `queued` `Scan`, enqueues a job, and
  returns `202 { scanId, status }`.
- `GET /scans/:id` — the scan with its `findings`, `score`, and `target`
  (poll until `status === 'done'`).

## How a scan runs

`POST /scans` enqueues a job on the `scans` queue. The worker
([scan-processor.ts](src/scan-processor.ts)) marks the scan `running`, runs the
registered scanners (Phase 3: accessibility only), persists their `Finding[]`,
aggregates a `ScanScore` via `@qa-prism/scoring`, and marks the scan `done` (or
`failed`). Adding a scanner in Phase 4 is a one-line change to the `SCANNERS`
array.

## Running locally

Requires Postgres + Redis and a `.env` (see repo root `.env.example`). Fails
fast if `DATABASE_URL` / `REDIS_URL` are missing.

```bash
pnpm --filter @qa-prism/api dev     # tsx watch
# or
pnpm --filter @qa-prism/api build && pnpm --filter @qa-prism/api start
```

## Tests

```bash
pnpm --filter @qa-prism/api test    # env parsing (pure, no DB/Redis needed)
```
