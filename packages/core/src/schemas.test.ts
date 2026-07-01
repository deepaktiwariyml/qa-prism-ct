import { describe, expect, it } from 'vitest';
import { FindingSchema, type Finding } from './finding.js';
import { ScanScoreSchema, type ScanScore } from './score.js';
import { SelectionSchema, type Selection } from './selection.js';

const validFinding: Finding = {
  id: 'ckv1abc0000',
  scanId: 'scan_123',
  pillar: 'accessibility',
  severity: 'high',
  code: 'a11y.image-alt',
  title: 'Image is missing alt text',
  description: 'Images must have alternate text so screen readers can describe them.',
  location: { path: 'https://example.com/', selector: 'img.hero' },
  remediation: 'Add a descriptive alt attribute to the image.',
  tags: ['image', 'landing'],
  createdAt: '2026-07-01T12:00:00.000Z',
};

describe('FindingSchema', () => {
  it('accepts a well-formed finding', () => {
    expect(FindingSchema.parse(validFinding)).toEqual(validFinding);
  });

  it('accepts a Date().toISOString() timestamp', () => {
    const parsed = FindingSchema.parse({ ...validFinding, createdAt: new Date(0).toISOString() });
    expect(parsed.createdAt).toBe('1970-01-01T00:00:00.000Z');
  });

  it('rejects an unknown pillar', () => {
    expect(FindingSchema.safeParse({ ...validFinding, pillar: 'ux' }).success).toBe(false);
  });

  it('rejects a non-ISO timestamp', () => {
    expect(FindingSchema.safeParse({ ...validFinding, createdAt: 'yesterday' }).success).toBe(
      false,
    );
  });

  it('rejects an empty id', () => {
    expect(FindingSchema.safeParse({ ...validFinding, id: '' }).success).toBe(false);
  });
});

describe('ScanScoreSchema', () => {
  const score: ScanScore = {
    scanId: 'scan_123',
    overall: 82,
    pillars: [
      {
        pillar: 'accessibility',
        score: 74,
        findingCounts: { critical: 0, high: 1, medium: 2, low: 0, info: 0 },
      },
    ],
    correlations: [],
    computedAt: '2026-07-01T12:00:00.000Z',
  };

  it('accepts a well-formed scan score', () => {
    expect(ScanScoreSchema.parse(score)).toEqual(score);
  });

  it('rejects an out-of-range overall score', () => {
    expect(ScanScoreSchema.safeParse({ ...score, overall: 101 }).success).toBe(false);
  });
});

describe('SelectionSchema', () => {
  const selection: Selection = {
    platform: 'web-api',
    language: 'typescript',
    framework: 'playwright',
    reporter: 'allure',
    webBaseUrl: 'https://example.com',
  };

  it('accepts a well-formed selection', () => {
    expect(SelectionSchema.parse(selection)).toEqual(selection);
  });

  it('rejects an invalid platform', () => {
    expect(SelectionSchema.safeParse({ ...selection, platform: 'desktop' }).success).toBe(false);
  });

  it('rejects a malformed webBaseUrl', () => {
    expect(SelectionSchema.safeParse({ ...selection, webBaseUrl: 'not a url' }).success).toBe(
      false,
    );
  });
});
