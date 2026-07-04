export interface ModuleDef {
  slug: string;
  name: string;
  tagline: string;
  /** Tabler-style single-path icon name is overkill here; use an emoji-free SVG key. */
  accent: string; // tailwind gradient stops, e.g. 'from-rose-500 to-orange-500'
  dot: string; // solid accent for small dots, e.g. 'bg-rose-500'
  what: string;
  how: string[];
  use: { label: string; href: string };
  codes: string[];
}

export const MODULES: ModuleDef[] = [
  {
    slug: 'accessibility',
    name: 'Accessibility',
    tagline: 'WCAG violations, found the way a screen reader would.',
    accent: 'from-fuchsia-500 to-pink-500',
    dot: 'bg-fuchsia-500',
    what: 'Crawls the landing page plus a bounded set of same-origin links with a real headless Chromium and runs axe-core against the rendered DOM. Every violation becomes a canonical finding with the exact selector, WCAG rule, and a plain-language fix.',
    how: [
      'Launches headless Chromium (Playwright) and navigates to your URL.',
      'Runs axe-core on the landing page and up to five same-origin links.',
      'Maps each violation to a finding — axe impact becomes a severity, the node target becomes the selector.',
      'Unreachable pages degrade to a single info finding, never a crash.',
    ],
    use: { label: 'Run an accessibility scan', href: '/dashboard' },
    codes: ['a11y.image-alt', 'a11y.label', 'a11y.color-contrast', 'a11y.region'],
  },
  {
    slug: 'performance',
    name: 'Performance',
    tagline: 'Core Web Vitals and bundle weight, mobile and desktop.',
    accent: 'from-amber-500 to-orange-500',
    dot: 'bg-amber-500',
    what: 'Runs Lighthouse on both mobile and desktop presets and turns Core Web Vitals plus JavaScript bundle weight into findings. Breaches are graded against configurable thresholds; every run records the measured values.',
    how: [
      'Runs Lighthouse (mobile + desktop) via a bundled Chromium binary.',
      'Reads LCP, CLS, TBT, TTI and total JS size from the report.',
      'Grades each against thresholds — 2.5s/4s for LCP, 1MB/3MB for bundles, and so on.',
      'Emits breach findings plus a per-form-factor summary with the raw numbers.',
    ],
    use: { label: 'Run a performance scan', href: '/dashboard' },
    codes: ['perf.lcp', 'perf.cls', 'perf.tbt', 'perf.js-bundle'],
  },
  {
    slug: 'security',
    name: 'Security',
    tagline: 'Passive misconfiguration checks — never an attack.',
    accent: 'from-emerald-500 to-teal-500',
    dot: 'bg-emerald-500',
    what: 'Inspects exactly what a normal GET returns — response headers, cookie flags, and TLS — and flags missing or weak controls. It performs zero state-changing requests: no fuzzing, no injection, no auth attacks.',
    how: [
      'Fetches the URL with a single GET and reads the response headers.',
      'Checks HSTS, CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy.',
      'Inspects each cookie for Secure, HttpOnly, and SameSite.',
      'Names the exact control in the finding code, e.g. sec.missing-hsts.',
    ],
    use: { label: 'Run a security scan', href: '/dashboard' },
    codes: ['sec.missing-hsts', 'sec.missing-csp', 'sec.cookie-insecure', 'sec.no-https'],
  },
  {
    slug: 'automation',
    name: 'Automation health',
    tagline: 'Read your test suite for the smells that make it flaky.',
    accent: 'from-sky-500 to-indigo-500',
    dot: 'bg-sky-500',
    what: 'Statically analyses your test files with a real TypeScript AST (regex for other languages) and ingests JUnit reports. It surfaces missing assertions, hardcoded waits, brittle selectors, and flaky/slow/skipped tests — without running a single test.',
    how: [
      'Walks a repo path (or reads uploaded report artifacts).',
      'Parses TS/JS tests to an AST; flags no-assertions, hardcoded waits, brittle selectors.',
      'Ingests JUnit XML for flaky, skipped, and slow tests.',
      'Degrades gracefully when only one input type is available.',
    ],
    use: { label: 'Add a repo path to a scan', href: '/dashboard' },
    codes: ['automation.no-assertions', 'automation.flaky', 'automation.hardcoded-wait'],
  },
  {
    slug: 'impact',
    name: 'PR impact analyser',
    tagline: 'Paste a PR link, get a manual tester’s checklist.',
    accent: 'from-violet-500 to-indigo-500',
    dot: 'bg-violet-500',
    what: 'Give it a GitHub pull request and it fetches the diff, builds a dependency graph of what the change touches, and asks Claude to produce a risk-ranked list of areas a manual tester should check — cross-linked to any existing scanner findings on the same area.',
    how: [
      'Parses the PR URL and fetches the diff + changed files from the GitHub API.',
      'Builds an import/dependency graph and prunes to one hop of dependents.',
      'Sends the bounded context to Claude for a schema-validated impact report.',
      'Cross-links each area to existing findings (“you’re shipping into an already-Critical area”).',
    ],
    use: { label: 'Analyse a pull request', href: '/impact' },
    codes: ['risk: critical', 'risk: high', 'suggested tests', 'related findings'],
  },
  {
    slug: 'testcases',
    name: 'Test case generator',
    tagline: 'Turn a feature description into a review-ready test plan.',
    accent: 'from-rose-500 to-pink-500',
    dot: 'bg-rose-500',
    what: 'Describe a feature (or paste a requirement) and Claude produces a comprehensive set of clear, one-line manual test cases — classified positive, negative, and edge. Review inline: approve or discard each, edit the wording, add your own columns and auto-fill them with AI, then export the plan to Excel or PDF (all cases or approved only).',
    how: [
      'Enter a description; Claude generates a comprehensive, classified set of one-line test cases.',
      'Approve (green) or discard (red) each case, and edit any wording inline.',
      'Add custom columns (Priority, Steps, Expected Result…) and auto-fill them with AI — test titles never change.',
      'Export to XLSX or PDF — all test cases, or approved-only.',
    ],
    use: { label: 'Open the test case generator', href: '/testcases' },
    codes: ['positive', 'negative', 'edge', 'export: xlsx / pdf'],
  },
  {
    slug: 'generator',
    name: 'Framework generator',
    tagline: 'A runnable automation framework from four dropdowns.',
    accent: 'from-cyan-500 to-blue-500',
    dot: 'bg-cyan-500',
    what: 'Pick a platform, language, framework, and reporter and download a complete, compiling automation framework — page objects, fixtures, reporting, CI, and a README. Template-first and deterministic, so what you download actually runs.',
    how: [
      'Reads the live registry of validated stack cells.',
      'Resolves your selection to a template cell (or flags an LLM fallback).',
      'Renders templates, merges reporter dependencies, and drops in shared CI.',
      'Streams the whole thing back as a zip.',
    ],
    use: { label: 'Open the generator', href: '/generator' },
    codes: ['playwright-ts', 'cypress-js', 'selenium-java', 'restassured-java'],
  },
];

export const moduleBySlug = (slug: string): ModuleDef | undefined =>
  MODULES.find((m) => m.slug === slug);
