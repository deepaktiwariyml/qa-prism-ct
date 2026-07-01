import { describe, expect, it } from 'vitest';
import { PILLAR_CODE_PREFIX, PILLARS, makeFindingCode } from './pillar.js';

describe('makeFindingCode', () => {
  it('namespaces by pillar prefix', () => {
    expect(makeFindingCode('accessibility', 'image-alt')).toBe('a11y.image-alt');
    expect(makeFindingCode('security', 'missing-hsts')).toBe('sec.missing-hsts');
    expect(makeFindingCode('performance', 'lcp')).toBe('perf.lcp');
    expect(makeFindingCode('automation', 'no-assertions')).toBe('automation.no-assertions');
  });

  it('slugifies arbitrary input to stable kebab-case', () => {
    expect(makeFindingCode('accessibility', 'Image Alt Text!')).toBe('a11y.image-alt-text');
    expect(makeFindingCode('security', '  Missing   HSTS  ')).toBe('sec.missing-hsts');
    expect(makeFindingCode('performance', 'LCP > 4s')).toBe('perf.lcp-4s');
  });

  it('throws when the slug has no usable characters', () => {
    expect(() => makeFindingCode('automation', '   ')).toThrow();
    expect(() => makeFindingCode('automation', '!!!')).toThrow();
  });

  it('has a prefix for every pillar', () => {
    for (const pillar of PILLARS) {
      expect(PILLAR_CODE_PREFIX[pillar]).toBeTruthy();
    }
  });
});
