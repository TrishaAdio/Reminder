// Renders the app icon, tray icons, in-app mark and installer bitmaps. Run with `npm run assets`.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const root = new URL('..', import.meta.url).pathname;
const FONTS = [`${root}build/fonts/Inter-SemiBold.ttf`, `${root}build/fonts/Inter-Medium.ttf`];

// The app icon is the photo in build/icon-source.jpg. Replace that file and run `npm run assets`.
const PHOTO = `data:image/jpeg;base64,${readFileSync(`${root}build/icon-source.jpg`).toString('base64')}`;
const SOURCE = 561;
// Crops in source pixels: the whole kitten with its flower, and just the face for 16 and 24px,
// where the full picture would turn to mush.
const CROP_FULL = { x: 55, y: 45, size: 440 };
const CROP_FACE = { x: 140, y: 150, size: 260 };

// A rounded tile with the photo clipped inside. Large sizes keep a small margin like other
// Windows app icons; small ones fill the square so every pixel counts.
function appIcon(size, id = `i${size}`) {
  const small = size <= 24;
  const inset = small ? 0 : 48;
  const side = 1024 - inset * 2;
  const crop = small ? CROP_FACE : CROP_FULL;
  const scale = side / crop.size;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
    <defs><clipPath id="${id}"><rect x="${inset}" y="${inset}" width="${side}" height="${side}" rx="${side * 0.22}"/></clipPath></defs>
    <image clip-path="url(#${id})" href="${PHOTO}" x="${inset - crop.x * scale}" y="${inset - crop.y * scale}" width="${SOURCE * scale}" height="${SOURCE * scale}" preserveAspectRatio="none"/>
  </svg>`;
}

// Tray: a photo can't follow the taskbar colour, so the tray gets a one-colour cat head with
// the eyes cut out, in white for dark taskbars and near-black for light ones.
function trayIcon(size, color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
    <path fill="${color}" fill-rule="evenodd" d="
      M 196 360 L 236 92 Q 244 60 274 78 L 430 214 Q 512 196 594 214 L 750 78 Q 780 60 788 92 L 828 360
      Q 892 470 872 610 Q 832 880 512 912 Q 192 880 152 610 Q 132 470 196 360 Z
      M 372 560 m -58 0 a 58 70 0 1 0 116 0 a 58 70 0 1 0 -116 0 Z
      M 652 560 m -58 0 a 58 70 0 1 0 116 0 a 58 70 0 1 0 -116 0 Z
      M 470 690 L 554 690 L 512 740 Z"/>
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
    <g transform="translate(24 32) scale(${64 / 1024})">${appIcon(1024, 'side').replace(/<\/?svg[^>]*>/g, '')}</g>
    <text x="24" y="128" font-family="Inter" font-weight="600" font-size="19" letter-spacing="-0.3" fill="#1C1B19">RemindAni</text>
    <text x="24" y="148" font-family="Inter" font-weight="500" font-size="11.5" fill="#64615B">For Windows 10 and 11</text>
  </svg>`;
}

function header() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="57" viewBox="0 0 150 57">
    <rect width="150" height="57" fill="#FFFFFF"/>
    <g transform="translate(100 8.5) scale(${40 / 1024})">${appIcon(1024, 'head').replace(/<\/?svg[^>]*>/g, '')}</g>
  </svg>`;
}

mkdirSync(`${root}assets/tray`, { recursive: true });
const APP_SIZES = [16, 24, 32, 48, 64, 128, 256];
const TRAY_SIZES = [16, 20, 24, 32, 40, 48];
const appIco = ico(APP_SIZES.map((size) => ({ size, svg: appIcon(size) })));
writeFileSync(`${root}build/icon.ico`, appIco);
writeFileSync(`${root}assets/icon.ico`, appIco);
writeFileSync(`${root}build/icon.png`, render(appIcon(512), 512).asPng());
writeFileSync(`${root}src/renderer/shared/app-icon.png`, render(appIcon(128), 128).asPng());
writeFileSync(`${root}assets/tray/tray-white.ico`, ico(TRAY_SIZES.map((size) => ({ size, svg: trayIcon(size, '#FFFFFF') }))));
writeFileSync(`${root}assets/tray/tray-black.ico`, ico(TRAY_SIZES.map((size) => ({ size, svg: trayIcon(size, '#1C1B19') }))));
for (const [name, color] of [['tray-white', '#FFFFFF'], ['tray-black', '#1C1B19']]) {
  writeFileSync(`${root}assets/tray/${name}.png`, render(trayIcon(16, color), 16).asPng());
  writeFileSync(`${root}assets/tray/${name}@2x.png`, render(trayIcon(32, color), 32).asPng());
}
writeFileSync(`${root}build/installerSidebar.bmp`, bmp(sidebar(), 164, 314));
writeFileSync(`${root}build/installerHeader.bmp`, bmp(header(), 150, 57));
console.log('icons and installer art written');
