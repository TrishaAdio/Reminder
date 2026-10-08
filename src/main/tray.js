'use strict';

const path = require('node:path');
const { Tray, Menu, nativeTheme } = require('electron');

const TRAY_DIR = path.join(__dirname, '..', '..', 'assets', 'tray');

// The taskbar can be dark while apps are light (the Windows 10 default), so follow the system UI theme.
function iconPath() {
  const dark = process.platform === 'win32'
    ? nativeTheme.shouldUseDarkColorsForSystemIntegratedUI
    : nativeTheme.shouldUseDarkColors;
  // ICO lets Windows pick the exact size per DPI; other platforms cannot read ICO.
  const ext = process.platform === 'win32' ? 'ico' : 'png';
  return path.join(TRAY_DIR, `${dark ? 'tray-white' : 'tray-black'}.${ext}`);
}

function createTray({ onOpen, onQuit, describeNext }) {
  const tray = new Tray(iconPath());
  tray.on('click', onOpen);
  nativeTheme.on('updated', () => tray.setImage(iconPath()));

  const refresh = () => {
    const next = describeNext();
    tray.setToolTip(next ? `RemindAni\nNext: ${next}` : 'RemindAni');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open RemindAni', click: onOpen },
        { label: next ? `Next: ${next}` : 'Nothing scheduled', enabled: false },
        { type: 'separator' },
        { label: 'Quit RemindAni', click: onQuit },
      ]),
    );
  };
  refresh();
  return { refresh, bounds: () => tray.getBounds() };
}

module.exports = { createTray };
