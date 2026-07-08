// Copy the pdf.js worker into public/ so it is served as a same-origin static
// asset (referenced by lib/parseDocs.ts as /pdf.worker.min.mjs). This avoids
// webpack trying to bundle the ESM worker, which breaks `next build`. Runs
// automatically before dev and build (see package.json predev/prebuild).
import { createRequire } from 'node:module';
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const pkg = require.resolve('pdfjs-dist/package.json');
const buildDir = join(dirname(pkg), 'build');
const src = existsSync(join(buildDir, 'pdf.worker.min.mjs'))
  ? join(buildDir, 'pdf.worker.min.mjs')
  : join(buildDir, 'pdf.worker.mjs');

const publicDir = join(process.cwd(), 'public');
mkdirSync(publicDir, { recursive: true });
const dest = join(publicDir, 'pdf.worker.min.mjs');
copyFileSync(src, dest);
console.log(`[copy-pdf-worker] ${src} → ${dest}`);
