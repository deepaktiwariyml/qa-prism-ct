import { spawn } from 'node:child_process';
import type { Manifest } from './types.js';

function run(cmd: string, cwd: string): Promise<{ cmd: string; ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, { cwd, shell: true });
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    child.on('close', (code) => resolve({ cmd, ok: code === 0, output: output.slice(-2000) }));
  });
}

/**
 * Run each postGenerate command in sequence inside the generated project.
 * This is the trust step: a framework that fails `tsc --noEmit` never ships.
 * Set skip=true to scaffold without installing (useful for a fast dry run).
 */
export async function validate(
  manifest: Manifest,
  outDir: string,
  skip = false,
): Promise<{ passed: boolean; results: Array<{ cmd: string; ok: boolean; output: string }> }> {
  if (skip || manifest.postGenerate.length === 0) {
    return { passed: true, results: [] };
  }
  const results = [];
  for (const cmd of manifest.postGenerate) {
    const r = await run(cmd, outDir);
    results.push(r);
    if (!r.ok) return { passed: false, results };
  }
  return { passed: true, results };
}
