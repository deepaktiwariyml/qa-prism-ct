import { describe, expect, it } from 'vitest';
import {
  SEVERITIES,
  bumpSeverity,
  highestSeverity,
  maxSeverity,
  normalizeSeverity,
} from './severity.js';

describe('normalizeSeverity', () => {
  it('maps axe-core impacts onto the rubric', () => {
    expect(normalizeSeverity('critical', 'accessibility')).toBe('critical');
    expect(normalizeSeverity('serious', 'accessibility')).toBe('high');
    expect(normalizeSeverity('moderate', 'accessibility')).toBe('medium');
    expect(normalizeSeverity('minor', 'accessibility')).toBe('low');
  });

  it('maps generic tool words and is case/space insensitive', () => {
    expect(normalizeSeverity('ERROR', 'automation')).toBe('high');
    expect(normalizeSeverity(' Warning ', 'security')).toBe('medium');
    expect(normalizeSeverity('blocker', 'security')).toBe('critical');
    expect(normalizeSeverity('informational', 'performance')).toBe('info');
  });

  it('passes rubric values through unchanged', () => {
    for (const s of SEVERITIES) {
      expect(normalizeSeverity(s, 'performance')).toBe(s);
    }
  });

  it('falls back to medium for unknown values (surface, do not drop)', () => {
    expect(normalizeSeverity('wat', 'automation')).toBe('medium');
  });
});

describe('severity ordering helpers', () => {
  it('maxSeverity picks the more severe', () => {
    expect(maxSeverity('low', 'critical')).toBe('critical');
    expect(maxSeverity('medium', 'high')).toBe('high');
    expect(maxSeverity('info', 'info')).toBe('info');
  });

  it('highestSeverity of an empty list is info', () => {
    expect(highestSeverity([])).toBe('info');
    expect(highestSeverity(['low', 'high', 'medium'])).toBe('high');
  });

  it('bumpSeverity raises one level and caps at critical', () => {
    expect(bumpSeverity('info')).toBe('low');
    expect(bumpSeverity('medium')).toBe('high');
    expect(bumpSeverity('high')).toBe('critical');
    expect(bumpSeverity('critical')).toBe('critical');
  });
});
