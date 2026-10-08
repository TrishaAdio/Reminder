'use strict';

const { EventEmitter } = require('node:events');
const { powerMonitor } = require('electron');
const scheduler = require('./scheduler');

// Timers are armed for the next fire but never sleep longer than this, so wall-clock and
// time-zone changes (which Windows does not announce to Node) are noticed within half a minute.
const MAX_SLEEP = 30_000;
const userSetZone = 'TZ' in process.env;

function refreshZone() {
  // Deleting TZ makes Node re-read the system time zone; V8 caches it otherwise.
  if (!userSetZone) delete process.env.TZ;
  return new Date().getTimezoneOffset();
}

class Engine extends EventEmitter {
  constructor(store) {
    super();
    this.store = store;
    this.timer = null;
    this.clock = { lastNow: null, lastZone: null };
  }

  get reminders() {
    return this.store.data.reminders;
  }

  get runtime() {
    return this.store.data.runtime;
  }

  start() {
    const now = Date.now();
    const runtime = {};
    for (const r of this.reminders) runtime[r.id] = scheduler.restore(r, this.runtime[r.id], now);
    this.store.data.runtime = runtime;
    this.store.save();
    for (const event of ['resume', 'unlock-screen']) powerMonitor.on(event, () => this.run());
    this.run();
  }

  run() {
    clearTimeout(this.timer);
    const now = Date.now();
    const zone = refreshZone();
    const before = this.runtime;
    const repaired = scheduler.reconcile(this.reminders, before, now, { ...this.clock, zone });
    const { states, fire } = scheduler.tick(this.reminders, repaired, now);
    this.clock = { lastNow: now, lastZone: zone };

    if (JSON.stringify(states) !== JSON.stringify(before)) {
      this.store.data.runtime = states;
      this.store.save();
      this.emit('change');
    }
    if (fire.length) this.emit('fire', fire);
    this.arm(now);
  }

  arm(now) {
    const times = this.reminders
      .filter((r) => r.enabled)
      .map((r) => this.runtime[r.id]?.nextAt)
      .filter((t) => t != null);
    const next = times.length ? Math.min(...times) : Infinity;
    this.timer = setTimeout(() => this.run(), Math.min(MAX_SLEEP, Math.max(250, next - now)));
  }

  answer(id, action) {
    const r = this.reminders.find((x) => x.id === id);
    const st = this.runtime[id];
    if (!r || !st) return;
    const now = Date.now();
    this.runtime[id] = action === 'done' ? scheduler.done(r, st, now) : scheduler.wait(st, now, action);
    this.store.save();
    this.emit('change');
    this.run();
  }

  changed(prev, next) {
    this.runtime[next.id] = scheduler.afterChange(prev, next, this.runtime[next.id], Date.now());
    this.store.save();
    this.emit('change');
    this.run();
  }

  removed(id) {
    delete this.runtime[id];
    this.store.save();
    this.emit('change');
    this.run();
  }

  upcoming() {
    let best = null;
    for (const r of this.reminders) {
      const at = r.enabled ? this.runtime[r.id]?.nextAt : null;
      if (at != null && (!best || at < best.at)) best = { reminder: r, at };
    }
    return best;
  }
}

module.exports = Engine;
