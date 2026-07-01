import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Launching a real browser + axe run needs more than the default 5s.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
