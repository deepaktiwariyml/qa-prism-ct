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

## Opening a shared (unsigned) build — read this

The build is **not** signed with an Apple Developer certificate, so when a
teammate downloads the `.dmg` (Slack, email, etc.) macOS quarantines it and
refuses to open the app with a misleading message:

> "QA Studio" is damaged and can't be opened.

It is **not** damaged — that's Gatekeeper blocking an unsigned, downloaded
app. To open it, each recipient does this once:

1. Open the `.dmg` and drag **QA Studio** into **Applications**.
2. In **Terminal**, remove the quarantine flag:
   ```bash
   xattr -dr com.apple.quarantine "/Applications/QA Studio.app"
   ```
3. Open QA Studio normally.

(Plain "right-click → Open" does not clear the *damaged* state; the `xattr`
command is the reliable fix.)

### Removing the warning entirely (optional)
The permanent fix is **code signing + notarization**, which needs an Apple
Developer account (~$99/yr). With a Developer ID cert, set `CSC_LINK` +
`CSC_KEY_PASSWORD` and enable `mac.notarize` in the build config; then the
`.dmg` opens with no warning and no `xattr` step for anyone.
