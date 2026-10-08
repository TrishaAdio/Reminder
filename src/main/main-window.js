'use strict';

const path = require('node:path');
const { BrowserWindow, nativeTheme } = require('electron');

const ICON = path.join(__dirname, '..', '..', 'assets', 'icon.ico');
const TITLE_BAR_HEIGHT = 40;

// Mirrors --bg and --text in tokens.css so the native caption buttons sit flush with the page.
function chrome() {
  return nativeTheme.shouldUseDarkColors
    ? { background: '#1B1A19', symbols: '#F4F3F0' }
    : { background: '#F7F6F4', symbols: '#1C1B19' };
}

function createMainWindow({ isQuitting }) {
  const { background, symbols } = chrome();
  const win = new BrowserWindow({
    width: 960,
    height: 660,
    minWidth: 780,
    minHeight: 540,
    show: false,
    title: 'RemindAni',
    icon: ICON,
    backgroundColor: background,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: background, symbolColor: symbols, height: TITLE_BAR_HEIGHT },
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'main.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  const onTheme = () => {
    const c = chrome();
    win.setBackgroundColor(c.background);
    win.setTitleBarOverlay({ color: c.background, symbolColor: c.symbols, height: TITLE_BAR_HEIGHT });
  };
  nativeTheme.on('updated', onTheme);
  win.on('closed', () => nativeTheme.off('updated', onTheme));

  win.on('close', (event) => {
    if (isQuitting()) return;
    event.preventDefault();
    win.hide();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  return win;
}

module.exports = { createMainWindow };
