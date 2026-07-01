# QA Prism — Framework Generator

The engine that turns stack selections (from the configurator dropdowns) into a
runnable automation framework. Template-first and deterministic, with an
LLM-fallback branch for combinations that don't yet have a hand-built template.

## Available stack cells

| Cell | Framework | Language | Platforms | Reporters |
|---|---|---|---|---|
| playwright-ts | Playwright | TypeScript | web, api, web-api, all | allure, html, junit |
| cypress-js | Cypress | JavaScript | web, web-api | mochawesome, html |
| playwright-python | Playwright | Python | web, api, web-api, all | allure, html |
| appium-python | Appium | Python | mobile, mobile-api | allure, html |
| selenium-java | Selenium + TestNG | Java | web, web-api, all | allure, extent |
| restassured-java | RestAssured + TestNG | Java | api | allure, extent |

Adding another stack means dropping in a new `registry/<cell>/` folder — the
engine never changes (see "Adding a new stack" below).

---

## How it works (resolve → render → validate)

1. **resolve** — a selection (`platform`, `language`, `framework`, `reporter`)
   is looked up in `registry/index.json`. A match loads that cell's
   `manifest.json`. No match → returns a reason (the LLM-fallback hook).
2. **render** — walks the cell's `files/`, substitutes `{{placeholders}}`,
   merges the chosen reporter's dependencies, drops in shared partials (CI),
   and writes everything to the output directory.
3. **validate** — runs the manifest's `postGenerate` commands
   (`npm install`, `tsc --noEmit`) so a framework that doesn't compile never
   ships. This is the trust step.

---

## Running it

Open this folder in **Cursor** (or VS Code) and use the integrated terminal.

```bash
npm install            # one-time: install the generator's own deps

npm run list           # show available stack cells

# generate a framework
npx tsx engine/generate.ts \
  --framework playwright \
  --language typescript \
  --platform web-api \
  --reporter allure \
  --name my-suite \
  --webUrl https://my-app.com \
  --out ./generated/my-suite

# fast scaffold without installing/compiling (dry run)
npx tsx engine/generate.ts --framework playwright --language typescript \
  --platform web --reporter html --out ./generated/quick --skip-validate
```

The generated framework appears in `--out`. `cd` into it, then
`npm install && npm run install:browsers && npm test`.

---

## End-to-end: the web configurator

Instead of the CLI, run the local server and use the browser UI — pick a stack
from dropdowns (fed live from the registry) and download a generated framework.

```bash
npm install
npm run serve          # → http://localhost:4321
```

Open the URL, choose platform / language / framework / reporter, click
**Generate & download**. Under the hood the browser POSTs your selection to
`/api/generate`, which runs the same resolve → render pipeline and streams back
a zip. The dropdowns read `/api/cells` (the registry index), so the UI and the
engine can never drift apart.

---

## Project layout

```
generator/
├── engine/
│   ├── types.ts       Shared interfaces
│   ├── resolve.ts     Selection → template cell (+ LLM-fallback branch)
│   ├── render.ts      Variable substitution + file assembly + partials
│   ├── validate.ts    Post-generation install + compile check
│   └── generate.ts    CLI entry point
├── registry/
│   ├── index.json     Master cell list (the dropdowns read this too)
│   └── playwright-ts/
│       ├── manifest.json   Deps, variables, supported reporters
│       └── files/          Template files (.tmpl = substituted)
└── partials/
    ├── ci/            Shared CI workflow
    └── reporters/     Shared reporter snippets
```

---

## Adding a new stack (the whole point)

Adding, say, Selenium + Java is **"drop in a folder," not "edit the engine":**

1. Create `registry/selenium-java/` with a `manifest.json` and a `files/` tree
   whose templated files use `.tmpl` and `{{placeholders}}`.
2. Add an entry to `registry/index.json`.
3. Done — the engine, CLI, and (once wired) the configurator pick it up.

The engine never needs to change to support a new stack. That's what keeps the
matrix maintainable.

---

## LLM's role

Generation is deterministic on purpose — downloaded frameworks must compile.
The LLM layer is reserved for: tailoring READMEs to the exact stack, seeding
example tests from a real app (URL/PR from the other QA Prism modules), and the
fallback branch in `resolve.ts` for stacks without a template yet (clearly
flagged "generated, review before use").
