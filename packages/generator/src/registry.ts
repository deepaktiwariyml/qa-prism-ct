import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RegistryIndex } from './types.js';

/** registry/ lives at the package root, one level up from src/ and dist/. */
const REGISTRY = join(dirname(fileURLToPath(import.meta.url)), '..', 'registry');

/** Load the master registry index (the dashboard dropdowns read this). */
export async function loadRegistry(): Promise<RegistryIndex> {
  return JSON.parse(await readFile(join(REGISTRY, 'index.json'), 'utf8')) as RegistryIndex;
}
