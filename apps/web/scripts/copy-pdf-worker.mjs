// Copy the pdf.js worker into public/ so it is served as a same-origin static
// asset (referenced by lib/parseDocs.ts as /pdf.worker.min.mjs). This avoids
// webpack trying to bundle the ESM worker, which breaks `next build`. Runs
// automatically before dev and build (see package.json predev/prebuild).
import { createRequire } from 'node:module';
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const pkg = require.resolve('pdfjs-dist/package.json');
// Ship the LEGACY worker to match lib/parseDocs.ts (legacy build has the
// polyfills Electron's Chromium needs). Fall back to the standard build.
const root = dirname(pkg);
const candidates = [
  join(root, 'legacy', 'build', 'pdf.worker.min.mjs'),
  join(root, 'legacy', 'build', 'pdf.worker.mjs'),
  join(root, 'build', 'pdf.worker.min.mjs'),
  join(root, 'build', 'pdf.worker.mjs'),
];
const src = candidates.find((p) => existsSync(p));
if (!src) throw new Error('[copy-pdf-worker] no pdf.worker file found in pdfjs-dist');

const publicDir = join(process.cwd(), 'public');
mkdirSync(publicDir, { recursive: true });
const dest = join(publicDir, 'pdf.worker.min.mjs');
copyFileSync(src, dest);
console.log(`[copy-pdf-worker] ${src} → ${dest}`);
