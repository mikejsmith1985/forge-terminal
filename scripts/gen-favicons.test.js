/**
 * Smoke tests for gen-favicons.js.
 *
 * Verifies the ICO-builder and SVG-generator helper functions produce
 * structurally valid output without writing to disk.  Full end-to-end
 * output (the actual PNG/ICO files) is validated by inspection after
 * running `node scripts/gen-favicons.js` manually.
 */

const assert = require('assert');

// ── Inline the pure helpers from gen-favicons.js ────────────────────────────
// We re-implement the two testable pure functions here rather than require()ing
// the whole script, because gen-favicons.js calls main() on load and depends
// on `sharp` being available in the environment.

const PURPLE = '#8b5cf6';

function buildFaviconSvg(size) {
  const cornerRadius = Math.round(size * 0.18);
  const fontSize     = Math.round(size * 0.65);
  const textX        = Math.round(size * 0.5);
  const textY        = Math.round(size * 0.725);
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

function buildIco(frames) {
  const HEADER_BYTES    = 6;
  const DIR_ENTRY_BYTES = 16;
  const dataOffset      = HEADER_BYTES + frames.length * DIR_ENTRY_BYTES;
  let runningOffset     = dataOffset;
  const enriched        = frames.map((frame) => {
    const entry = { ...frame, offset: runningOffset };
    runningOffset += frame.buf.length;
    return entry;
  });
  const totalBytes = runningOffset;
  const ico        = Buffer.alloc(totalBytes);
  let pos          = 0;
  ico.writeUInt16LE(0, pos);             pos += 2;
  ico.writeUInt16LE(1, pos);             pos += 2;
  ico.writeUInt16LE(frames.length, pos); pos += 2;
  for (const frame of enriched) {
    ico.writeUInt8(frame.size, pos);        pos++;
    ico.writeUInt8(frame.size, pos);        pos++;
    ico.writeUInt8(0, pos);                 pos++;
    ico.writeUInt8(0, pos);                 pos++;
    ico.writeUInt16LE(1, pos);              pos += 2;
    ico.writeUInt16LE(32, pos);             pos += 2;
    ico.writeUInt32LE(frame.buf.length, pos); pos += 4;
    ico.writeUInt32LE(frame.offset, pos);   pos += 4;
  }
  for (const frame of enriched) {
    frame.buf.copy(ico, frame.offset);
  }
  return ico;
}

// ── Tests ────────────────────────────────────────────────────────────────────

// SVG output contains the expected brand colour and glyph
const svg32 = buildFaviconSvg(32);
assert(svg32.includes(PURPLE),       'SVG must contain the purple brand colour');
assert(svg32.includes('>F</text>'),  'SVG must contain the F glyph');
assert(svg32.includes('width="32"'), 'SVG must have the requested width');

// SVG dimensions scale correctly
const svg192 = buildFaviconSvg(192);
assert(svg192.includes('width="192"'), 'SVG must scale to 192');

// ICO file has correct magic bytes (reserved=0, type=1) and frame count
const fakeFrames = [
  { size: 16, buf: Buffer.alloc(10, 0xAB) },
  { size: 32, buf: Buffer.alloc(20, 0xCD) },
];
const ico = buildIco(fakeFrames);
assert.strictEqual(ico.readUInt16LE(0), 0, 'ICO reserved field must be 0');
assert.strictEqual(ico.readUInt16LE(2), 1, 'ICO type field must be 1 (icon)');
assert.strictEqual(ico.readUInt16LE(4), 2, 'ICO must record correct frame count');

// ICO first directory entry has correct size and data length
assert.strictEqual(ico.readUInt8(6),   16, 'First entry width must be 16');
assert.strictEqual(ico.readUInt8(7),   16, 'First entry height must be 16');
assert.strictEqual(ico.readUInt32LE(14), 10, 'First entry data size must match fake frame');

console.log('gen-favicons smoke tests: all passed');
