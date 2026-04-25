/**
 * Generates the Forge Terminal purple-"F" favicon in all required sizes and
 * writes them to frontend/public/. Run once; output is committed to the repo
 * so every build includes the correct icon permanently.
 *
 * Sizes produced:
 *   favicon.ico         — multi-size ICO (16 + 32 + 48), embedded as PNG frames
 *   favicon.png         — 32 × 32  (used by <link rel="icon" sizes="32x32">)
 *   favicon-192.png     — 192 × 192
 *   favicon-512.png     — 512 × 512
 *   icon-192.png        — 192 × 192  (apple-touch-icon / PWA)
 *   icon-512.png        — 512 × 512  (PWA maskable icon)
 *
 * Requires: sharp (already in devDependencies via the frontend)
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// The project accent colour — matches the CSS variable used throughout the UI
const PURPLE = '#8b5cf6';

const PUBLIC_DIR = path.join(__dirname, '..', 'frontend', 'public');

/**
 * Build an SVG string for a rounded-square purple background with a bold
 * white "F" centred inside it.
 *
 * @param {number} size - Side length in pixels
 * @returns {string} SVG markup
 */
function buildFaviconSvg(size) {
  const cornerRadius = Math.round(size * 0.18);
  const fontSize     = Math.round(size * 0.65);
  // Centre horizontally; push the baseline down to ~73% of height for visual
  // centre (cap-height of Arial Black sits above its baseline)
  const textX = Math.round(size * 0.5);
  const textY = Math.round(size * 0.725);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    `  <rect width="${size}" height="${size}" rx="${cornerRadius}" ry="${cornerRadius}" fill="${PURPLE}"/>`,
    `  <text`,
    `    x="${textX}" y="${textY}"`,
    `    font-family="Arial Black, Arial, sans-serif"`,
    `    font-weight="900"`,
    `    font-size="${fontSize}"`,
    `    fill="white"`,
    `    text-anchor="middle"`,
    `    dominant-baseline="auto"`,
    `  >F</text>`,
    `</svg>`,
  ].join('\n');
}

/**
 * Render an SVG buffer to a PNG buffer at the exact requested size.
 *
 * @param {number} size
 * @returns {Promise<Buffer>}
 */
async function renderPng(size) {
  const svgBuffer = Buffer.from(buildFaviconSvg(size));
  return sharp(svgBuffer).resize(size, size).png().toBuffer();
}

/**
 * Write a PNG file and log it.
 *
 * @param {string} filename  - Basename inside PUBLIC_DIR
 * @param {number} size
 */
async function writePng(filename, size) {
  const buf = await renderPng(size);
  const outPath = path.join(PUBLIC_DIR, filename);
  fs.writeFileSync(outPath, buf);
  console.log(`  ✓  ${filename}  (${size}×${size}, ${buf.length} bytes)`);
}

/**
 * Build a multi-size ICO file from an array of PNG buffers.
 * Modern ICO format: embeds raw PNG data per frame — supported by all
 * browsers and Windows Vista+.
 *
 * @param {Array<{size: number, buf: Buffer}>} frames
 * @returns {Buffer}
 */
function buildIco(frames) {
  const HEADER_BYTES    = 6;
  const DIR_ENTRY_BYTES = 16;
  const dataOffset      = HEADER_BYTES + frames.length * DIR_ENTRY_BYTES;

  let runningOffset = dataOffset;
  const enriched = frames.map((frame) => {
    const entry = { ...frame, offset: runningOffset };
    runningOffset += frame.buf.length;
    return entry;
  });

  const totalBytes = runningOffset;
  const ico        = Buffer.alloc(totalBytes);
  let pos          = 0;

  // ICO file header
  ico.writeUInt16LE(0, pos);             pos += 2; // reserved
  ico.writeUInt16LE(1, pos);             pos += 2; // image type = 1 (ICO)
  ico.writeUInt16LE(frames.length, pos); pos += 2; // number of images

  // Directory entries
  for (const frame of enriched) {
    // Width/height: 0 encodes 256, but we only use ≤48 here
    ico.writeUInt8(frame.size,       pos); pos++;
    ico.writeUInt8(frame.size,       pos); pos++;
    ico.writeUInt8(0,                pos); pos++; // colour count (0 = no palette)
    ico.writeUInt8(0,                pos); pos++; // reserved
    ico.writeUInt16LE(1,             pos); pos += 2; // colour planes
    ico.writeUInt16LE(32,            pos); pos += 2; // bits per pixel
    ico.writeUInt32LE(frame.buf.length, pos); pos += 4;
    ico.writeUInt32LE(frame.offset,     pos); pos += 4;
  }

  // Image data
  for (const frame of enriched) {
    frame.buf.copy(ico, frame.offset);
  }

  return ico;
}

async function main() {
  console.log('Generating Forge Terminal favicons...\n');

  // PNG files
  await writePng('favicon.png',     32);
  await writePng('favicon-192.png', 192);
  await writePng('favicon-512.png', 512);
  await writePng('icon-192.png',    192);
  await writePng('icon-512.png',    512);

  // Multi-size ICO (16, 32, 48)
  const icoFrameSizes = [16, 32, 48];
  const icoFrames = await Promise.all(
    icoFrameSizes.map(async (size) => ({ size, buf: await renderPng(size) }))
  );
  const icoBuffer = buildIco(icoFrames);
  const icoPath   = path.join(PUBLIC_DIR, 'favicon.ico');
  fs.writeFileSync(icoPath, icoBuffer);
  console.log(`  ✓  favicon.ico  (16+32+48 embedded PNG, ${icoBuffer.length} bytes)`);

  console.log('\nDone — commit frontend/public/ to make the change permanent.');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
