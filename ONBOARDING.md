# Run QA Prism locally

Get the app running on your machine in ~10 minutes. (macOS / Linux.)

## 1. Install the prerequisites

- **Node 20+** — check with `node -v`
- **pnpm** — `corepack enable` (ships with Node)
- **Docker Desktop** — for the local Postgres + Redis. Make sure it's running.

## 2. Get the code

```bash
git clone https://github.com/deepaktiwariyml/qa-prism-ct.git
cd qa-prism-ct
corepack enable
pnpm install
```

## 3. Install the browser the scanners use

```bash
pnpm --filter @qa-prism/api exec playwright install chromium
```

## 4. Configure environment

```bash
cp .env.example .env
```

Open `.env` and set just these two (leave the rest at their defaults):

- `APP_PASSWORD` — any password; you'll type it to log in.
- `ANTHROPIC_API_KEY` — the Claude key (ask Deepak). Needed for the PR impact
  analyser and the FUN word game; the rest of the app works without it.

## 5. Start the datastores (Postgres + Redis)

```bash
docker compose -f infra/docker-compose.yml up -d
```

## 6. Create the database tables

```bash
pnpm db:migrate
```

## 7. Run the app (two terminals)

**Terminal 1 — API + scan worker:**

```bash
pnpm --filter @qa-prism/api dev
```

Wait for `Server listening at http://127.0.0.1:3001`.

**Terminal 2 — dashboard:**

```bash
pnpm --filter @qa-prism/web dev
```

## 8. Open it

Go to **http://localhost:3000**, enter your `APP_PASSWORD`, and you're in.
Run a scan on any URL to check everything works.

---

### Troubleshooting

- **Login won't stick** → make sure you opened `http://localhost:3000` (not
  `127.0.0.1`) and that `APP_PASSWORD` in `.env` is set.
- **API won't start / DB errors** → is Docker running? Re-check
  `docker compose -f infra/docker-compose.yml ps` (postgres + redis should be
  `healthy`), then rerun `pnpm db:migrate`.
- **Performance scans do nothing** → run step 3 again (Chromium missing).
- **Port already in use** → stop whatever is on `3000`/`3001`, or change the
  dev port.

To stop the datastores later: `docker compose -f infra/docker-compose.yml down`.
