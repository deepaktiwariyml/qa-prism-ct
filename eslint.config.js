import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/next-env.d.ts',
      // The original generator prototype (now ported to packages/generator).
      'generator/**',
      // Generator template assets — rendered output, not workspace source.
      'packages/generator/registry/**',
      'packages/generator/partials/**',
      // Electron desktop app (mixed ESM/CJS + Node/Electron globals) — it is
      // type-checked by its own strict tsconfig instead of the root ESLint.
      'apps/desktop/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },
  {
    // Build/config scripts run in Node and may reference Node globals.
    files: ['**/*.config.{js,mjs,cjs}'],
    languageOptions: {
      globals: { process: 'readonly', __dirname: 'readonly', module: 'writable', require: 'readonly' },
    },
  },
);
