import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
// Use Next's already-installed image tooling; no added dependency.
const sharp = createRequire(require.resolve('next/package.json'))('sharp');
const source = process.argv[2] || '../freewrite-orginal/assets/icon.ico';
const ico = readFileSync(source);
if (ico.readUInt16LE(2) !== 1) throw Error('Expected ICO source');
const images = Array.from({ length: ico.readUInt16LE(4) }, (_, i) => {
  const offset = 6 + i * 16;
  return { width: ico[offset] || 256, data: ico.subarray(ico.readUInt32LE(offset + 12), ico.readUInt32LE(offset + 12) + ico.readUInt32LE(offset + 8)) };
}).sort((a, b) => b.width - a.width);
const png = images.find(image => image.data.subarray(1, 4).toString() === 'PNG');
if (!png) throw Error('ICO has no embedded PNG');
mkdirSync('public/icons', { recursive: true });
for (const size of [180, 192, 512]) await sharp(png.data).resize(size, size).png().toFile(`public/icons/icon-${size}.v1.png`);
// The entire source square fits inside r=.4w: side .55w has corner radius .389w.
const inset = await sharp(png.data).resize(280, 280).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#ffffff' } }).composite([{ input: inset, left: 116, top: 116 }]).png().toFile('public/icons/maskable-512.v1.png');
writeFileSync('public/icons/SOURCE.txt', `Source: freewrite-orginal/assets/icon.ico\nSHA-256: ${createHash('sha256').update(ico).digest('hex')}\nLargest PNG: ${png.width}px. Upscaling approved by owner 2026-10-07 (MAN-3).\nGenerated with existing Next sharp dependency; maskable artwork enclosed within radius 40%.\n`);
console.log(`Generated icons from ${png.width}px source.`);
