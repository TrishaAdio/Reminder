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

// `describe()` returns { next, pausedUntil, update } as display strings or null.
function createTray({ describe, actions }) {
  const tray = new Tray(iconPath());
  tray.on('click', actions.open);
  nativeTheme.on('updated', () => tray.setImage(iconPath()));

  const refresh = () => {
    const { next, paused, update } = describe();
    const status = paused ? `Paused until ${paused}` : next ? `Next: ${next}` : 'Nothing scheduled';
    tray.setToolTip(`RemindAni\n${status}`);
    const template = [
      { label: 'Open RemindAni', click: actions.open },
      { label: status, enabled: false },
      { type: 'separator' },
      paused
        ? { label: 'Resume reminders', click: () => actions.pause('resume') }
        : {
            label: 'Pause reminders',
            submenu: [
              { label: 'For 30 minutes', click: () => actions.pause('30m') },
              { label: 'For 1 hour', click: () => actions.pause('1h') },
              { label: 'Until tomorrow', click: () => actions.pause('tomorrow') },
            ],
          },
    ];
    if (update === 'ready') template.push({ label: 'Restart to update', click: actions.install });
    else if (update) template.push({ label: `Update available (${update})`, click: actions.openUpdates });
    template.push({ type: 'separator' }, { label: 'Quit RemindAni', click: actions.quit });
    tray.setContextMenu(Menu.buildFromTemplate(template));
  };
  refresh();
  return { refresh, bounds: () => tray.getBounds() };
}

module.exports = { createTray };
