// Generates the app icons as PNGs with no external dependencies.
// Run: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
const png = (w, h, rgba) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * Math.max(0, Math.min(1, t)));
const over = (dst, src, a) => dst.map((v, i) => v + (src[i] - v) * a);
const inTri = (px, py, [ax, ay], [bx, by], [cx, cy]) => {
  const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  const u = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d;
  const v = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d;
  return u >= 0 && v >= 0 && u + v <= 1;
};
const inBar = (px, py, x0, y0, x1, y1) => px >= x0 && px <= x1 && py >= y0 && py <= y1;

const GROUND_IN = [50, 37, 32], GROUND_OUT = [17, 12, 10];
const GOLD = [246, 231, 200], PALE = [214, 233, 245], RED = [209, 74, 62], HALO = [244, 227, 194];
const APEX = [0.5, 0.42];

// Colour at a point in unit space. `inset` shrinks the art for the safe zone of maskable icons.
function sample(ux, uy, inset) {
  const x = 0.5 + (ux - 0.5) / inset;
  const y = 0.5 + (uy - 0.5) / inset;
  const d = Math.hypot(x - 0.5, y - 0.38);
  let c = mix(GROUND_IN, GROUND_OUT, d / 0.78);
  if (x >= 0 && x <= 1 && y >= 0 && y <= 1) {
    const fade = Math.max(0, 1 - (y - APEX[1]) / 0.62);
    if (inTri(x, y, APEX, [0.06, 1.04], [0.44, 1.04])) c = over(c, PALE, 0.72 * fade);
    if (inTri(x, y, APEX, [0.94, 1.04], [0.56, 1.04])) c = over(c, RED, 0.72 * fade);
  }
  const halo = Math.hypot(x - 0.5, y - 0.47);
  if (halo < 0.32) c = over(c, HALO, 0.34 * (1 - halo / 0.32) ** 1.6);
  if (inBar(x, y, 0.462, 0.255, 0.538, 0.715) || inBar(x, y, 0.345, 0.400, 0.655, 0.472)) c = GOLD;
  return c;
}

function render(size, inset) {
  const buf = Buffer.alloc(size * size * 4);
  const S = 4, inv = 1 / (S * S);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const c = sample((px + (sx + 0.5) / S) / size, (py + (sy + 0.5) / S) / size, inset);
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const i = (py * size + px) * 4;
      buf[i] = Math.round(r * inv); buf[i + 1] = Math.round(g * inv); buf[i + 2] = Math.round(b * inv);
      buf[i + 3] = 255;
    }
  }
  return png(size, size, buf);
}

for (const [file, size, inset] of [
  ['icons/icon-192.png', 192, 1],
  ['icons/icon-512.png', 512, 1],
  ['icons/icon-maskable-512.png', 512, 0.76], // art pulled into the central safe zone
  ['icons/apple-touch-icon.png', 180, 1],
]) {
  writeFileSync(file, render(size, inset));
  console.log('wrote', file);
}
