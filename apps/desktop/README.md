# QA Prism — Desktop app

A shareable macOS desktop build of QA Prism's **LLM-powered QA tools** — Test
Case Generator, PR Impact Analyser, Framework Generator, and Usage/cost
tracking. It runs entirely on the user's machine: an embedded local API talks
to the Anthropic API using a key the user sets in **Settings**. No database,
Redis, or headless browser — and no shared password. (Website Scans are not
included in the desktop build.)

## How it works

- **Electron main** (`src/main.ts`) starts, on localhost:
  - an **embedded Fastify API** (`src/api-server.ts`) — the LLM/generator/impact
    endpoints, with token usage written to a local JSON file (`src/usage-store.ts`);
  - the existing **Next.js UI** (the `@qa-prism/web` app) as a standalone server,
    with `DESKTOP_MODE=1` (bypasses the login gate) and `API_INTERNAL_URL`
    pointed at the embedded API.
- **Settings** (`settings.html` + `src/settings.ts`) stores the Anthropic key
  and GitHub token encrypted in the OS keychain (Electron `safeStorage`); model
  names and Jira URL are plain prefs. Saving relaunches the app so the new
  values take effect everywhere. First launch opens Settings automatically.

## Develop

```bash
pnpm install                      # once (downloads the Electron binary)
pnpm --filter @qa-prism/desktop dev
```

`dev` builds the Electron main, builds the web app, and launches Electron.

## Package a macOS installer

```bash
pnpm --filter @qa-prism/desktop dist:mac
```

Produces `apps/desktop/release/QA-Prism-<version>-<arch>.dmg` (+ a `.zip`).
Share the `.dmg` over Slack; teammates double-click to install.

> **Unsigned build note:** without an Apple Developer certificate the app is
> not code-signed/notarized, so on first open macOS Gatekeeper shows an
> "unidentified developer" warning. Teammates open it once via **right-click →
> Open** (or System Settings → Privacy & Security → Open Anyway). Signing +
> notarization removes this — add `CSC_LINK`/`CSC_KEY_PASSWORD` +
> `notarize` config when a cert is available.
