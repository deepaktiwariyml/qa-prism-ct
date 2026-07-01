import { describe, expect, it } from 'vitest';
import { ScanScoreSchema, type Finding, type Pillar, type Severity } from '@qa-prism/core';
import { scoreScan } from './score.js';

let seq = 0;
function f(
  pillar: Pillar,
  severity: Severity,
  extra: Partial<Finding> = {},
): Finding {
  seq += 1;
  return {
    id: `find_${String(seq).padStart(4, '0')}`,
    scanId: 'scan_1',
    pillar,
    severity,
    code: `${pillar}.test`,
    title: 'test finding',
    description: 'desc',
    location: { path: '/x' },
    remediation: 'fix it',
    tags: [],
    createdAt: '2026-07-01T00:00:00.000Z',
    ...extra,
  };
}

const NOW = '2026-07-01T12:00:00.000Z';

describe('scoreScan — pillar & overall scores', () => {
  it('empty findings score 100 across the board', () => {
    const score = scoreScan('scan_1', [], { now: NOW });
    expect(score.overall).toBe(100);
    expect(score.pillars).toHaveLength(4);
    for (const p of score.pillars) {
      expect(p.score).toBe(100);
      expect(p.findingCounts).toEqual({ critical: 0, high: 0, medium: 0, low: 0, info: 0 });
    }
    expect(score.correlations).toEqual([]);
    expect(ScanScoreSchema.parse(score)).toEqual(score);
  });

  it('drives the score to 0 when every pillar is saturated with criticals', () => {
    const findings = (['automation', 'accessibility', 'security', 'performance'] as Pillar[]).flatMap(
      (p) => Array.from({ length: 4 }, () => f(p, 'critical')),
    );
    const score = scoreScan('scan_1', findings, { now: NOW });
    expect(score.overall).toBe(0);
    for (const p of score.pillars) expect(p.score).toBe(0);
  });

  it('applies severity penalties from the default rubric', () => {
    // accessibility: one high (12) -> 88; automation: one medium (5) -> 95.
    const score = scoreScan('scan_1', [f('accessibility', 'high'), f('automation', 'medium')], {
      now: NOW,
    });
    const a11y = score.pillars.find((p) => p.pillar === 'accessibility')!;
    const auto = score.pillars.find((p) => p.pillar === 'automation')!;
    expect(a11y.score).toBe(88);
    expect(a11y.findingCounts.high).toBe(1);
    expect(auto.score).toBe(95);
    // overall = mean(88, 95, 100, 100) = 95.75 -> 96
    expect(score.overall).toBe(96);
  });

  it('honors custom pillar weights', () => {
    const findings = [f('security', 'critical')]; // security 75, others 100
    const equal = scoreScan('scan_1', findings, { now: NOW });
    expect(equal.overall).toBe(94); // mean(75,100,100,100)=93.75 -> 94
    const heavy = scoreScan('scan_1', findings, {
      now: NOW,
      weights: { security: 7, automation: 1, accessibility: 1, performance: 1 },
    });
    // (75*7 + 100*3) / 10 = 82.5 -> 83
    expect(heavy.overall).toBe(83);
  });
});

describe('scoreScan — determinism', () => {
  it('produces identical output regardless of input order', () => {
    const a = f('accessibility', 'high', { tags: ['checkout'] });
    const b = f('automation', 'medium', { tags: ['checkout'] });
    const forward = scoreScan('scan_1', [a, b], { now: NOW });
    const reversed = scoreScan('scan_1', [b, a], { now: NOW });
    expect(reversed).toEqual(forward);
  });
});

describe('findCorrelations — cross-pillar linking', () => {
  it('links an a11y and an automation finding that share the "checkout" tag', () => {
    const a = f('accessibility', 'high', { id: 'find_a', tags: ['checkout', 'form'] });
    const b = f('automation', 'medium', { id: 'find_b', tags: ['checkout', 'selector'] });
    const score = scoreScan('scan_1', [a, b], { now: NOW });

    expect(score.correlations).toHaveLength(1);
    const c = score.correlations[0]!;
    expect(c.findingIds.sort()).toEqual(['find_a', 'find_b']);
    expect(c.pillars).toEqual(['automation', 'accessibility']); // PILLARS order
    expect(c.severity).toBe('high'); // max(high, medium), 2 findings -> no bump
    expect(c.rationale).toContain('checkout');
  });

  it('does not correlate findings within a single pillar', () => {
    const a = f('accessibility', 'high', { tags: ['checkout'] });
    const b = f('accessibility', 'low', { tags: ['checkout'] });
    const score = scoreScan('scan_1', [a, b], { now: NOW });
    expect(score.correlations).toEqual([]);
  });

  it('bumps combined severity one level when 3+ findings link', () => {
    const a = f('accessibility', 'medium', { tags: ['checkout'] });
    const b = f('automation', 'medium', { tags: ['checkout'] });
    const c = f('security', 'medium', { tags: ['checkout'] });
    const score = scoreScan('scan_1', [a, b, c], { now: NOW });
    expect(score.correlations).toHaveLength(1);
    expect(score.correlations[0]!.pillars).toHaveLength(3);
    expect(score.correlations[0]!.severity).toBe('high'); // medium bumped once
  });

  it('links via shared location.component too, not just tags', () => {
    const a = f('accessibility', 'high', { location: { path: '/x', component: 'Cart' } });
    const b = f('performance', 'medium', { location: { path: '/y', component: 'Cart' } });
    const score = scoreScan('scan_1', [a, b], { now: NOW });
    expect(score.correlations).toHaveLength(1);
    expect(score.correlations[0]!.pillars).toEqual(['accessibility', 'performance']);
  });
});
