'use strict';

const os = require('node:os');
const path = require('node:path');
const { BrowserWindow, nativeTheme } = require('electron');

const ICON = path.join(__dirname, '..', '..', 'assets', 'icon.ico');
const TITLE_BAR_HEIGHT = 48;
const CLEAR = '#00000000';

// System backdrop materials arrived in Windows 11 22H2 (build 22621).
function supportsMaterial() {
  return process.platform === 'win32' && Number(os.release().split('.')[2]) >= 22621;
}

// The glass look puts acrylic behind the whole window, unless someone asked Windows for less
// transparency; then glass keeps its own painted backdrop.
function usesMaterial(look) {
  return look === 'glass' && supportsMaterial() && !nativeTheme.prefersReducedTransparency;
}

// Mirrors --window and --text in tokens.css so the native caption buttons sit flush with the
// page. With glass the caption area is clear and the page (or acrylic) shows through it.
function chrome(look) {
  const dark = nativeTheme.shouldUseDarkColors;
  const symbols = dark ? '#F3F2EF' : '#1A1917';
  if (look === 'glass') {
    return { background: usesMaterial(look) ? CLEAR : dark ? '#0E0E13' : '#EEF0F6', overlay: CLEAR, symbols: dark ? '#FFFFFF' : '#000000' };
  }
  const background = dark ? '#141312' : '#F1EFEB';
  return { background, overlay: background, symbols };
}

function applyLook(win, look) {
  if (win.isDestroyed()) return;
  const c = chrome(look);
  const material = usesMaterial(look);
  if (supportsMaterial()) win.setBackgroundMaterial(material ? 'acrylic' : 'none');
  win.setBackgroundColor(c.background);
  win.setTitleBarOverlay({ color: c.overlay, symbolColor: c.symbols, height: TITLE_BAR_HEIGHT });
  // Windows sometimes only paints a newly set material after the next resize.
  if (material && win.isVisible() && !win.isMaximized() && !win.isFullScreen()) {
    const [w, h] = win.getSize();
    win.setSize(w + 1, h);
    win.setSize(w, h);
  }
}

function createMainWindow({ isQuitting, look }) {
  const c = chrome(look);
  const win = new BrowserWindow({
    width: 1000,
    height: 720,
    minWidth: 820,
    minHeight: 580,
    show: false,
    title: 'RemindAni',
    icon: ICON,
    backgroundColor: c.background,
    backgroundMaterial: usesMaterial(look) ? 'acrylic' : undefined,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: c.overlay, symbolColor: c.symbols, height: TITLE_BAR_HEIGHT },
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'main.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  let current = look;
  const onTheme = () => applyLook(win, current);
  nativeTheme.on('updated', onTheme);
  win.on('closed', () => nativeTheme.off('updated', onTheme));

  // Coming back from the tray can leave the material unpainted until the next resize too.
  win.on('show', () => {
    if (usesMaterial(current)) setImmediate(() => applyLook(win, current));
  });

  win.on('close', (event) => {
    if (isQuitting()) return;
    event.preventDefault();
    win.hide();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.setLook = (next) => {
    current = next;
    applyLook(win, next);
  };
  return win;
}

module.exports = { createMainWindow, usesMaterial };
