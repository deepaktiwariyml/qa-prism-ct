import { describe, expect, it, vi } from 'vitest';
import { createLlmClient } from '@qa-prism/llm';
import { analyzePr } from './analyze.js';
import { parseGitHubPrUrl } from './parse-url.js';

describe('parseGitHubPrUrl', () => {
  it('parses a valid PR URL', () => {
    expect(parseGitHubPrUrl('https://github.com/vercel/next.js/pull/123')).toEqual({
      owner: 'vercel',
      repo: 'next.js',
      number: 123,
    });
  });
  it('returns null for a non-PR URL', () => {
    expect(parseGitHubPrUrl('https://github.com/vercel/next.js')).toBeNull();
  });
});

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

describe('analyzePr', () => {
  it('fetches a PR and returns schema-valid impact areas', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          title: 'Add coupon codes',
          body: 'See https://acme.atlassian.net/browse/SHOP-7',
          head: { ref: 'feature/SHOP-8-coupons' },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse([
          { filename: 'src/checkout/coupon.ts', status: 'added', patch: '@@ +1 @@\n+export const apply = () => {}' },
        ]),
      )
      .mockResolvedValueOnce(jsonResponse([{ commit: { message: 'SHOP-9 wire up coupon apply' } }]));

    const llm = createLlmClient({
      createMessage: async () =>
        JSON.stringify({
          whatsChanged: { summary: 'Adds coupon codes that reduce the order total at checkout.' },
          whatsImpacted: {
            summary: 'Checkout totals and coupon validation are the main blast radius.',
            areas: [
              {
                name: 'Checkout coupons',
                riskLevel: 'high',
                impact: 'New coupon logic affects order totals.',
                impactedFiles: ['src/checkout/coupon.ts'],
                userFlows: ['Apply a coupon at checkout and pay.'],
              },
            ],
          },
          testingChecklist: [
            {
              area: 'Checkout coupons',
              priority: 'high',
              what: 'Apply a valid coupon and confirm the total drops correctly.',
              risk: 'Incorrect discounts charge customers the wrong amount.',
            },
          ],
        }),
    });

    const result = await analyzePr(
      { prUrl: 'https://github.com/acme/shop/pull/42' },
      { fetchImpl, llm },
    );

    expect(result.owner).toBe('acme');
    expect(result.prNumber).toBe(42);
    expect(result.analysis.whatsImpacted.areas).toHaveLength(1);
    expect(result.analysis.whatsImpacted.areas[0]!.riskLevel).toBe('high');
    expect(result.analysis.testingChecklist).toHaveLength(1);
    expect(result.analysis.whatsChanged.summary).toContain('coupon');
    expect(result.changedFiles).toContain('src/checkout/coupon.ts');
    expect(result.limitations.length).toBeGreaterThan(0);
    // Tickets are pulled from body (explicit URL), branch, and commit
    // messages — the branch/commit keys link via the inferred Jira host.
    const keys = result.tickets.map((t) => t.key).sort();
    expect(keys).toEqual(['SHOP-7', 'SHOP-8', 'SHOP-9']);
    expect(result.tickets.every((t) => t.url.startsWith('https://acme.atlassian.net/browse/'))).toBe(true);
  });

  it('throws on a non-GitHub-PR URL', async () => {
    await expect(analyzePr({ prUrl: 'https://example.com/foo' })).rejects.toThrow();
  });

  it('surfaces a clear error when GitHub returns 404', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 404, json: async () => ({}) } as unknown as Response);
    await expect(
      analyzePr({ prUrl: 'https://github.com/acme/private/pull/1' }, { fetchImpl }),
    ).rejects.toThrow(/404/);
  });
});
