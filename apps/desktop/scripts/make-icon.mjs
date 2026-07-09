// Generate the macOS app icon as a 1024×1024 PNG with no external deps.
// A violet→indigo rounded square (matching the app's brand gradient) with a
// white check mark — "QA / passed". electron-builder converts it to .icns.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const S = 1024;
const buf = Buffer.alloc(S * S * 4); // RGBA

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

// Signed distance to a rounded box centered at origin (half-extent b, radius r).
function sdRoundBox(px, py, b, r) {
  const qx = Math.abs(px) - b + r;
  const qy = Math.abs(py) - b + r;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}

// Distance from point to segment (a→b).
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = clamp01(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

const half = S / 2;
const radius = S * 0.235; // macOS "squircle"-ish corner
// Check mark points (normalized 0..1), stroke half-width.
const p1 = [0.30 * S, 0.53 * S];
const p2 = [0.44 * S, 0.67 * S];
const p3 = [0.72 * S, 0.36 * S];
const hw = S * 0.052;

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    // Rounded-square mask (anti-aliased over ~1.5px).
    const sd = sdRoundBox(x + 0.5 - half, y + 0.5 - half, half, radius);
    const bgA = smooth(1.2, -1.2, sd);
    if (bgA <= 0) {
      buf[i + 3] = 0;
      continue;
    }
    // Vertical brand gradient: #7c3aed (top) → #4f46e5 (bottom).
    const t = y / S;
    let r = lerp(124, 79, t);
    let g = lerp(58, 70, t);
    let b = lerp(237, 229, t);
    // White check mark on top.
    const d = Math.min(distSeg(x, y, ...p1, ...p2), distSeg(x, y, ...p2, ...p3));
    const cA = smooth(hw + 1.2, hw - 1.2, d);
    r = lerp(r, 255, cA);
    g = lerp(g, 255, cA);
    b = lerp(b, 255, cA);
    buf[i] = Math.round(r);
    buf[i + 1] = Math.round(g);
    buf[i + 2] = Math.round(b);
    buf[i + 3] = Math.round(bgA * 255);
  }
}

// --- Minimal PNG encoder ---
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type RGBA
// Prefix each scanline with filter byte 0.
const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  buf.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const buildDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'build');
mkdirSync(buildDir, { recursive: true });
const dest = join(buildDir, 'icon.png');
writeFileSync(dest, png);
console.log(`[make-icon] wrote ${dest} (${S}×${S}, ${Math.round(png.length / 1024)} KB)`);
