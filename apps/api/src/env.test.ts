import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

describe('parseEnv', () => {
  it('accepts a valid environment and applies defaults', () => {
    const result = parseEnv({
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      REDIS_URL: 'redis://localhost:6379',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.env.PORT).toBe(3001);
      expect(result.env.HOST).toBe('0.0.0.0');
    }
  });

  it('coerces PORT from a string', () => {
    const result = parseEnv({
      DATABASE_URL: 'x',
      REDIS_URL: 'y',
      PORT: '8080',
    });
    expect(result.success && result.env.PORT).toBe(8080);
  });

  it('reports every missing required variable', () => {
    const result = parseEnv({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.problems.some((p) => p.includes('DATABASE_URL'))).toBe(true);
      expect(result.problems.some((p) => p.includes('REDIS_URL'))).toBe(true);
    }
  });
});
