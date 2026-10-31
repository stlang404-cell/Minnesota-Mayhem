// Generates the app icons as PNG files (pixel art, nearest-neighbour upscaled). No dependencies.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const P = { '.': [26, 16, 32], k: [11, 7, 16], r: [192, 38, 45], R: [125, 20, 27], y: [242, 201, 76], Y: [184, 134, 43], w: [244, 239, 230], s: [223, 233, 245], e: [79, 158, 79] };
const art = [
  '................................',
  '................................',
  '...e........................e...',
  '..ee........................ee..',
  '..e..........yyyyyy..........e..',
  '.ee.........yYYYYYYy.........ee.',
  '.e.........yY......Yy.........e.',
  '.ee.......kkkkkkkkkkkk.......ee.',
  '..e......krrrrrrrrrrrrk......e..',
  '..ee....krrrrrrrrrrrrrrk....ee..',
  '...e....krrwwrrrrrrwwrrk....e...',
  '...ee...krrwwwrrrrwwwrrk...ee...',
  '....e...krrwwwwrrwwwwrrk...e....',
  '....ee..krrwwrwwwwrwwrrk..ee....',
  '.....e..krrwwrrwwrrwwrrk..e.....',
  '.....ee.krrwwrrrrrrwwrrk.ee.....',
  '......e.krrwwrrrrrrwwrrk.e......',
  '......eekrrwwrrrrrrwwrrkee......',
  '.......ekrrrrrrrrrrrrrrke.......',
  '........kRRRRRRRRRRRRRRk........',
  '.........kRRRRRRRRRRRRk.........',
  '..........kkkkkkkkkkkk..........',
  '..........yyyyyyyyyyyy..........',
  '...........y........y...........',
  '...........y.yyyyyy.y...........',
  '...........y........y...........',
  '..........yyyyyyyyyyyy..........',
  '................................',
  'ssssssssssssssssssssssssssssssss',
  'sssssssssssssssssssssssssssssss.',
  '................................',
  '................................',
];
function crc32(buf) { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function png(size) {
  const scale = size / 32;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const ch = art[Math.floor(y / scale)][Math.floor(x / scale)] ?? '.';
      const [r, g, b] = P[ch] ?? P['.'];
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
for (const s of [192, 512]) writeFileSync(`public/icon-${s}.png`, png(s));
console.log('icons written');
