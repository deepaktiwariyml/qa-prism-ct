// Assemble a self-contained, SYMLINK-FREE copy of the web app for packaging.
//
// Electron-builder mangles pnpm's symlinked node_modules (the store links go
// dangling in the installed app, breaking the UI). So we use `pnpm deploy`
// with a hoisted node-linker to produce a flat node_modules of real files,
// then strip the few remaining .bin symlinks. electron-builder then ships
// `build-web/` verbatim as resources/web — real files only.
import { execSync } from 'node:child_process';
import { rmSync, readdirSync, lstatSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(desktop, '..', '..');
const out = join(desktop, 'build-web');

rmSync(out, { recursive: true, force: true });

console.log('Deploying web (hoisted, symlink-free) →', out);
execSync(
  `pnpm --filter @qa-prism/web deploy --prod --legacy --config.node-linker=hoisted "${out}"`,
  { cwd: repoRoot, stdio: 'inherit' },
);

// Strip any residual symlinks (the .bin executable shims) — unused at runtime,
// and they would dangle once electron-builder copies the tree.
let removed = 0;
function strip(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    let st;
    try {
      st = lstatSync(p);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) {
      rmSync(p, { force: true });
      removed += 1;
    } else if (st.isDirectory()) {
      strip(p);
    }
  }
}
strip(out);

// Drop build-time-only artifacts that `next start` never reads. The webpack
// build cache alone is ~450 MB; none of this affects the running app.
function sizeMB(p) {
  try {
    return Math.round(Number(execSync(`du -sk "${p}"`).toString().split('\t')[0]) / 1024);
  } catch {
    return 0;
  }
}
let freed = 0;
for (const rel of ['.next/cache', '.next/trace', '.next/types', 'tsconfig.tsbuildinfo']) {
  const p = join(out, rel);
  if (existsSync(p)) {
    freed += sizeMB(p);
    rmSync(p, { recursive: true, force: true });
  }
}

// Strip source maps (only useful for debugging the original source).
let maps = 0;
function stripMaps(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) stripMaps(p);
    else if (entry.endsWith('.map')) {
      rmSync(p, { force: true });
      maps += 1;
    }
  }
}
stripMaps(out);

console.log(`Assembled web (stripped ${removed} symlink(s), ${maps} source map(s), ~${freed} MB of build cache).`);
