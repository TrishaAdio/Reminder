'use strict';

const path = require('node:path');
const { EventEmitter } = require('node:events');
const { BrowserWindow, ipcMain, screen } = require('electron');

const CARD_WIDTH = 420;
// The transparent window is larger than the card so the shadow and the exit travel have room.
const MARGIN = { top: 20, side: 28 };
const FRAME = { width: CARD_WIDTH + MARGIN.side * 2, height: 340 };

function soundUrl(sound) {
  return sound.kind === 'file'
    ? `app://sound/user/${encodeURIComponent(sound.file)}`
    : `app://sound/builtin/${sound.id}.wav`;
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
    this.bounds = null;
  }

  init() {
    const own = (handler) => (event, ...args) => (event.sender === this.win?.webContents ? handler(...args) : null);
    ipcMain.handle('popup:ready', own((height) => this.reveal(height)));
    ipcMain.handle('popup:answer', own((id, action) => this.answer(id, action)));
    ipcMain.on('popup:exited', own(() => this.exited()));
    ipcMain.on('popup:interactive', own((on) => {
      if (!this.solid) this.win.setIgnoreMouseEvents(!on, { forward: true });
    }));
    ipcMain.on('popup:frames', own((report) => console.log('[frames]', JSON.stringify(report))));
    return this.ensureWindow();
  }

  // Transparency needs GPU compositing and the user's consent; either can change while running.
  async ensureWindow() {
    const solid = this.wantsSolid();
    if (this.win && !this.win.isDestroyed() && solid === this.solid) return;
    this.win?.destroy();
    this.solid = solid;
    this.win = new BrowserWindow({
      ...(this.solid ? { width: CARD_WIDTH, height: 220 } : FRAME),
      show: false,
      frame: false,
      transparent: !this.solid,
      backgroundColor: this.solid ? undefined : '#00000000',
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
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
    if (!this.solid) this.win.setIgnoreMouseEvents(true, { forward: true });

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
      time: this.locale.formatTime(st?.lastSlot ?? Date.now()),
      sound: soundUrl(r.sound),
      repeat: r.repeatSound,
      volume: settings.volume,
      defaultWait: settings.defaultWait,
      remaining: this.queue.length,
      solid: this.solid,
      perf: this.perf,
    };
  }

  reveal(cardHeight) {
    if (!this.win.isVisible()) {
      this.place(cardHeight);
      this.win.showInactive();
      this.win.moveTop();
    } else if (this.solid) {
      this.win.setSize(CARD_WIDTH, Math.ceil(cardHeight));
    }
    return { toward: this.towardTray(cardHeight) };
  }

  place(cardHeight) {
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const size = this.solid ? { width: CARD_WIDTH, height: Math.ceil(cardHeight) } : FRAME;
    const bounds = {
      x: Math.round(area.x + (area.width - size.width) / 2),
      y: area.y + (this.solid ? 28 : 8),
      ...size,
    };
    // Moving across monitors with different scaling applies the old factor once; repeating settles it.
    this.win.setBounds(bounds);
    this.win.setBounds(bounds);
    this.bounds = bounds;
  }

  towardTray(cardHeight) {
    const b = this.bounds;
    const from = { x: b.x + b.width / 2, y: b.y + (this.solid ? 0 : MARGIN.top) + cardHeight / 2 };
    const tray = this.trayBounds();
    const area = screen.getDisplayMatching(b).workArea;
    const to = tray && tray.width
      ? { x: tray.x + tray.width / 2, y: tray.y + tray.height / 2 }
      : { x: area.x + area.width, y: area.y + area.height };
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
    this.phase = 'hidden';
    this.win.hide();
    if (!this.solid) this.win.setIgnoreMouseEvents(true, { forward: true });
  }

  send(channel, ...args) {
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send(channel, ...args);
  }
}

module.exports = Popup;
