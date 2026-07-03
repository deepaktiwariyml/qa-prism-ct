# Deploying QA Prism

A step-by-step guide from pushing the repo to a live, team-usable app — using
only free and open-source pieces. Target: one **Oracle Cloud Always Free** VM
running the whole stack via Docker Compose.

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

## 2. Create the free Oracle Cloud VM

1. Sign up at <https://www.oracle.com/cloud/free/> (a card is needed for identity
   verification — Always Free is not charged; see the FAQ in the repo notes).
2. **Compute → Instances → Create instance**:
   - **Image:** Ubuntu 22.04
   - **Shape:** `VM.Standard.A1.Flex` (Ampere/ARM) — Always Free allows up to
     4 OCPU / 24 GB. Pick **2 OCPU / 12 GB** (plenty; leaves headroom in the free
     allocation).
   - Add your **SSH public key**.
3. **Networking → Security List / NSG:** allow **ingress on 80 and 443** from
   `0.0.0.0/0`. Leave everything else closed.
4. Note the instance's **public IP**.

> Tip: to never worry about idle-instance reclamation, later upgrade the account
> to **Pay As You Go** — staying within Always Free limits still costs $0, but
> PAYG instances are exempt from the idle-reclaim policy.

---

## 3. Install Docker on the VM

SSH in (`ssh ubuntu@<PUBLIC_IP>`), then:

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo tee /etc/apt/keyrings/docker.asc >/dev/null
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker $USER && newgrp docker   # run docker without sudo

# Ubuntu on Oracle blocks ports by default at the OS firewall too — open 80/443:
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save 2>/dev/null || true
```

---

## 4. (Recommended) Get a free hostname for HTTPS

The login cookie is `Secure`, so **the app must be served over HTTPS**. Easiest
free path — a DuckDNS subdomain:

1. Go to <https://www.duckdns.org>, sign in, create e.g. `qa-prism`.
2. Point it at your VM's public IP.
3. Your address is `qa-prism.duckdns.org`.

(No domain? You can set `SITE_ADDRESS=:443` and switch the `Caddyfile` to the
`tls internal` block — self-signed, works over HTTPS with a one-time browser
warning.)

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

- **Secrets:** `SSH_HOST` (VM IP), `SSH_USER` (`ubuntu`), `SSH_KEY` (a private
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
- **Memory:** Chromium + Lighthouse are the heavy bits; 12 GB is comfortable for
  a small team. Scans queue under load rather than overwhelming the box.
- **Rotate** `APP_PASSWORD`/`ANTHROPIC_API_KEY` by editing `.env` (or GitHub
  secrets) and re-running `docker compose up -d`.
- Set a **usage/budget alert** in the Anthropic console as a backstop.
