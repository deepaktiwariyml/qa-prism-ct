import type { Severity } from '@qa-prism/core';

export interface HeaderCheck {
  /** Finding-code slug, e.g. "missing-hsts" → sec.missing-hsts. */
  slug: string;
  severity: Severity;
  title: string;
  description: string;
  remediation: string;
  /** If set, the header is "weak" (not just missing) unless it equals this. */
  expectedValue?: string;
}

/**
 * Response security headers we check for (spec §6.3). All checks are passive —
 * they only read what a normal GET returns.
 */
export const SECURITY_HEADERS: Record<string, HeaderCheck> = {
  'strict-transport-security': {
    slug: 'missing-hsts',
    severity: 'high',
    title: 'Missing Strict-Transport-Security (HSTS) header',
    description:
      'Without HSTS, a network attacker can downgrade the connection to HTTP on the first request.',
    remediation: 'Send Strict-Transport-Security with a max-age of at least 15552000 (180 days).',
  },
  'content-security-policy': {
    slug: 'missing-csp',
    severity: 'medium',
    title: 'Missing Content-Security-Policy header',
    description:
      'A Content-Security-Policy limits which resources can load, mitigating XSS and injection.',
    remediation: 'Define a Content-Security-Policy scoped to the origins the app actually uses.',
  },
  'x-content-type-options': {
    slug: 'missing-x-content-type-options',
    severity: 'medium',
    title: 'Missing or weak X-Content-Type-Options header',
    description: 'Without "nosniff", browsers may MIME-sniff responses and execute them unexpectedly.',
    remediation: 'Send X-Content-Type-Options: nosniff.',
    expectedValue: 'nosniff',
  },
  'x-frame-options': {
    slug: 'missing-x-frame-options',
    severity: 'medium',
    title: 'Missing X-Frame-Options header',
    description: 'Without framing protection the page can be embedded for clickjacking.',
    remediation: 'Send X-Frame-Options: DENY (or a CSP frame-ancestors directive).',
  },
  'referrer-policy': {
    slug: 'missing-referrer-policy',
    severity: 'low',
    title: 'Missing Referrer-Policy header',
    description: 'Without a Referrer-Policy, full URLs may leak to third parties via the Referer header.',
    remediation: 'Send Referrer-Policy: strict-origin-when-cross-origin (or stricter).',
  },
};

/** Cookie flag checks. */
export const COOKIE_CHECKS = {
  secure: { slug: 'cookie-insecure', severity: 'high' as Severity },
  httpOnly: { slug: 'cookie-no-httponly', severity: 'medium' as Severity },
  sameSite: { slug: 'cookie-no-samesite', severity: 'low' as Severity },
};

/** Request timeout for the passive probe. */
export const SECURITY_CONFIG = { timeoutMs: 15_000 } as const;
