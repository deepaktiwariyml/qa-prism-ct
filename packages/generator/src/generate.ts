import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolve as resolveCell } from './resolve.js';
import { render } from './render.js';
import type { Selection } from './types.js';

export interface GenerateResult {
  matched: boolean;
  reason?: string;
  outDir?: string;
  files?: string[];
  rootName?: string;
}

/**
 * Library entry point (spec §6.7): resolve a selection to a cell and render it
 * to a temp directory. Deterministic — no install/compile here (that's
 * `validate`, used by the CLI/CI, not the download path).
 */
export async function generate(sel: Selection): Promise<GenerateResult> {
  const resolved = await resolveCell(sel);
  if (!resolved.matched || !resolved.manifest || !resolved.cellPath) {
    return { matched: false, reason: resolved.reason };
  }
  const work = await mkdtemp(join(tmpdir(), 'qaprism-gen-'));
  const rootName = sel.projectName || resolved.manifest.id;
  const outDir = join(work, rootName);
  const files = await render(resolved.manifest, resolved.cellPath, sel, outDir);
  return { matched: true, outDir, files, rootName };
}
