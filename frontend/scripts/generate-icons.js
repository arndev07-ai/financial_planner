import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '..', 'public', 'icons');

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function encodePng(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc(size * (stride + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function render(size, { maskable }) {
  const px = Buffer.alloc(size * size * 4);
  const set = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = a;
  };

  const cx = size / 2;
  const cy = size / 2;
  const radius = maskable ? size * 0.32 : size * 0.46;

  const inRoundedRect = (x, y, r) => {
    const inset = maskable ? size * 0.08 : 0;
    const half = size / 2 - inset;
    const dx = Math.max(Math.abs(x - cx) - half, 0);
    const dy = Math.max(Math.abs(y - cy) - half, 0);
    return dx * dx + dy * dy <= r * r;
  };

  const inBar = (x, y, bx, bw, top, bottom) => {
    return x >= bx && x <= bx + bw && y >= top && y <= bottom;
  };

  const inArrow = (x, y) => {
    const x0 = cx - radius * 0.55;
    const y0 = cy + radius * 0.5;
    const x1 = cx + radius * 0.55;
    const y1 = cy - radius * 0.35;
    const dirX = x1 - x0;
    const dirY = y1 - y0;
    const len = Math.sqrt(dirX * dirX + dirY * dirY);
    const nx = -dirY / len;
    const ny = dirX / len;
    const perp = Math.abs((x - x0) * nx + (y - y0) * ny);
    const along = ((x - x0) * dirX + (y - y0) * dirY) / len;
    const stroke = size * 0.035;
    if (along >= 0 && along <= len && perp <= stroke) return true;
    const headLen = size * 0.14;
    const tipX = x1;
    const tipY = y1;
    const baseX = x1 - (dirX / len) * headLen;
    const baseY = y1 - (dirY / len) * headLen;
    const leftX = baseX - (dirY / len) * headLen * 0.55;
    const leftY = baseY + (dirX / len) * headLen * 0.55;
    const rightX = baseX + (dirY / len) * headLen * 0.55;
    const rightY = baseY - (dirX / len) * headLen * 0.55;
    const sign = (px_, py_, ax, ay, bx, by) => (px_ - bx) * (ay - by) - (ax - bx) * (py_ - by);
    const d1 = sign(x, y, tipX, tipY, leftX, leftY);
    const d2 = sign(x, y, leftX, leftY, rightX, rightY);
    const d3 = sign(x, y, rightX, rightY, tipX, tipY);
    const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
    const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(hasNeg && hasPos);
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r, g, b;
      const t = (y + x) / (2 * size);
      if (inRoundedRect(x, y, size * (maskable ? 0.22 : 0.24))) {
        const r1 = 14, g1 = 165, b1 = 233;
        const r2 = 16, g2 = 185, b2 = 129;
        r = Math.round(r1 + (r2 - r1) * t);
        g = Math.round(g1 + (g2 - g1) * t);
        b = Math.round(b1 + (b2 - b1) * t);
      } else {
        set(x, y, 0, 0, 0, 0);
        continue;
      }

      const white = [255, 255, 255];
      let drawn = false;

      const barW = size * 0.09;
      const gap = size * 0.07;
      const base = cy + radius * 0.5;
      const bars = [0.28, 0.5, 0.72];
      bars.forEach((bxFrac, i) => {
        const bx = cx - radius + gap + i * (barW + gap);
        const h = radius * (0.5 - i * 0.12);
        if (inBar(x, y, bx, barW, base - h, base)) {
          set(x, y, white[0], white[1], white[2], 255);
          drawn = true;
        }
      });

      if (!drawn && inArrow(x, y)) {
        set(x, y, white[0], white[1], white[2], 255);
      }
    }
  }
  return encodePng(size, px);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const [name, size, maskable] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['maskable-512.png', 512, true],
]) {
  fs.writeFileSync(path.join(OUT_DIR, name), render(size, { maskable }));
  console.log(`Generated ${name}`);
}
