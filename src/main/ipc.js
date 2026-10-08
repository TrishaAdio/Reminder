'use strict';

const { app, dialog, ipcMain, shell } = require('electron');
const { PRESETS, SOUNDS, fromPreset, applyPatch } = require('./reminders');

const loginItem = {
  options() {
    return app.isPackaged
      ? { args: ['--hidden'] }
      : { path: process.execPath, args: [app.getAppPath(), '--hidden'] };
  },
  get() {
    return app.getLoginItemSettings(this.options()).openAtLogin;
  },
  set(on) {
    app.setLoginItemSettings({ openAtLogin: on, ...this.options() });
  },
};

function registerIpc({ store, engine, popup, env, mainWindow }) {
  const snapshot = () => ({
    reminders: store.data.reminders,
    runtime: Object.fromEntries(
      Object.entries(store.data.runtime).map(([id, st]) => [id, { status: st.status, nextAt: st.nextAt }]),
    ),
    settings: { ...store.data.settings, openAtLogin: loginItem.get() },
    sounds: SOUNDS,
    presets: PRESETS.map(({ id, name, icon, schedule }) => ({ id, name, icon, schedule })),
    env: { locale: env.locale, hourCycle: env.hourCycle, dataPath: store.dir, version: app.getVersion() },
  });

  const broadcast = () => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('state:changed', snapshot());
  };
  engine.on('change', broadcast);

  const handle = (channel, fn) =>
    ipcMain.handle(channel, (event, ...args) => (event.sender === mainWindow.webContents ? fn(...args) : null));

  const update = (id, patch) => {
    const list = store.data.reminders;
    const i = list.findIndex((r) => r.id === id);
    if (i < 0) return null;
    const prev = list[i];
    const next = applyPatch(prev, patch, (file) => store.soundExists(file));
    list[i] = next;
    if (!next.enabled) popup.remove(id);
    engine.changed(prev, next);
    if (prev.sound !== next.sound) store.pruneSounds();
    return next;
  };

  handle('app:get-state', snapshot);

  handle('reminder:create', (presetId) => {
    const r = fromPreset(presetId, Date.now());
    store.data.reminders.push(r);
    engine.changed(null, r);
    return r.id;
  });

  handle('reminder:update', (id, patch) => update(id, patch ?? {}));

  handle('reminder:delete', (id) => {
    store.data.reminders = store.data.reminders.filter((r) => r.id !== id);
    popup.remove(id);
    engine.removed(id);
    store.pruneSounds();
  });

  handle('reminder:preview', (id) => {
    if (store.data.reminders.some((r) => r.id === id)) popup.enqueue([id], true);
  });

  handle('sound:choose', async (id) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose a sound',
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'ogg'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths.length) return { canceled: true };
    try {
      return { reminder: update(id, { sound: await store.importSound(filePaths[0]) }) };
    } catch {
      return { error: true };
    }
  });

  handle('settings:set', (key, value) => {
    const { settings } = store.data;
    if (key === 'defaultWait' && (value === 2 || value === 3)) settings.defaultWait = value;
    else if (key === 'volume' && typeof value === 'number') settings.volume = Math.min(1, Math.max(0, value));
    else if (key === 'openAtLogin' && typeof value === 'boolean') loginItem.set(value);
    else return;
    store.save();
    broadcast();
  });

  handle('app:show-data-folder', () => shell.openPath(store.dir));

  ipcMain.on('window:close', (event) => {
    if (event.sender === mainWindow.webContents) mainWindow.close();
  });
}

module.exports = { registerIpc };
