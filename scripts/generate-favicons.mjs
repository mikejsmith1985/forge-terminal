// scripts/generate-favicons.mjs
// Rasterises frontend/public/favicon.svg into the favicon set expected by
// frontend/index.html.  Outputs PNGs at 16/32/180/192/512 plus a
// multi-size .ico for legacy browser tabs.  Run from the repo root:
//
//   node scripts/generate-favicons.mjs
//
// We deliberately keep this as a one-shot script (not part of the Vite
// build) so the icons live in source control as binary artefacts and
// don't need `sharp` on every developer's machine.

import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const repoRoot = path.resolve(__dirname, '..');
const publicDir = path.join(repoRoot, 'frontend', 'public');
const svgPath = path.join(publicDir, 'favicon.svg');

const svgBuffer = fs.readFileSync(svgPath);

// Render at high DPI then downsample for the tiny sizes — keeps the
// flame's curves smooth at 16/32 px instead of pixel-stepping.
async function render(size, outName) {
  const buf = await sharp(svgBuffer, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(publicDir, outName), buf);
  console.log(`  wrote ${outName} (${size}x${size}, ${buf.length} bytes)`);
}

console.log('Generating favicons from favicon.svg…');
await render(32, 'favicon.png');
await render(192, 'favicon-192.png');
await render(512, 'favicon-512.png');
await render(180, 'icon-192.png');     // apple-touch-icon (kept name for back-compat)
await render(512, 'icon-512.png');     // PWA install icon

// Build a real multi-size .ico by stacking 16/32/48 PNGs.  Browsers pick
// the closest size for the tab; this is the format Chrome/Edge expect.
async function buildIco() {
  const sizes = [16, 32, 48];
  const pngBuffers = await Promise.all(sizes.map((size) =>
    sharp(svgBuffer, { density: 384 })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
  ));

  // ICO header (6 bytes): reserved=0, type=1 (icon), count=N
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);

  // Directory entry per image (16 bytes each)
  const dirEntries = [];
  let offset = 6 + sizes.length * 16;
  for (let i = 0; i < sizes.length; i++) {
    const entry = Buffer.alloc(16);
    const sizeByte = sizes[i] === 256 ? 0 : sizes[i];
    entry.writeUInt8(sizeByte, 0);            // width
    entry.writeUInt8(sizeByte, 1);            // height
    entry.writeUInt8(0, 2);                   // colour palette (none)
    entry.writeUInt8(0, 3);                   // reserved
    entry.writeUInt16LE(1, 4);                // colour planes
    entry.writeUInt16LE(32, 6);               // bits per pixel
    entry.writeUInt32LE(pngBuffers[i].length, 8);
    entry.writeUInt32LE(offset, 12);
    dirEntries.push(entry);
    offset += pngBuffers[i].length;
  }

  const out = Buffer.concat([header, ...dirEntries, ...pngBuffers]);
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), out);
  console.log(`  wrote favicon.ico (${sizes.join('/')}px, ${out.length} bytes)`);
}

await buildIco();
console.log('Done.');
