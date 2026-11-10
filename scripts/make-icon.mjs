// Generates a 1024x1024 PNG app icon without any image dependency.
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";

const SIZE = 1024;
const px = Buffer.alloc(SIZE * SIZE * 4);

const setPixel = (x, y, r, g, b, a) => {
  const i = (y * SIZE + x) * 4;
  px[i] = r;
  px[i + 1] = g;
  px[i + 2] = b;
  px[i + 3] = a;
};

const roundedRect = (x, y, left, top, w, h, radius) => {
  const rx = Math.max(left, Math.min(x, left + w));
  const ry = Math.max(top, Math.min(y, top + h));
  const dx = x - rx;
  const dy = y - ry;
  const cx = Math.min(Math.max(x, left + radius), left + w - radius);
  const cy = Math.min(Math.max(y, top + radius), top + h - radius);
  if (x >= left && x <= left + w && y >= top && y <= top + h) {
    if (x < left + radius && y < top + radius) {
      return Math.hypot(x - cx, y - cy) <= radius;
    }
    if (x > left + w - radius && y < top + radius) {
      return Math.hypot(x - cx, y - cy) <= radius;
    }
    if (x < left + radius && y > top + h - radius) {
      return Math.hypot(x - cx, y - cy) <= radius;
    }
    if (x > left + w - radius && y > top + h - radius) {
      return Math.hypot(x - cx, y - cy) <= radius;
    }
    return true;
  }
  void dx;
  void dy;
  return false;
};

// Rounded background with a violet -> indigo diagonal gradient.
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const inside = roundedRect(x, y, 40, 40, SIZE - 80, SIZE - 80, 210);
    if (!inside) {
      setPixel(x, y, 0, 0, 0, 0);
      continue;
    }
    const t = (x / SIZE) * 0.55 + (y / SIZE) * 0.45;
    const r = Math.round(124 - 40 * t);
    const g = Math.round(92 - 22 * t);
    const b = Math.round(252 - 20 * t);
    setPixel(x, y, r, g, b, 255);
  }
}

// Three stacked flashcard bars, decreasing in width, with rounded caps.
const bars = [
  { top: 300, w: 520, alpha: 255, h: 92 },
  { top: 440, w: 420, alpha: 220, h: 92 },
  { top: 580, w: 300, alpha: 170, h: 92 },
];

for (const bar of bars) {
  const left = (SIZE - bar.w) / 2;
  for (let y = bar.top - 6; y < bar.top + bar.h + 6; y++) {
    for (let x = left - 6; x < left + bar.w + 6; x++) {
      if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) continue;
      if (!roundedRect(x, y, left, bar.top, bar.w, bar.h, bar.h / 2)) continue;
      setPixel(x, y, 255, 255, 255, bar.alpha);
    }
  }
}

// Accent dot (top-right of the mark) that hints at a rising curve.
const dotX = 760;
const dotY = 276;
for (let y = dotY - 56; y < dotY + 56; y++) {
  for (let x = dotX - 56; x < dotX + 56; x++) {
    const d = Math.hypot(x - dotX, y - dotY);
    if (d <= 54) setPixel(x, y, 125, 255, 214, 255);
    else if (d <= 60) setPixel(x, y, 125, 255, 214, 160);
  }
}

// --- PNG encoding -----------------------------------------------------------
const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;
ihdr[9] = 6;
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0;
  px.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

mkdirSync("assets", { recursive: true });
writeFileSync("assets/icon.png", png);
console.log(`icon written: ${png.length} bytes`);
