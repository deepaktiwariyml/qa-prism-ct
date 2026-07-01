# @qa-prism/scanner-security

Passive security misconfiguration checks (spec §6.3). Depends only on
`@qa-prism/core`.

## Safety constraint (hard rule)

This scanner is **passive only**. It issues **GET requests and reads what the
server returns** — nothing else. It never performs active exploitation, fuzzing,
injection, auth attacks, or any state-changing request. Full DAST is explicitly
out of scope (spec §6.3, §12).

## What it checks

- **Response headers**: Strict-Transport-Security, Content-Security-Policy,
  X-Content-Type-Options (`nosniff`), X-Frame-Options, Referrer-Policy.
- **Cookies**: `Secure`, `HttpOnly`, `SameSite` flags on each Set-Cookie.
- **TLS**: whether the site is served over HTTPS.

Each missing/weak control becomes a `Finding` whose `code` names the exact
header, e.g. `sec.missing-hsts`, `sec.cookie-insecure`. Never throws — an
unreachable target yields one `info` finding.

## Tests

```bash
pnpm --filter @qa-prism/scanner-security test
```

Asserts missing-header/cookie findings, that only GET requests are made, and
graceful degradation on an unreachable target.
