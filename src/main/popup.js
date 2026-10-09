'use strict';

const path = require('node:path');
const { EventEmitter } = require('node:events');
const { BrowserWindow, ipcMain, screen } = require('electron');

// Solid fallback: no transparency, so the window is the card and sits at the chosen spot.
const SOLID = { width: 560, height: 300, margin: 24 };

function soundUrl(sound) {
  return sound.kind === 'file'
    ? `app://ui/sound/user/${encodeURIComponent(sound.file)}`
    : `app://ui/sound/builtin/${sound.id}.wav`;
}

class Popup extends EventEmitter {
  constructor({ store, locale, wantsSolid, trayBounds, isQuitting, perf }) {
    super();
    Object.assign(this, { store, locale, wantsSolid, trayBounds, isQuitting, perf });
    this.win = null;
    this.solid = false;
    this.queue = [];
    this.current = null;
    this.phase = 'hidden';
    this.area = null;
    this.companionTurn = 0;
  }

  // Each card brings the next picture, so they take turns.
  nextCompanion() {
    const { companions, companionOn } = this.store.data.settings;
    if (!companionOn || !companions.length || this.solid) return null;
    const c = companions[this.companionTurn++ % companions.length];
    return `app://ui/companion/${c.builtin ? 'builtin' : 'user'}/${encodeURIComponent(c.file)}`;
  }

  init() {
    const own = (handler) => (event, ...args) => (event.sender === this.win?.webContents ? handler(...args) : null);
    ipcMain.handle('popup:ready', own((rect) => this.reveal(rect)));
    ipcMain.handle('popup:answer', own((id, action) => this.answer(id, action)));
    ipcMain.on('popup:exited', own(() => this.exited()));
    ipcMain.on('popup:interactive', own((on) => {
      if (!this.solid) this.win.setIgnoreMouseEvents(!on, { forward: true });
    }));
    ipcMain.on('popup:frames', own((report) => console.log('[frames]', JSON.stringify(report))));
    return this.ensureWindow();
  }

  get visible() {
    return this.phase !== 'hidden';
  }

  // GPU compositing is reported late and transparency can be switched off at any time,
  // so the window is rebuilt whenever the answer changes.
  async ensureWindow() {
    const solid = this.wantsSolid();
    if (this.win && !this.win.isDestroyed() && solid === this.solid) return;
    this.win?.destroy();
    this.solid = solid;
    this.win = new BrowserWindow({
      width: SOLID.width,
      height: SOLID.height,
      show: false,
      frame: false,
      transparent: !solid,
      backgroundColor: solid ? undefined : '#00000000',
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: true,
      title: 'RemindAni reminder',
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload', 'popup.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        spellcheck: false,
        backgroundThrottling: false,
      },
    });
    this.win.setAlwaysOnTop(true, 'screen-saver');
    if (!solid) this.win.setIgnoreMouseEvents(true, { forward: true });

    // Alt+F4 counts as closing the card, which means the default wait.
    this.win.on('close', (event) => {
      if (this.isQuitting()) return;
      event.preventDefault();
      if (this.current) this.send('popup:close');
    });
    await this.win.loadURL('app://ui/popup/popup.html');
  }

  enqueue(ids, preview = false) {
    for (const id of ids) {
      if (this.current?.id === id || this.queue.some((q) => q.id === id)) continue;
      this.queue.push({ id, preview });
    }
    if (this.phase === 'hidden') this.present();
    else this.send('popup:queue', this.queue.length);
  }

  // A reminder that was deleted or switched off must not stay on screen.
  remove(id) {
    this.queue = this.queue.filter((q) => q.id !== id);
    if (this.current?.id !== id) return this.send('popup:queue', this.queue.length);
    this.current = this.queue.shift() ?? null;
    if (!this.current) this.phase = 'exiting';
    this.send('popup:replace', this.current && this.payload(this.current));
  }

  async present() {
    this.current = this.queue.shift() ?? null;
    if (!this.current) return;
    this.phase = 'showing';
    await this.ensureWindow();
    if (this.current) this.send('popup:show', this.payload(this.current));
  }

  payload({ id, preview }) {
    const r = this.store.data.reminders.find((x) => x.id === id);
    const st = this.store.data.runtime[id];
    const { settings } = this.store.data;
    return {
      id,
      preview,
      name: r.name.trim() || 'Reminder',
      message: r.message.trim() || r.name.trim() || 'Reminder',
      note: r.note.trim(),
      icon: r.icon,
      time: this.locale.formatTime(preview ? Date.now() : (st?.lastSlot ?? Date.now())),
      sound: soundUrl(r.sound),
      repeat: r.repeatSound,
      volume: settings.volume,
      defaultWait: r.wait ?? settings.defaultWait,
      position: settings.position,
      dim: settings.dim && !this.solid,
      companion: this.nextCompanion(),
      remaining: this.queue.length,
      solid: this.solid,
      perf: this.perf,
    };
  }

  reveal(rect) {
    if (!this.win.isVisible()) {
      this.place(rect);
      this.win.showInactive();
      this.win.moveTop();
    } else if (this.solid) {
      this.win.setSize(SOLID.width, Math.ceil(rect.height));
    }
    return { toward: this.towardTray(rect) };
  }

  place(rect) {
    this.area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const bounds = this.solid ? this.solidBounds(rect.height) : this.area;
    // Moving across monitors with different scaling applies the old factor once; repeating settles it.
    this.win.setBounds(bounds);
    this.win.setBounds(bounds);
  }

  solidBounds(height) {
    const a = this.area;
    const w = SOLID.width;
    const h = Math.ceil(height);
    const m = SOLID.margin;
    const spots = {
      top: { x: a.x + (a.width - w) / 2, y: a.y + m },
      'top-right': { x: a.x + a.width - w - m, y: a.y + m },
      'bottom-right': { x: a.x + a.width - w - m, y: a.y + a.height - h - m },
      center: { x: a.x + (a.width - w) / 2, y: a.y + (a.height - h) / 2 },
    };
    const spot = spots[this.store.data.settings.position] ?? spots.top;
    return { x: Math.round(spot.x), y: Math.round(spot.y), width: w, height: h };
  }

  towardTray(rect) {
    const b = this.win.getBounds();
    const from = { x: b.x + rect.x + rect.width / 2, y: b.y + rect.y + rect.height / 2 };
    const tray = this.trayBounds();
    const a = this.area ?? screen.getDisplayMatching(b).workArea;
    const to = tray && tray.width
      ? { x: tray.x + tray.width / 2, y: tray.y + tray.height / 2 }
      : { x: a.x + a.width, y: a.y + a.height };
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  }

  answer(id, action) {
    if (!this.current || this.current.id !== id) return null;
    if (action !== 'done' && action !== 2 && action !== 3) return null;
    const answered = this.current;
    this.current = this.queue.shift() ?? null;
    if (!this.current) this.phase = 'exiting';
    this.emit('answer', answered, action);
    return this.current && this.payload(this.current);
  }

  exited() {
    if (this.queue.length) return this.present();
    this.current = null;
    this.phase = 'hidden';
    this.win.hide();
    if (!this.solid) this.win.setIgnoreMouseEvents(true, { forward: true });
    this.emit('hidden');
  }

  send(channel, ...args) {
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send(channel, ...args);
  }
}

module.exports = Popup;
