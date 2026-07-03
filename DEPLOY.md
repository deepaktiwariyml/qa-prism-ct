# Deploying QA Prism

A step-by-step guide from pushing the repo to a live, team-usable app. Target:
one **Hostinger VPS** running the whole stack via Docker Compose (all
open-source; the only paid piece is the VPS you already have).

**What runs where**

```
                    Internet (HTTPS)
                          │
                    ┌─────▼─────┐
                    │   Caddy   │  :80 / :443  (only exposed port)
                    └─────┬─────┘
                          │  internal docker network
      ┌───────────────────┼───────────────────┐
      ▼                   ▼                     ▼
  ┌───────┐          ┌─────────┐          ┌──────────┐
  │  web  │────────▶ │   api   │────────▶ │ postgres │
  │ Next  │  BFF     │ Fastify │  Prisma  └──────────┘
  └───────┘          │ +worker │────────▶ ┌──────────┐
                     └─────────┘  BullMQ  │  redis   │
                          │               └──────────┘
                     Chromium / Lighthouse
```

Everything except Caddy is private. The browser only ever talks to Caddy → web;
`api`, `postgres`, and `redis` are never exposed.

---

## 0. Prerequisites (once)

- A **GitHub** repo with this code (you already have it).
- The org **Claude API key** (`ANTHROPIC_API_KEY`).
- ~15 minutes.

---

## 1. Push the repo

From your machine, on the `main` branch:

```bash
git add -A
git commit -m "chore: deployment scaffold"   # if anything is uncommitted
git push origin main
```

That's the source of truth. The server will pull from here.

---

## 2. Prepare the Hostinger VPS

In **hPanel → VPS → your server**:

1. **OS:** if you can pick/rebuild the template, choose **Ubuntu 22.04** — or, to
   skip the next step, the **"Ubuntu 22.04 with Docker"** application template.
2. **SSH:** note the server's **IP**, and set an SSH key (VPS → SSH Keys) or use
   the root password shown in hPanel.
3. **Firewall:** in **VPS → Firewall**, ensure inbound **22, 80, 443** are
   allowed (if no rules exist, all traffic is allowed — that's fine to start).

Then connect: `ssh root@<VPS_IP>`.

---

## 3. Install Docker on the VPS

Skip if you used the "with Docker" template (check with `docker --version`).
Otherwise, on Ubuntu:

```bash
apt-get update && apt-get install -y ca-certificates curl git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | tee /etc/apt/keyrings/docker.asc >/dev/null
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | tee /etc/apt/sources.list.d/docker.list >/dev/null
apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

(If the OS firewall `ufw` is active, also run `ufw allow 80,443/tcp`.)

---

## 4. Point a domain at the VPS (for HTTPS)

The login cookie is `Secure`, so **the app must be served over HTTPS**. Use a
Hostinger domain (or subdomain):

1. **hPanel → Domains → your domain → DNS / Nameservers**.
2. Add an **A record**: name `qa` (or `@` for the root), value = your **VPS IP**,
   TTL default. → gives you `qa.yourdomain.com`.
3. Wait a couple of minutes for DNS to propagate.

Caddy will fetch a free Let's Encrypt certificate for that hostname
automatically. (No domain handy? Set `SITE_ADDRESS=:443` and switch the
`Caddyfile` to its `tls internal` block — self-signed, one-time browser warning.)

---

## 5. Get the code + secrets onto the VM

```bash
cd ~ && git clone https://github.com/deepaktiwariyml/qa-prism-ct.git
cd qa-prism-ct
cp .env.deploy.example .env
nano .env          # fill every value (see below), then save
chmod 600 .env
```

Fill `.env`:

| Variable                 | What to set                                              |
| ------------------------ | -------------------------------------------------------- |
| `POSTGRES_PASSWORD`      | any long random string                                   |
| `APP_PASSWORD`           | the team password you'll share with QA                   |
| `ANTHROPIC_API_KEY`      | your org's Claude key                                    |
| `GITHUB_TOKEN`           | optional (private-repo PRs / rate limits)                |
| `COMPANY_NAME`           | `Code and Theory`                                        |
| `SCAN_RETENTION_MINUTES` | `60`                                                     |
| `FUN_ENABLED`            | `true`                                                   |
| `SITE_ADDRESS`           | `qa-prism.duckdns.org` (your hostname)                   |

---

## 6. Launch

```bash
docker compose up -d --build
```

First build takes a few minutes (it installs Chromium for the scanners). Then:

```bash
docker compose ps                 # all services "running"/"healthy"
docker compose logs -f api        # watch: "Server listening", "scan worker listening"
```

Migrations run automatically on the API's first start.

---

## 7. Access it

Open **`https://<your SITE_ADDRESS>`** → the password gate → enter `APP_PASSWORD`
→ Dashboard. Run a scan, try the FUN game, download a report. Share the URL and
the team password with QA. Done. 🎉

---

## 8. (Optional) Auto-deploy on every push

`.github/workflows/deploy.yml` SSHes to the VM and rebuilds on push to `main`.
In **GitHub → Settings → Secrets and variables → Actions** add:

- **Secrets:** `SSH_HOST` (VPS IP), `SSH_USER` (`root` on Hostinger), `SSH_KEY` (a private
  key whose public half is on the VM), `POSTGRES_PASSWORD`, `APP_PASSWORD`,
  `ANTHROPIC_API_KEY`, `APP_GITHUB_TOKEN`.
- **Variables:** `COMPANY_NAME`, `SCAN_RETENTION_MINUTES`, `FUN_ENABLED`,
  `SITE_ADDRESS`.

The workflow rewrites `.env` on the VM from these secrets (so the key lives in
GitHub, never in the repo) and runs `docker compose up -d --build`.

---

## Day-2 operations

```bash
# Update manually (if not using the Action)
cd ~/qa-prism-ct && git pull && docker compose up -d --build

# Logs / status
docker compose logs -f web
docker compose ps

# Backup the database
docker compose exec postgres pg_dump -U qaprism qaprism > backup.sql

# Stop / start
docker compose down          # stop (keeps data volumes)
docker compose up -d         # start
```

## Notes & caveats

- **Scans are ephemeral** — deleted after `SCAN_RETENTION_MINUTES`. Download a
  report to keep one. This is by design.
- **Authenticated scans** use scripted login (username/password); they don't
  handle SSO/MFA. Performance for a login-gated page measures the pre-login view.
- **Memory:** Chromium + Lighthouse are the heavy bits — aim for a VPS plan with
  **≥ 4 GB RAM** (8 GB is comfortable for a team). Scans queue under load rather
  than overwhelming the box.
- **Rotate** `APP_PASSWORD`/`ANTHROPIC_API_KEY` by editing `.env` (or GitHub
  secrets) and re-running `docker compose up -d`.
- Set a **usage/budget alert** in the Anthropic console as a backstop.
