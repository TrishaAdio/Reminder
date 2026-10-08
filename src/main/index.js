'use strict';

const { app, Menu, nativeTheme } = require('electron');
const { registerScheme, handleScheme } = require('./protocol');
const { loadLocale } = require('./locale');
const { createMainWindow } = require('./main-window');
const { createTray } = require('./tray');
const { registerIpc } = require('./ipc');
const Store = require('./store');
const Engine = require('./engine');
const Popup = require('./popup');

app.setAppUserModelId('com.remindani.app');
// Reminders must be able to make a sound without anyone clicking first.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
registerScheme();

let quitting = false;
const isQuitting = () => quitting;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  boot();
}

function boot() {
  let mainWindow = null;

  const showMain = () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  };

  app.on('second-instance', showMain);
  app.on('before-quit', () => {
    quitting = true;
  });
  // Living in the tray: closing every window must not end the app.
  app.on('window-all-closed', () => {});

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    const store = new Store(app.getPath('userData'));
    await store.load();
    handleScheme(store.soundsDir);
    app.on('will-quit', () => store.flush());

    const env = await loadLocale();
    // GPU status reads as disabled until the GPU process reports in, so it is checked per card.
    const wantsSolid = () =>
      nativeTheme.prefersReducedTransparency ||
      !String(app.getGPUFeatureStatus().gpu_compositing).startsWith('enabled');

    const engine = new Engine(store);
    let tray = null;
    const popup = new Popup({
      store,
      locale: env,
      wantsSolid,
      trayBounds: () => tray?.bounds(),
      isQuitting,
      perf: process.argv.includes('--perf'),
    });
    await popup.init();

    mainWindow = createMainWindow({ isQuitting });
    registerIpc({ store, engine, popup, env, mainWindow });

    const describeNext = () => {
      const next = engine.upcoming();
      if (!next) return null;
      const sameDay = new Date(next.at).toDateString() === new Date().toDateString();
      const day = sameDay ? '' : `${new Date(next.at).toLocaleDateString(env.locale, { weekday: 'short' })} `;
      return `${next.reminder.name.trim() || 'Reminder'}, ${day}${env.formatTime(next.at)}`;
    };
    tray = createTray({ onOpen: showMain, onQuit: () => app.quit(), describeNext });

    engine.on('fire', (ids) => popup.enqueue(ids));
    engine.on('change', () => tray.refresh());
    popup.on('answer', (item, action) => {
      if (!item.preview) engine.answer(item.id, action);
    });
    engine.start();

    if (!process.argv.includes('--hidden')) mainWindow.once('ready-to-show', () => mainWindow.show());
    mainWindow.loadURL('app://ui/main/index.html');
  });
}
