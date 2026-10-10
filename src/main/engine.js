'use strict';

const { EventEmitter } = require('node:events');
const { powerMonitor } = require('electron');
const scheduler = require('./scheduler');

// Timers are armed for the next fire but never sleep longer than this, so wall-clock and
// time-zone changes (which Windows does not announce to Node) are noticed within half a minute.
const MAX_SLEEP = 30_000;
const DAY = 86_400_000;
// How far ahead a reminder is announced ('approaching'), so other apps' sound can fade out.
const LEAD = 10_000;
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
    this.muted = false;
    this.announced = null;
  }

  get reminders() {
    return this.store.data.reminders;
  }

  get runtime() {
    return this.store.data.runtime;
  }

  get settings() {
    return this.store.data.settings;
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
    let changed = false;

    if (this.settings.pausedUntil != null && now >= this.settings.pausedUntil) {
      this.settings.pausedUntil = null;
      changed = true;
    }
    const muted = scheduler.isMuted(now, this.settings);
    if (muted !== this.muted) {
      this.muted = muted;
      changed = true;
    }

    const before = this.runtime;
    const repaired = scheduler.reconcile(this.reminders, before, now, { ...this.clock, zone });
    const { states, fire } = scheduler.tick(this.reminders, repaired, now, muted);
    this.clock = { lastNow: now, lastZone: zone };

    if (JSON.stringify(states) !== JSON.stringify(before)) {
      this.store.data.runtime = states;
      changed = true;
    }
    if (changed) {
      this.store.save();
      this.emit('change');
    }
    if (fire.length) this.emit('fire', fire);
    this.lookAhead(now);
    this.arm(now);
  }

  // Announces the next reminder once, LEAD before it comes up, unless it will be skipped
  // (paused or in quiet hours by then).
  lookAhead(now) {
    const next = this.upcoming();
    if (!next || next.at <= now || next.at - now > LEAD + 100) return;
    if (scheduler.isMuted(next.at, this.settings)) return;
    const key = `${next.reminder.id}:${next.at}`;
    if (key === this.announced) return;
    this.announced = key;
    this.emit('approaching', { id: next.reminder.id, at: next.at, in: next.at - now });
  }

  arm(now) {
    const times = [];
    for (const r of this.reminders) {
      const t = r.enabled ? this.runtime[r.id]?.nextAt : null;
      if (t == null) continue;
      times.push(t);
      // Also wake LEAD before it, to announce it.
      if (t - LEAD > now) times.push(t - LEAD);
    }
    if (this.settings.pausedUntil != null) times.push(this.settings.pausedUntil);
    const next = times.length ? Math.min(...times) : Infinity;
    this.timer = setTimeout(() => this.run(), Math.min(MAX_SLEEP, Math.max(250, next - now)));
  }

  answer(id, action) {
    const r = this.reminders.find((x) => x.id === id);
    const st = this.runtime[id];
    if (!r || !st || st.status !== 'due') return;
    const now = Date.now();
    this.runtime[id] = action === 'done' ? scheduler.done(r, st, now) : scheduler.wait(st, now, action);
    this.commit();
  }

  changed(prev, next) {
    this.runtime[next.id] = scheduler.afterChange(prev, next, this.runtime[next.id], Date.now());
    this.commit();
  }

  removed(id) {
    delete this.runtime[id];
    this.commit();
  }

  restored(reminder, state) {
    this.runtime[reminder.id] = state && state.status !== 'due' ? state : scheduler.initialState(reminder, Date.now());
    this.commit();
  }

  pause(kind) {
    this.settings.pausedUntil = scheduler.pauseEnd(kind, Date.now());
    this.commit();
  }

  commit() {
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

  // Everything still to come before midnight, for the timeline.
  today(now = Date.now()) {
    const d = new Date(now);
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
    const out = [];
    for (const r of this.reminders) {
      for (const at of scheduler.occurrences(r, this.runtime[r.id], now, Math.min(end, now + DAY))) out.push({ id: r.id, at });
    }
    return out.sort((a, b) => a.at - b.at);
  }
}

module.exports = Engine;
