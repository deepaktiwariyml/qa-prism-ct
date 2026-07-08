// Assemble the Next.js standalone output into `build-web/` for packaging.
// Next's standalone build omits static assets and `public/`, so we copy them
// in next to the standalone server. electron-builder then ships `build-web`
// as resources/web (see package.json build.extraResources).
import { cpSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const desktop = join(here, '..');
const webApp = join(desktop, '..', 'web');
const standalone = join(webApp, '.next', 'standalone');
const out = join(desktop, 'build-web');

if (!existsSync(standalone)) {
  console.error('Standalone build not found at', standalone);
  console.error('Run with NEXT_STANDALONE=1 and `next build` first.');
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// 1. The standalone server + its trimmed node_modules (monorepo layout).
cpSync(standalone, out, { recursive: true });
// 2. Static assets and public/ that standalone omits.
cpSync(join(webApp, '.next', 'static'), join(out, 'apps', 'web', '.next', 'static'), { recursive: true });
const publicDir = join(webApp, 'public');
if (existsSync(publicDir)) {
  cpSync(publicDir, join(out, 'apps', 'web', 'public'), { recursive: true });
}

console.log('Assembled web standalone into', out);
