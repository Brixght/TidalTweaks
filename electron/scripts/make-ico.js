'use strict';
/* scripts/make-ico.js — PNG → ICO without any dependencies.
 * Modern Windows reads PNG-compressed ICO entries natively, so the script
 * just wraps the PNG bytes in an ICONDIR + one ICONDIRENTRY (no re-encode,
 * no quality loss). Run: node scripts/make-ico.js [src.png] [dest.ico]
 * Defaults: electron/assets/icon.png → electron/assets/icon.ico.
 * Tip: use a square PNG, ideally 256px or larger — Explorer/taskbar scale
 * the single entry down cleanly. */
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const src = path.resolve(process.argv[2] || path.join(root, 'assets', 'icon.png'));
const dest = path.resolve(process.argv[3] || path.join(root, 'assets', 'icon.ico'));

function fail(msg) {
  console.error('make-ico: ' + msg);
  process.exit(1);
}
if (!fs.existsSync(src)) fail(`source not found: ${src}`);
const png = fs.readFileSync(src);
// Validate PNG signature + read IHDR dimensions (no decoder needed).
if (png.length < 33 || png.readUInt32BE(0) !== 0x89504e47 || png.readUInt32BE(4) !== 0x0d0a1a0a) {
  fail('source is not a PNG file.');
}
const width = png.readUInt32BE(16);
const height = png.readUInt32BE(20);
if (width !== height) console.warn(`make-ico: warning — ${width}x${height} is not square; Windows will center-crop the display.`);
if (Math.max(width, height) < 256) console.warn('make-ico: warning — under 256px; large taskbar icons may look soft. Prefer 256px+.');

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // one image
const entry = Buffer.alloc(16);
entry.writeUInt8(width >= 256 ? 0 : width, 0); // 0 means 256
entry.writeUInt8(height >= 256 ? 0 : height, 1);
entry.writeUInt8(0, 2); // colors in palette (0 = 256+)
entry.writeUInt8(0, 3); // reserved
entry.writeUInt16LE(1, 4); // color planes
entry.writeUInt16LE(32, 6); // bits per pixel
entry.writeUInt32LE(png.length, 8); // PNG payload size
entry.writeUInt32LE(6 + 16, 12); // offset to payload
fs.writeFileSync(dest, Buffer.concat([header, entry, png]));
console.log(`make-ico: ${src} (${width}x${height}) → ${dest} (${fs.statSync(dest).size} bytes)`);
