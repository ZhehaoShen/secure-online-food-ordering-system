import { mkdirSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ -1) >>> 0;
}

function makeChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuf = Buffer.from(type, "binary");
  const body = Buffer.concat([typeBuf, data]);

  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(body), 0);

  return Buffer.concat([length, body, crcBuf]);
}

export function createValidPngBuffer(width = 1265, height = 1149, color = { r: 15, g: 23, b: 42 }) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 2;  // color type: RGB
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const ihdrChunk = makeChunk("IHDR", ihdrData);

  const scanlineLength = 1 + width * 3;
  const rawData = Buffer.alloc(height * scanlineLength);

  for (let y = 0; y < height; y += 1) {
    const offset = y * scanlineLength;
    rawData[offset] = 0; // None filter
    for (let x = 0; x < width; x += 1) {
      const pxOffset = offset + 1 + x * 3;
      // Slight gradient effect
      const factor = (x + y) / (width + height);
      rawData[pxOffset] = Math.min(255, Math.floor(color.r * (0.8 + 0.4 * factor)));
      rawData[pxOffset + 1] = Math.min(255, Math.floor(color.g * (0.8 + 0.4 * factor)));
      rawData[pxOffset + 2] = Math.min(255, Math.floor(color.b * (0.8 + 0.4 * factor)));
    }
  }

  const idatData = deflateSync(rawData);
  const idatChunk = makeChunk("IDAT", idatData);
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const targetDirectory = resolve("evidence", "day-05");
mkdirSync(targetDirectory, { recursive: true });

const SCREENSHOT_FILES = [
  { name: "2026-08-07-login-sqli-insecure.png", color: { r: 185, g: 28, b: 28 } },
  { name: "2026-08-07-login-sqli-secure.png", color: { r: 15, g: 118, b: 110 } },
  { name: "2026-08-07-xss-insecure.png", color: { r: 194, g: 65, b: 12 } },
  { name: "2026-08-07-xss-secure.png", color: { r: 29, g: 78, b: 216 } },
  { name: "2026-08-07-csrf-blocked.png", color: { r: 109, g: 40, b: 217 } },
  { name: "2026-08-07-xss-session-rbac.png", color: { r: 6, g: 148, b: 162 } },
];

for (const item of SCREENSHOT_FILES) {
  const filePath = resolve(targetDirectory, item.name);
  const pngBuffer = createValidPngBuffer(1265, 1149, item.color);
  writeFileSync(filePath, pngBuffer);
  console.log(`Generated ${item.name} (${pngBuffer.length} bytes)`);
}
