'use strict';

// Pure scheduling logic. No I/O, no clocks: every function takes `now` explicitly.
//
// Schedules (local wall-clock time, days are 0 = Sunday … 6 = Saturday):
//   { type: 'daily',    time: 'HH:MM', days: [..] }
//   { type: 'interval', every: minutes, from: 'HH:MM', to: 'HH:MM', days: [..] }
//
// Runtime state per reminder:
//   status   'scheduled' | 'snoozed' | 'due'   (due = on screen or queued, waiting for an answer)
//   nextAt   epoch ms of the next fire, or null
//   lastSlot epoch ms of the last scheduled occurrence that fired or was skipped (guards double-fires)
//   firedAt  epoch ms when it became due
//   since    epoch ms when nextAt was set (start of the countdown shown in the UI)

const MINUTE = 60_000;
const MISSED_GRACE = 10 * MINUTE;
const CLOCK_JUMP = MINUTE;

function minutesOf(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return { h, m };
}

function dayStart(ms, offsetDays = 0) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offsetDays).getTime();
}

function atTime(dayMs, hhmm) {
  const d = new Date(dayMs);
  const { h, m } = minutesOf(hhmm);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
}

function isActiveDay(schedule, dayMs) {
  return schedule.days.includes(new Date(dayMs).getDay());
}

function nextDaily(schedule, after) {
  for (let i = 0; i <= 7; i++) {
    const day = dayStart(after, i);
    if (!isActiveDay(schedule, day)) continue;
    const t = atTime(day, schedule.time);
    if (t > after) return t;
  }
  return null;
}

// The active window belongs to the day it starts on; `to <= from` means it runs past midnight.
function activeWindow(schedule, day) {
  const start = atTime(day, schedule.from);
  let end = atTime(day, schedule.to);
  if (end <= start) end = atTime(dayStart(day, 1), schedule.to);
  return { start, end };
}

// First fire inside a window is one interval after the window opens.
function nextInterval(schedule, anchor) {
  const every = schedule.every * MINUTE;
  for (let i = -1; i <= 7; i++) {
    const day = dayStart(anchor, i);
    if (!isActiveDay(schedule, day)) continue;
    const { start, end } = activeWindow(schedule, day);
    const t = anchor >= start ? anchor + every : start + every;
    if (t <= end) return t;
  }
  return null;
}

function nextOccurrence(reminder, now, lastSlot = null) {
  const s = reminder.schedule;
  if (!s.days.length) return null;
  if (s.type === 'daily') return nextDaily(s, Math.max(now, lastSlot ?? -Infinity));
  return nextInterval(s, now);
}

function scheduled(reminder, now, lastSlot) {
  return { status: 'scheduled', nextAt: nextOccurrence(reminder, now, lastSlot), lastSlot, firedAt: null, since: now };
}

function initialState(reminder, now) {
  return scheduled(reminder, now, null);
}

// Applies an edit or toggle. A due reminder keeps its state so the card on screen stays consistent.
function afterChange(prev, next, state, now) {
  if (!next.enabled) return state ?? initialState(next, now);
  const turnedOn = !prev || !prev.enabled;
  const scheduleChanged = prev && JSON.stringify(prev.schedule) !== JSON.stringify(next.schedule);
  if (!state || turnedOn || (scheduleChanged && state.status !== 'due')) return initialState(next, now);
  return state;
}

// Brings persisted state back after the app was not running.
function restore(reminder, state, now) {
  if (!state) return initialState(reminder, now);
  if (state.status !== 'due') return state;
  if (state.firedAt != null && now - state.firedAt <= MISSED_GRACE) {
    return { ...state, status: 'snoozed', nextAt: now, firedAt: null, since: now };
  }
  return scheduled(reminder, now, state.lastSlot);
}

