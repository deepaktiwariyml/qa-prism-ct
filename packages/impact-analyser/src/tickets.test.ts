import { describe, expect, it } from 'vitest';
import { extractTickets } from './tickets.js';

describe('extractTickets', () => {
  it('extracts a Jira browse URL from the body', () => {
    const t = extractTickets('Fixes the coupon bug.\n\nJira: https://acme.atlassian.net/browse/SHOP-123');
    expect(t).toEqual([{ key: 'SHOP-123', url: 'https://acme.atlassian.net/browse/SHOP-123', source: 'jira' }]);
  });

  it('extracts a Linear issue URL', () => {
    const t = extractTickets('See https://linear.app/acme/issue/ENG-42/some-slug for details.');
    expect(t[0]!.key).toBe('ENG-42');
    expect(t[0]!.source).toBe('linear');
  });

  it('does not link a bare key without a configured base URL', () => {
    expect(extractTickets('SHOP-123: add coupons')).toEqual([]);
  });

  it('links a bare key when a base URL is configured', () => {
    const t = extractTickets('SHOP-123: add coupons', { jiraBaseUrl: 'https://acme.atlassian.net/' });
    expect(t).toEqual([{ key: 'SHOP-123', url: 'https://acme.atlassian.net/browse/SHOP-123', source: 'jira' }]);
  });

  it('prefers the explicit URL over a constructed one and dedupes', () => {
    const t = extractTickets(
      'SHOP-9 https://acme.atlassian.net/browse/SHOP-9',
      { jiraBaseUrl: 'https://wrong.example.com' },
    );
    expect(t).toHaveLength(1);
    expect(t[0]!.url).toBe('https://acme.atlassian.net/browse/SHOP-9');
  });

  it('returns nothing for text with no tickets', () => {
    expect(extractTickets('just a normal description')).toEqual([]);
  });
});
