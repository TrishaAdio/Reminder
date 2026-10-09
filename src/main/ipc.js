'use strict';

const { app, dialog, ipcMain, nativeTheme, shell } = require('electron');
const { PRESETS, SOUNDS, ICONS, fromPreset, duplicate, applyPatch } = require('./reminders');
const { usesMaterial } = require('./main-window');

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const POSITIONS = ['top', 'top-right', 'bottom-right', 'center'];
const THEMES = ['system', 'light', 'dark'];
const LOOKS = ['classic', 'glass'];

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

function registerIpc({ store, engine, popup, updates, env, mainWindow }) {
  const { data } = store;
  const snapshot = () => ({
    reminders: store.data.reminders,
    runtime: Object.fromEntries(
      Object.entries(store.data.runtime).map(([id, st]) => [id, { status: st.status, nextAt: st.nextAt, since: st.since ?? null }]),
    ),
    today: engine.today(),
    muted: engine.muted,
    settings: { ...store.data.settings, openAtLogin: loginItem.get() },
    sounds: SOUNDS,
    icons: ICONS,
    presets: PRESETS.map(({ id, name, icon, blurb, schedule }) => ({ id, name, icon, blurb, schedule })),
    update: updates.state,
    env: {
      locale: env.locale,
      hourCycle: env.hourCycle,
      dataPath: store.dir,
      version: app.getVersion(),
      material: usesMaterial(store.data.settings.look),
    },
  });

  const send = (channel, value) => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send(channel, value);
  };
  const broadcast = () => send('state:changed', snapshot());
  engine.on('change', broadcast);
  updates.on('change', (state) => send('update:state', state));

  const handle = (channel, fn) =>
    ipcMain.handle(channel, (event, ...args) => (event.sender === mainWindow.webContents ? fn(...args) : null));
  const find = (id) => store.data.reminders.findIndex((r) => r.id === id);

  const update = (id, patch) => {
    const i = find(id);
    if (i < 0) return null;
    const prev = store.data.reminders[i];
    const next = applyPatch(prev, patch, (file) => store.soundExists(file));
    store.data.reminders[i] = next;
    if (!next.enabled) popup.remove(id);
    engine.changed(prev, next);
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

  handle('reminder:duplicate', (id) => {
    const i = find(id);
    if (i < 0) return null;
    const copy = duplicate(store.data.reminders[i], Date.now());
    store.data.reminders.splice(i + 1, 0, copy);
    engine.changed(null, copy);
    return copy.id;
  });

  // The renderer keeps what it gets back so Undo can put the reminder back exactly.
  handle('reminder:delete', (id) => {
    const index = find(id);
    if (index < 0) return null;
    const [reminder] = store.data.reminders.splice(index, 1);
    const state = store.data.runtime[id] ?? null;
    popup.remove(id);
    engine.removed(id);
    return { reminder, index, state };
  });

  handle('reminder:restore', (deleted) => {
    if (!deleted?.reminder?.id || find(deleted.reminder.id) >= 0) return false;
    const list = store.data.reminders;
    list.splice(Math.min(Math.max(0, deleted.index | 0), list.length), 0, deleted.reminder);
    engine.restored(deleted.reminder, deleted.state);
    return true;
  });

  handle('reminder:test', (id) => {
    if (find(id) >= 0) popup.enqueue([id], true);
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

  const setters = {
    defaultWait: (v) => [2, 3].includes(v) && ((data.settings.defaultWait = v), true),
    volume: (v) => typeof v === 'number' && ((data.settings.volume = Math.min(1, Math.max(0, v))), true),
    openAtLogin: (v) => typeof v === 'boolean' && (loginItem.set(v), true),
    dim: (v) => typeof v === 'boolean' && ((data.settings.dim = v), true),
    companionOn: (v) => typeof v === 'boolean' && ((data.settings.companionOn = v), true),
    position: (v) => POSITIONS.includes(v) && ((data.settings.position = v), true),
    theme: (v) => {
      if (!THEMES.includes(v)) return false;
      data.settings.theme = v;
      nativeTheme.themeSource = v;
      return true;
    },
    look: (v) => {
      if (!LOOKS.includes(v)) return false;
      data.settings.look = v;
      mainWindow.setLook(v);
      return true;
    },
    quiet: (v) => {
      if (!v || typeof v.enabled !== 'boolean' || !TIME.test(v.from) || !TIME.test(v.to)) return false;
      data.settings.quiet = { enabled: v.enabled, from: v.from, to: v.to };
      return true;
    },
  };

  handle('settings:set', (key, value) => {
    if (setters[key]?.(value)) engine.commit();
  });

  handle('companion:add', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose pictures for the reminder card',
      filters: [{ name: 'Pictures', extensions: ['png', 'webp', 'gif', 'jpg', 'jpeg'] }],
      properties: ['openFile', 'multiSelections'],
    });
    if (canceled || !filePaths.length) return { added: 0 };
    let added = 0;
    let failed = 0;
    for (const file of filePaths) {
      try {
        await store.importCompanion(file);
        added++;
      } catch {
        failed++;
      }
    }
    engine.commit();
    return { added, failed };
  });

  handle('companion:restore', () => {
    const added = store.restoreBuiltinCompanions();
    engine.commit();
    return added;
  });

  handle('companion:remove', async (file) => {
    await store.removeCompanion(String(file));
    engine.commit();
  });

  handle('pause:set', (kind) => {
    if (['30m', '1h', 'tomorrow', 'resume'].includes(kind)) engine.pause(kind);
  });

  handle('update:check', () => updates.check(true));
  handle('update:download', () => updates.download());
  handle('update:retry', () => updates.retry());
  handle('update:install', () => updates.install());

  handle('app:show-data-folder', () => shell.openPath(store.dir));

  ipcMain.on('window:close', (event) => {
    if (event.sender === mainWindow.webContents) mainWindow.close();
  });

  return { navigate: (to) => send('navigate', to) };
}

module.exports = { registerIpc };
