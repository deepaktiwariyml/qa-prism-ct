import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import archiver from 'archiver';
import { resolve as resolveCell } from '../engine/resolve.js';
import { render } from '../engine/render.js';
import type { Selection } from '../engine/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4321;
const REGISTRY_INDEX = join(__dirname, '..', 'registry', 'index.json');
const PUBLIC = join(__dirname, 'public');

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((res) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => res(data));
  });
}

const server = createServer(async (req, res) => {
  try {
    // Serve the configurator
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      const html = await readFile(join(PUBLIC, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(html);
    }

    // Feed the dropdowns from the real registry
    if (req.method === 'GET' && req.url === '/api/cells') {
      const index = await readFile(REGISTRY_INDEX);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(index);
    }

    // Generate + stream back a zip
    if (req.method === 'POST' && req.url === '/api/generate') {
      const sel = JSON.parse(await readBody(req)) as Selection;
      const result = await resolveCell(sel);

      if (!result.matched || !result.manifest || !result.cellPath) {
        res.writeHead(422, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: result.reason }));
      }

      const work = await mkdtemp(join(tmpdir(), 'qaprism-'));
      const outDir = join(work, sel.projectName || result.manifest.id);
      await render(result.manifest, result.cellPath, sel, outDir);

      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${sel.projectName || result.manifest.id}.zip"`,
      });
      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('end', () => rm(work, { recursive: true, force: true }));
      archive.pipe(res);
      archive.directory(outDir, sel.projectName || result.manifest.id);
      await archive.finalize();
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: String(err) }));
  }
});

server.listen(PORT, () => {
  console.log(`\n  QA Prism generator running at  http://localhost:${PORT}\n`);
});
