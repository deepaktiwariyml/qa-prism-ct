# @qa-prism/db

Prisma schema, generated client, and seed for QA Prism (spec §5).

## Models

`Target`, `Scan`, `Finding`, `ScanScore`, `ImpactReport`, `Ticket` — all with
`cuid()` ids. Indexes on foreign keys and on `(targetId, createdAt)` for trend
queries. `Finding.location`/`evidence`, `ScanScore.pillars`/`correlations`, and
`ImpactReport.areas` are JSONB; `Finding.tags` is a text[]. A
`@@unique([findingId, provider])` on `Ticket` makes ticket creation idempotent.

## Public API

- `export * from '@prisma/client'` — the generated client class and all model
  types (`Target`, `Scan`, `Finding`, …).
- `getPrisma()` — lazily-instantiated shared client (no connection on import).
- `disconnectPrisma()` — for graceful shutdown.

## Commands

Requires a running Postgres (see `infra/docker-compose.yml`) with `DATABASE_URL`
set. `db:generate` works offline; the rest need a live database.

```bash
docker compose -f ../../infra/docker-compose.yml up -d   # Postgres + Redis
pnpm --filter @qa-prism/db db:generate   # regenerate the client (offline)
pnpm --filter @qa-prism/db db:migrate    # prisma migrate dev
pnpm --filter @qa-prism/db db:seed       # insert the demo target + scan
```
