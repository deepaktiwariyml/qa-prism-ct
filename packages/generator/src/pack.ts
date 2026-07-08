import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import JSZip from 'jszip';

async function addDir(zip: JSZip, base: string, current: string, rootName: string): Promise<void> {
  for (const entry of await readdir(current)) {
    const full = join(current, entry);
    const s = await stat(full);
    if (s.isDirectory()) {
      await addDir(zip, base, full, rootName);
    } else {
      const rel = relative(base, full).split(sep).join('/'); // zip paths use "/"
      zip.file(`${rootName}/${rel}`, await readFile(full));
    }
  }
}

/**
 * Zip a directory into a Buffer, nesting its contents under `rootName/`.
 * Uses jszip (pure JS) so it bundles cleanly into the desktop app.
 */
export async function zipDir(dir: string, rootName: string): Promise<Buffer> {
  const zip = new JSZip();
  await addDir(zip, dir, dir, rootName);
  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
}
