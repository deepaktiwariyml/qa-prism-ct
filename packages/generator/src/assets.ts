import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Directory containing the `registry/` and `partials/` template assets.
 *
 * Defaults to the package root (one level up from src/ and dist/). A host that
 * bundles this package — e.g. the desktop app, where import.meta.url points at
 * the bundle rather than this package — can override the location by setting
 * QA_GENERATOR_ROOT to a directory that holds `registry/` and `partials/`.
 * Resolved at call time so the env var can be set after import.
 */
export function assetsRoot(): string {
  const override = process.env.QA_GENERATOR_ROOT;
  if (override) return override;
  return join(dirname(fileURLToPath(import.meta.url)), '..');
}
