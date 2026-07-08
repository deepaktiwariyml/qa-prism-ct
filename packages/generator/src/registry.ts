import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RegistryIndex } from './types.js';
import { assetsRoot } from './assets.js';

/** Load the master registry index (the dashboard dropdowns read this). */
export async function loadRegistry(): Promise<RegistryIndex> {
  const registry = join(assetsRoot(), 'registry');
  return JSON.parse(await readFile(join(registry, 'index.json'), 'utf8')) as RegistryIndex;
}
