# QA Prism

A unified quality-intelligence platform for QA engineers. QA Prism scans a
target across four pillars (automation health, accessibility, security,
performance), analyses PR-level change risk, correlates findings across pillars,
scaffolds automation frameworks, and pushes findings to Jira/Linear.

Built as a TypeScript (ESM) monorepo with pnpm + Turborepo.

## Layout

```
qa-prism/
├── apps/
│   ├── web/                 # Next.js (App Router) dashboard  [Phase 5]
│   └── api/                 # Fastify gateway + BullMQ orchestration  [Phase 3]
├── packages/
│   ├── core/                # canonical Finding/Score/Selection types + zod  [Phase 1]
│   ├── db/                  # Prisma schema + client + migrations + seed  [Phase 1]
│   ├── llm/                 # Anthropic wrapper + prompt templates  [Phase 7]
│   ├── scanners/
│   │   ├── automation/      # test-suite health (AST + report parsing)  [Phase 4]
│   │   ├── accessibility/   # axe-core / Playwright WCAG crawl  [Phase 3]
│   │   ├── security/        # passive header/cookie/TLS/CSP checks  [Phase 4]
│   │   └── performance/     # Lighthouse + bundle analysis  [Phase 4]
│   ├── scoring/             # aggregation + cross-pillar correlation  [Phase 2]
│   ├── impact-analyser/     # GitHub PR → dep graph → LLM → impact report  [Phase 7]
│   ├── generator/           # framework generator (port of /generator)  [Phase 6]
│   └── ticketing/           # Jira + Linear adapters  [Phase 8]
├── infra/docker-compose.yml # Postgres 16 + Redis 7 for local dev
└── generator/               # existing generator prototype (ported in Phase 6)
```

The canonical `Finding` schema in `@qa-prism/core` is the single finding shape
every module emits — that's what enables cross-pillar correlation.

## Prerequisites

- Node 20 LTS or newer (developed on Node 24)
- pnpm 10+ (`corepack enable` picks up the pinned version)
- Docker (for local Postgres + Redis) — required from Phase 1 onward

## Setup

```bash
pnpm install
cp .env.example .env          # fill in secrets as phases require them
docker compose -f infra/docker-compose.yml up -d   # Postgres + Redis (Phase 1+)
```

Every service reads secrets from env only and fails fast with a clear message
if a required var is missing. See `.env.example` for the full list.

## Common tasks

```bash
pnpm build        # turbo build across all packages
pnpm test         # turbo test
pnpm typecheck    # turbo typecheck
pnpm lint         # eslint across the workspace
pnpm format       # prettier --write
```

## Build phases

The project is built in the phase order defined in the spec (§10), with a human
review gate between each. A phase is "done" only when its acceptance-criteria
tests pass.

| Phase | Deliverable | Status |
|---|---|---|
| 0 | Repo skeleton (pnpm + Turborepo, tooling, docker-compose, empty packages) | ✅ done |
| 1 | Foundations: `core` + `db` | ✅ done |
| 2 | Scoring engine | ✅ done |
| 3 | First scanner (accessibility) end to end + api skeleton + queue | ✅ done |
| 4 | Remaining scanners (performance, security, automation) | ✅ done |
| 5 | Dashboard core | ✅ done |
| 6 | Generator (port prototype) + dashboard UX overhaul | ✅ done |
| 7 | PR impact analyser + LLM layer | ✅ done |
| 8 | Ticketing | ⏳ |
| 9 | Correlation polish + trends | ⏳ |

## Conventions

TypeScript strict mode; ESM only (relative imports end in `.js`, workspace
imports use `@qa-prism/*`); all external input validated with zod at the
boundary; no secrets in code; scoring/rendering deterministic (only the LLM
layer is non-deterministic, and its output is always schema-validated). The
security scanner is passive-only. See spec §9.
