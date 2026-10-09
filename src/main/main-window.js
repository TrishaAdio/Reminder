'use strict';

const path = require('node:path');
const { BrowserWindow, nativeTheme } = require('electron');

const ICON = path.join(__dirname, '..', '..', 'assets', 'icon.ico');
const TITLE_BAR_HEIGHT = 48;

// Mirrors --window and --text in tokens.css so the native caption buttons sit flush with the page.
function chrome() {
  return nativeTheme.shouldUseDarkColors
    ? { background: '#141312', symbols: '#F3F2EF' }
    : { background: '#F1EFEB', symbols: '#1A1917' };
}

function createMainWindow({ isQuitting }) {
  const { background, symbols } = chrome();
  const win = new BrowserWindow({
    width: 1000,
    height: 720,
    minWidth: 820,
    minHeight: 580,
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
