import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RegistryIndex, Manifest, Selection, ResolveResult } from './types.js';
import { assetsRoot } from './assets.js';

/**
 * Resolve a user's dropdown selection to a concrete template cell.
 *
 * Deterministic path: find a registry cell whose framework + language match
 * and whose supported platforms include the requested one, then confirm the
 * chosen reporter is supported.
 *
 * Fallback path: when no cell matches, we return matched:false with a reason.
 * In the full product this is where an LLM-generated (review-flagged) framework
 * would be produced instead of failing.
 */
export async function resolve(sel: Selection): Promise<ResolveResult> {
  const REGISTRY = join(assetsRoot(), 'registry');
  const index: RegistryIndex = JSON.parse(
    await readFile(join(REGISTRY, 'index.json'), 'utf8'),
  );

  const cell = index.cells.find(
    (c) =>
      c.framework === sel.framework &&
      c.language === sel.language &&
      c.platforms.includes(sel.platform),
  );

  if (!cell) {
    return {
      matched: false,
      reason: `No template for framework="${sel.framework}", language="${sel.language}", platform="${sel.platform}". (LLM fallback would generate a review-flagged framework here.)`,
    };
  }

  const manifest: Manifest = JSON.parse(
    await readFile(join(REGISTRY, cell.path, 'manifest.json'), 'utf8'),
  );

  if (!manifest.supports.reporters.includes(sel.reporter)) {
    return {
      matched: false,
      reason: `Cell "${cell.id}" does not support reporter "${sel.reporter}". Supported: ${manifest.supports.reporters.join(', ')}.`,
    };
  }

  return { matched: true, manifest, cellPath: join(REGISTRY, cell.path) };
}
