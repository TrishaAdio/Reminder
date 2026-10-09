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
const Updates = require('./updater');

app.setAppUserModelId('com.remindani.app');
// Reminders must be able to make a sound without anyone clicking first.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
registerScheme();

const flag = (name) => process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const fakeUpdate = flag('fake-update')?.split('=')[1] ?? (flag('fake-update') ? 'available' : null);

let quitting = false;
const isQuitting = () => quitting;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  boot();
}

function boot() {
  let mainWindow = null;
  let ipc = null;

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
    await store.pruneSounds();
    nativeTheme.themeSource = store.data.settings.theme;
    handleScheme({ sounds: store.soundsDir, companions: store.companionsDir });
    app.on('will-quit', () => store.flush());

    const env = await loadLocale();
    // GPU status reads as disabled until the GPU process reports in, so it is checked per card.
    const wantsSolid = () =>
      nativeTheme.prefersReducedTransparency ||
      !String(app.getGPUFeatureStatus().gpu_compositing).startsWith('enabled');

    const engine = new Engine(store);
    const updates = new Updates({ fake: fakeUpdate, beforeInstall: () => (quitting = true) });
    let tray = null;
    const popup = new Popup({
      store,
      locale: env,
      wantsSolid,
      trayBounds: () => tray?.bounds(),
      isQuitting,
      perf: Boolean(flag('perf')),
    });
    await popup.init();

    mainWindow = createMainWindow({ isQuitting, look: store.data.settings.look });
    ipc = registerIpc({ store, engine, popup, updates, env, mainWindow });

    const describe = () => {
      const { pausedUntil } = store.data.settings;
      const next = engine.upcoming();
      const sameDay = (t) => new Date(t).toDateString() === new Date().toDateString();
      const when = (t) => `${sameDay(t) ? '' : `${new Date(t).toLocaleDateString(env.locale, { weekday: 'short' })} `}${env.formatTime(t)}`;
      const { status, version } = updates.state;
      return {
        next: next ? `${next.reminder.name.trim() || 'Reminder'}, ${when(next.at)}` : null,
        paused: pausedUntil ? when(pausedUntil) : null,
        update: status === 'ready' ? 'ready' : ['available', 'downloading'].includes(status) ? version : null,
      };
    };
    tray = createTray({
      describe,
      actions: {
        open: showMain,
        quit: () => app.quit(),
        pause: (kind) => engine.pause(kind),
        install: () => updates.install(),
        openUpdates: () => {
          showMain();
          ipc.navigate({ tab: 'settings', section: 'about' });
        },
      },
    });

    engine.on('fire', (ids) => popup.enqueue(ids));
    engine.on('change', () => tray.refresh());
    updates.on('change', () => tray.refresh());
    popup.on('answer', (item, action) => {
      if (!item.preview) engine.answer(item.id, action);
    });
    engine.start();
    updates.start();

    if (!flag('hidden')) mainWindow.once('ready-to-show', () => mainWindow.show());
    mainWindow.loadURL('app://ui/main/index.html');
  });
}
