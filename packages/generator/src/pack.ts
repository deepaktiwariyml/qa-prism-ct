import archiver from 'archiver';

/** Zip a directory into a Buffer, nesting its contents under `rootName/`. */
export function zipDir(dir: string, rootName: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('data', (c: Buffer) => chunks.push(c));
    archive.on('warning', (err) => reject(err));
    archive.on('error', (err) => reject(err));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.directory(dir, rootName);
    void archive.finalize();
  });
}
