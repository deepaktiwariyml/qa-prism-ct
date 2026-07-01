import { randomUUID } from 'node:crypto';
import {
  makeFindingCode,
  type Finding,
  type Severity,
  type ScanContext,
  type Scanner,
} from '@qa-prism/core';
import { COOKIE_CHECKS, SECURITY_CONFIG, SECURITY_HEADERS } from './config.js';

function nowIso(): string {
  return new Date().toISOString();
}

function finding(
  scanId: string,
  slug: string,
  severity: Severity,
  title: string,
  description: string,
  remediation: string,
  url: string,
  evidence: Record<string, unknown>,
  tags: string[],
): Finding {
  return {
    id: randomUUID(),
    scanId,
    pillar: 'security',
    severity,
    code: makeFindingCode('security', slug),
    title,
    description,
    location: { path: url },
    remediation,
    tags,
    evidence,
    createdAt: nowIso(),
  };
}

/** Parse a Set-Cookie string's flags (case-insensitive). */
function cookieFlags(raw: string): { name: string; secure: boolean; httpOnly: boolean; sameSite: boolean } {
  const name = raw.split('=', 1)[0]?.trim() ?? 'cookie';
  const lower = raw.toLowerCase();
  return {
    name,
    secure: /(^|;)\s*secure(\s*;|\s*$)/.test(lower),
    httpOnly: /(^|;)\s*httponly(\s*;|\s*$)/.test(lower),
    sameSite: /(^|;)\s*samesite=/.test(lower),
  };
}

/**
 * Passive security scanner (spec §6.3). Only issues GET requests and reads what
 * the server returns — never any active exploitation, fuzzing, or auth attacks.
 * Never throws: a failed fetch yields a single `info` finding.
 */
export const securityScanner: Scanner = async (ctx: ScanContext): Promise<Finding[]> => {
  if (ctx.target.kind !== 'url') return [];
  const url = ctx.target.value;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(SECURITY_CONFIG.timeoutMs),
    });
  } catch (err) {
    return [
      finding(
        ctx.scanId,
        'probe-failed',
        'info',
        'Security probe could not reach the target',
        `No response was received, so no passive checks ran: ${String(err)}`,
        'Verify the URL is reachable, then re-run the scan.',
        url,
        { error: String(err) },
        ['scan-error'],
      ),
    ];
  }

  const findings: Finding[] = [];

  // TLS: the site should be served over HTTPS.
  if (new URL(response.url || url).protocol === 'http:') {
    findings.push(
      finding(
        ctx.scanId,
        'no-https',
        'high',
        'Site is served over plain HTTP',
        'Traffic is unencrypted and can be read or modified in transit.',
        'Serve the site over HTTPS and redirect HTTP to HTTPS.',
        url,
        { finalUrl: response.url },
        ['tls'],
      ),
    );
  }

  // Response headers.
  for (const [header, check] of Object.entries(SECURITY_HEADERS)) {
    const value = response.headers.get(header);
    const missing = value === null;
    const weak = !missing && check.expectedValue !== undefined && value.toLowerCase() !== check.expectedValue;
    if (missing || weak) {
      findings.push(
        finding(
          ctx.scanId,
          check.slug,
          check.severity,
          check.title,
          check.description,
          check.remediation,
          url,
          { header, present: !missing, value },
          ['headers'],
        ),
      );
    }
  }

  // Cookies (Secure / HttpOnly / SameSite).
  for (const raw of response.headers.getSetCookie()) {
    const flags = cookieFlags(raw);
    const checks: Array<[keyof typeof COOKIE_CHECKS, boolean, string]> = [
      ['secure', flags.secure, 'Secure'],
      ['httpOnly', flags.httpOnly, 'HttpOnly'],
      ['sameSite', flags.sameSite, 'SameSite'],
    ];
    for (const [key, present, label] of checks) {
      if (!present) {
        const c = COOKIE_CHECKS[key];
        findings.push(
          finding(
            ctx.scanId,
            c.slug,
            c.severity,
            `Cookie "${flags.name}" is missing the ${label} attribute`,
            `The cookie "${flags.name}" does not set ${label}, weakening its protection.`,
            `Set the ${label} attribute on the "${flags.name}" cookie.`,
            url,
            { cookie: flags.name, attribute: label },
            ['cookies'],
          ),
        );
      }
    }
  }

  return findings;
};
