/**
 * Generates icon-192.png and icon-512.png for the PWA manifest.
 * Pure Node.js — no external dependencies.
 * Produces ESU gold (#C8A84B) background with a black "C" centre block.
 * Run: node scripts/generate-icons.mjs
 */

import { createWriteStream } from 'fs';
import { deflateSync } from 'zlib';
import { mkdirSync } from 'fs';

mkdirSync('public/icons', { recursive: true });

// CRC-32 lookup table
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const lenBuf    = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length);
  const crcInput = Buffer.concat([typeBytes, data]);
  const crcBuf   = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput));
  return Buffer.concat([lenBuf, typeBytes, data, crcBuf]);
}

function makePNG(size) {
  // ESU gold RGB — #C8A84B = (200, 168, 75)
  const goldR = 200, goldG = 168, goldB = 75;
  // Black RGB — #1A1A1A = (26, 26, 26)
  const blkR = 26, blkG = 26, blkB = 26;

  // Draw a simple icon: gold background, centred black square (40% of size) as the "face"
  const inner = Math.floor(size * 0.40);
  const offset = Math.floor((size - inner) / 2);

  // Raw scanlines: filter byte (0) + RGB pixels per row
  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 3)] = 0; // None filter
    const inInnerY = y >= offset && y < offset + inner;
    for (let x = 0; x < size; x++) {
      const px = y * (1 + size * 3) + 1 + x * 3;
      const inInnerX = x >= offset && x < offset + inner;
      if (inInnerX && inInnerY) {
        raw[px] = blkR; raw[px + 1] = blkG; raw[px + 2] = blkB;
      } else {
        raw[px] = goldR; raw[px + 1] = goldG; raw[px + 2] = goldB;
      }
    }
  }

  const sig  = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = (() => {
    const d = Buffer.alloc(13);
    d.writeUInt32BE(size, 0);
    d.writeUInt32BE(size, 4);
    d[8] = 8; d[9] = 2; // 8-bit RGB
    return pngChunk('IHDR', d);
  })();
  const idat = pngChunk('IDAT', deflateSync(raw, { level: 6 }));
  const iend = pngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}

for (const size of [192, 512]) {
  const path = `public/icons/icon-${size}.png`;
  createWriteStream(path).end(makePNG(size));
  console.log(`wrote ${path} (${size}×${size})`);
}
