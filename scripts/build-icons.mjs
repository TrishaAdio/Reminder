// Renders the app icon, tray icons and installer bitmaps from SVG. Run with `npm run assets`.
import { writeFileSync, mkdirSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const root = new URL('..', import.meta.url).pathname;
const FONTS = [`${root}build/fonts/Inter-SemiBold.ttf`, `${root}build/fonts/Inter-Medium.ttf`];

const AMBER = '#D2731C';
const CREAM = '#FFF6EA';

// The mark: an open ring with a bead resting in the gap, the moment a reminder lands.
function mark({ cx = 512, cy = 512, r, stroke, bead, color }) {
  const point = (deg) => {
    const a = (deg * Math.PI) / 180;
    return [cx + r * Math.sin(a), cy - r * Math.cos(a)].map((n) => n.toFixed(2)).join(' ');
  };
  const [bx, by] = point(30).split(' ');
  return `
    <path d="M ${point(60)} A ${r} ${r} 0 1 1 ${point(0)}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"/>
    <circle cx="${bx}" cy="${by}" r="${bead}" fill="${color}"/>`;
}

// Small sizes get a fuller tile and heavier strokes so they stay legible at 16px.
function appIcon(size) {
  const small = size <= 24;
  const inset = small ? 16 : 64;
  const radius = small ? 220 : 200;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
    <rect x="${inset}" y="${inset}" width="${1024 - inset * 2}" height="${1024 - inset * 2}" rx="${radius}" fill="${AMBER}"/>
    ${mark(small ? { r: 268, stroke: 128, bead: 74, color: CREAM } : { r: 232, stroke: 92, bead: 54, color: CREAM })}
  </svg>`;
}

function trayIcon(size, color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
    ${mark({ r: 340, stroke: 150, bead: 92, color })}
  </svg>`;
}

const render = (svg, width) =>
  new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Inter' },
  }).render();

// ICO with 32-bit DIB entries for small sizes (best compatibility with NSIS and the shell)
// and a PNG entry for 256px.
function ico(entries) {
  const images = entries.map(({ size, svg }) => {
    const img = render(svg, size);
    if (size >= 256) return { size, data: img.asPng() };
    const rgba = img.pixels;
    const header = Buffer.alloc(40);
    header.writeUInt32LE(40, 0);
    header.writeInt32LE(size, 4);
    header.writeInt32LE(size * 2, 8);
    header.writeUInt16LE(1, 12);
    header.writeUInt16LE(32, 14);
    const pixels = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const src = (y * size + x) * 4;
        const dst = ((size - 1 - y) * size + x) * 4;
        pixels[dst] = rgba[src + 2];
        pixels[dst + 1] = rgba[src + 1];
        pixels[dst + 2] = rgba[src];
        pixels[dst + 3] = rgba[src + 3];
      }
    }
    const mask = Buffer.alloc(Math.ceil(size / 32) * 4 * size);
    return { size, data: Buffer.concat([header, pixels, mask]) };
  });
  const dir = Buffer.alloc(6 + images.length * 16);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(images.length, 4);
  let offset = dir.length;
  images.forEach(({ size, data }, i) => {
    const e = 6 + i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, e);
    dir.writeUInt8(size >= 256 ? 0 : size, e + 1);
    dir.writeUInt16LE(1, e + 4);
    dir.writeUInt16LE(32, e + 6);
    dir.writeUInt32LE(data.length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([dir, ...images.map((i) => i.data)]);
}

function bmp(svg, width, height) {
  const rgba = render(svg, width).pixels;
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const out = Buffer.alloc(54 + rowSize * height);
  out.write('BM', 0);
  out.writeUInt32LE(out.length, 2);
  out.writeUInt32LE(54, 10);
  out.writeUInt32LE(40, 14);
  out.writeInt32LE(width, 18);
  out.writeInt32LE(height, 22);
  out.writeUInt16LE(1, 26);
  out.writeUInt16LE(24, 28);
  out.writeUInt32LE(rowSize * height, 34);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const dst = 54 + (height - 1 - y) * rowSize + x * 3;
      out[dst] = rgba[src + 2];
      out[dst + 1] = rgba[src + 1];
      out[dst + 2] = rgba[src];
    }
  }
  return out;
}

function sidebar() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="164" height="314" viewBox="0 0 164 314">
    <rect width="164" height="314" fill="#F7F6F4"/>
    <g transform="translate(128 282) scale(0.26)">${mark({ cx: 0, cy: 0, r: 300, stroke: 72, bead: 44, color: '#ECE9E4' })}</g>
    <g transform="translate(24 32) scale(${56 / 1024})">${appIcon(1024).replace(/<\/?svg[^>]*>/g, '')}</g>
    <text x="24" y="122" font-family="Inter" font-weight="600" font-size="19" letter-spacing="-0.3" fill="#1C1B19">RemindAni</text>
    <text x="24" y="142" font-family="Inter" font-weight="500" font-size="11.5" fill="#64615B">For Windows 10 and 11</text>
  </svg>`;
}

function header() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="57" viewBox="0 0 150 57">
    <rect width="150" height="57" fill="#FFFFFF"/>
    <g transform="translate(102 10.5) scale(${36 / 1024})">${appIcon(1024).replace(/<\/?svg[^>]*>/g, '')}</g>
  </svg>`;
}

mkdirSync(`${root}assets/tray`, { recursive: true });
const APP_SIZES = [16, 24, 32, 48, 64, 128, 256];
const TRAY_SIZES = [16, 20, 24, 32, 40, 48];
const appIco = ico(APP_SIZES.map((size) => ({ size, svg: appIcon(size) })));
writeFileSync(`${root}build/icon.ico`, appIco);
writeFileSync(`${root}assets/icon.ico`, appIco);
writeFileSync(`${root}build/icon.png`, render(appIcon(512), 512).asPng());
writeFileSync(`${root}assets/tray/tray-white.ico`, ico(TRAY_SIZES.map((size) => ({ size, svg: trayIcon(size, '#FFFFFF') }))));
writeFileSync(`${root}assets/tray/tray-black.ico`, ico(TRAY_SIZES.map((size) => ({ size, svg: trayIcon(size, '#1C1B19') }))));
for (const [name, color] of [['tray-white', '#FFFFFF'], ['tray-black', '#1C1B19']]) {
  writeFileSync(`${root}assets/tray/${name}.png`, render(trayIcon(16, color), 16).asPng());
  writeFileSync(`${root}assets/tray/${name}@2x.png`, render(trayIcon(32, color), 32).asPng());
}
writeFileSync(`${root}build/installerSidebar.bmp`, bmp(sidebar(), 164, 314));
writeFileSync(`${root}build/installerHeader.bmp`, bmp(header(), 150, 57));
console.log('icons and installer art written');
