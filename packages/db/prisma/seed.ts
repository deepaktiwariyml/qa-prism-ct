// Seed one demo Target + Scan with sample findings across all four pillars,
// plus a hand-set ScanScore, for local dashboard development (spec §5).
// Re-runnable: it clears the demo target (cascades) before recreating.
//
// Two findings deliberately share the `checkout` tag across the accessibility
// and automation pillars so the Phase 2 correlation engine has something to link.

import { PrismaClient, type Pillar, type Severity } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_TARGET_NAME = 'QA Prism Demo';

type SeedFinding = {
  pillar: Pillar;
  severity: Severity;
  code: string;
  title: string;
  description: string;
  location: Record<string, unknown>;
  remediation: string;
  tags: string[];
  evidence?: Record<string, unknown>;
};

const findings: SeedFinding[] = [
  {
    pillar: 'accessibility',
    severity: 'high',
    code: 'a11y.label',
    title: 'Checkout email input has no accessible label',
    description:
      'The email field in the checkout form has no associated <label> or aria-label, so screen-reader users cannot tell what to enter.',
    location: { path: '/checkout', selector: 'form#checkout input[name="email"]' },
    remediation: 'Associate a <label for> with the input or add an aria-label.',
    tags: ['form', 'checkout', 'input'],
    evidence: { ruleId: 'label', impact: 'serious' },
  },
  {
    pillar: 'automation',
    severity: 'medium',
    code: 'automation.brittle-selector',
    title: 'Checkout test targets a fragile deep CSS selector',
    description:
      'The checkout spec locates the email field by a deep nth-child CSS path instead of a data-testid or role, making it brittle to markup changes.',
    location: { path: 'tests/checkout.spec.ts', line: 42, component: 'checkout' },
    remediation: 'Add a data-testid to the input and select by it (getByTestId).',
    tags: ['checkout', 'selector', 'flaky-risk'],
    evidence: { selector: 'div > div:nth-child(3) > input' },
  },
  {
    pillar: 'security',
    severity: 'high',
    code: 'sec.missing-hsts',
    title: 'Response is missing the Strict-Transport-Security header',
    description:
      'Without HSTS the site can be downgraded to HTTP by a network attacker on the first request.',
    location: { path: 'https://demo.qa-prism.local/' },
    remediation: 'Send Strict-Transport-Security with a max-age of at least 15552000.',
    tags: ['headers', 'tls'],
    evidence: { header: 'strict-transport-security', present: false },
  },
  {
    pillar: 'performance',
    severity: 'medium',
    code: 'perf.lcp',
    title: 'Largest Contentful Paint is slower than 2.5s',
    description:
      'Measured LCP of 3.1s on mobile exceeds the 2.5s "good" threshold, hurting perceived load speed.',
    location: { path: 'https://demo.qa-prism.local/' },
    remediation: 'Preload the hero image and defer non-critical JavaScript.',
    tags: ['web-vitals', 'lcp', 'landing'],
    evidence: { metric: 'lcp', valueMs: 3100, thresholdMs: 2500 },
  },
];

async function main(): Promise<void> {
  // Clear any previous demo data (cascades to scans/findings/scores).
  await prisma.target.deleteMany({ where: { name: DEMO_TARGET_NAME } });

  const now = new Date();
  const target = await prisma.target.create({
    data: {
      name: DEMO_TARGET_NAME,
      kind: 'url',
      value: 'https://demo.qa-prism.local/',
    },
  });

  const scan = await prisma.scan.create({
    data: {
      targetId: target.id,
      status: 'done',
      startedAt: new Date(now.getTime() - 60_000),
      finishedAt: now,
      findings: { create: findings },
    },
  });

  await prisma.scanScore.create({
    data: {
      scanId: scan.id,
      overall: 78,
      pillars: [
        {
          pillar: 'accessibility',
          score: 76,
          findingCounts: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
        },
        {
          pillar: 'automation',
          score: 90,
          findingCounts: { critical: 0, high: 0, medium: 1, low: 0, info: 0 },
        },
        {
          pillar: 'security',
          score: 76,
          findingCounts: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
        },
        {
          pillar: 'performance',
          score: 90,
          findingCounts: { critical: 0, high: 0, medium: 1, low: 0, info: 0 },
        },
      ],
      correlations: [],
    },
  });

  console.log(`Seeded target ${target.id} with scan ${scan.id} (${findings.length} findings).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
