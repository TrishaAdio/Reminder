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

function initialState(reminder, now) {
  return { status: 'scheduled', nextAt: nextOccurrence(reminder, now), lastSlot: null, firedAt: null };
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
    return { ...state, status: 'snoozed', nextAt: now, firedAt: null };
  }
  return {
    status: 'scheduled',
    lastSlot: state.lastSlot,
    nextAt: nextOccurrence(reminder, now, state.lastSlot),
    firedAt: null,
  };
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
      out[r.id] = { ...st, nextAt: nextOccurrence(r, now, st.lastSlot) };
    } else if (st.status === 'snoozed' && jumpedBack) {
      const remaining = Math.max(0, st.nextAt - clock.lastNow);
      out[r.id] = { ...st, nextAt: now + remaining };
    }
  }
  return out;
}

// Returns the reminders that should fire now, earliest first. Anything later than the grace
// window is skipped and rescheduled instead of firing stale.
function tick(reminders, states, now) {
  const out = { ...states };
  const due = [];
  for (const r of reminders) {
    const st = out[r.id];
    if (!r.enabled || !st || st.status === 'due' || st.nextAt == null || st.nextAt > now) continue;
    const lastSlot = st.status === 'scheduled' ? st.nextAt : st.lastSlot;
    if (now - st.nextAt <= MISSED_GRACE) {
      due.push({ id: r.id, at: st.nextAt });
      out[r.id] = { status: 'due', nextAt: null, lastSlot, firedAt: now };
    } else {
      out[r.id] = { status: 'scheduled', nextAt: nextOccurrence(r, now, lastSlot), lastSlot, firedAt: null };
    }
  }
  due.sort((a, b) => a.at - b.at);
  return { states: out, fire: due.map((d) => d.id) };
}

function done(reminder, state, now) {
  return {
    status: 'scheduled',
    lastSlot: state.lastSlot,
    nextAt: nextOccurrence(reminder, now, state.lastSlot),
    firedAt: null,
  };
}

function wait(state, now, minutes) {
  return { ...state, status: 'snoozed', nextAt: now + minutes * MINUTE, firedAt: null };
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
};