// Repairs schedules after the wall clock jumped backwards or the time zone changed.
// Forward jumps need no repair: they look like sleep and the grace window handles them.
function reconcile(reminders, states, now, clock) {
  const jumpedBack = clock.lastNow != null && now < clock.lastNow - CLOCK_JUMP;
  const zoneChanged = clock.lastZone != null && clock.lastZone !== clock.zone;
  if (!jumpedBack && !zoneChanged) return states;

  const out = { ...states };
  for (const r of reminders) {
    const st = out[r.id];
    if (!r.enabled || !st) continue;
    if (st.status === 'scheduled') {
      out[r.id] = { ...st, nextAt: nextOccurrence(r, now, st.lastSlot), since: now };
    } else if (st.status === 'snoozed' && jumpedBack) {
      const remaining = Math.max(0, st.nextAt - clock.lastNow);
      out[r.id] = { ...st, nextAt: now + remaining, since: now };
    }
  }
  return out;
}

// Returns the reminders that should fire now, earliest first. Anything later than the grace
// window, or anything that comes up while muted (paused or quiet hours), is skipped and
// rescheduled instead of firing.
function tick(reminders, states, now, muted = false) {
  const out = { ...states };
  const due = [];
  const skipped = [];
  for (const r of reminders) {
    const st = out[r.id];
    if (!r.enabled || !st || st.status === 'due' || st.nextAt == null || st.nextAt > now) continue;
    const lastSlot = st.status === 'scheduled' ? st.nextAt : st.lastSlot;
    if (!muted && now - st.nextAt <= MISSED_GRACE) {
      due.push({ id: r.id, at: st.nextAt });
      out[r.id] = { status: 'due', nextAt: null, lastSlot, firedAt: now, since: st.since ?? now };
    } else {
      out[r.id] = scheduled(r, now, lastSlot);
      skipped.push(r.id);
    }
  }
  due.sort((a, b) => a.at - b.at);
  return { states: out, fire: due.map((d) => d.id), skipped };
}

function done(reminder, state, now) {
  return scheduled(reminder, now, state.lastSlot);
}

function wait(state, now, minutes) {
  return { ...state, status: 'snoozed', nextAt: now + minutes * MINUTE, firedAt: null, since: now };
}

function minuteOfDay(ms) {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

// Quiet hours run from `from` up to (not including) `to`, and may cross midnight.
function inQuietHours(now, quiet) {
  if (!quiet?.enabled) return false;
  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const m = minuteOfDay(now);
  const from = toMin(quiet.from);
  const to = toMin(quiet.to);
  if (from === to) return false;
  return from < to ? m >= from && m < to : m >= from || m < to;
}

function isMuted(now, settings) {
  return (settings.pausedUntil != null && now < settings.pausedUntil) || inQuietHours(now, settings.quiet);
}

function pauseEnd(kind, now) {
  if (kind === '30m') return now + 30 * MINUTE;
  if (kind === '1h') return now + 60 * MINUTE;
  if (kind === 'tomorrow') return dayStart(now, 1);
  return null;
}

// Projects upcoming fires in [from, to) for the timeline. Interval reminders count from
// whenever they are answered, so this assumes each one is answered on time.
function occurrences(reminder, state, from, to, limit = 96) {
  const out = [];
  if (!reminder.enabled || !state || state.nextAt == null) return out;
  let t = state.nextAt;
  while (t != null && t < to && out.length < limit) {
    if (t >= from) out.push(t);
    t = nextOccurrence(reminder, t, t);
  }
  return out;
}

// An interval longer than its window, or no days at all, can never fire.
function canFire(schedule) {
  if (!schedule.days.length) return false;
  if (schedule.type === 'daily') return true;
  const { start, end } = activeWindow(schedule, dayStart(Date.UTC(2024, 0, 1)));
  return schedule.every * MINUTE <= end - start;
}

module.exports = {
  MINUTE,
  MISSED_GRACE,
  nextOccurrence,
  initialState,
  afterChange,
  restore,
  reconcile,
  tick,
  done,
  wait,
  canFire,
  inQuietHours,
  isMuted,
  pauseEnd,
  occurrences,
};
