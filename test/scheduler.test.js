'use strict';

// A zone with DST makes the wall-clock math honest.
process.env.TZ = 'Europe/Berlin';

const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('../src/main/scheduler');

const ALL = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];
const at = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const min = (n) => n * s.MINUTE;

const bedtime = { id: 'bed', enabled: true, schedule: { type: 'daily', time: '22:30', days: ALL } };
const water = {
  id: 'water',
  enabled: true,
  schedule: { type: 'interval', every: 60, from: '09:00', to: '18:00', days: WEEKDAYS },
};

// 2026-03-02 is a Monday.
const MON = (h, mi) => at(2026, 3, 2, h, mi);

test('daily fires later the same day, then tomorrow', () => {
  assert.equal(s.nextOccurrence(bedtime, MON(20, 0)), MON(22, 30));
  assert.equal(s.nextOccurrence(bedtime, MON(22, 30)), at(2026, 3, 3, 22, 30));
});

test('daily honours selected weekdays', () => {
  const r = { ...bedtime, schedule: { ...bedtime.schedule, days: [6] } };
  assert.equal(s.nextOccurrence(r, MON(9, 0)), at(2026, 3, 7, 22, 30));
});

test('no days selected never fires', () => {
  const r = { ...bedtime, schedule: { ...bedtime.schedule, days: [] } };
  assert.equal(s.nextOccurrence(r, MON(9, 0)), null);
  assert.equal(s.canFire(r.schedule), false);
});

test('interval starts one interval after the window opens', () => {
  assert.equal(s.nextOccurrence(water, MON(7, 0)), MON(10, 0));
});

test('interval counts from the moment Done is pressed', () => {
  const st = { status: 'due', nextAt: null, lastSlot: MON(11, 0), firedAt: MON(11, 0) };
  assert.equal(s.done(water, st, MON(11, 7)).nextAt, MON(12, 7));
});

test('interval rolls over to the next active day', () => {
  // Friday 17:30 + 60 min is past 18:00, Saturday and Sunday are off.
  assert.equal(s.nextOccurrence(water, at(2026, 3, 6, 17, 30)), at(2026, 3, 9, 10, 0));
});

test('interval window may run past midnight', () => {
  const night = { ...water, schedule: { type: 'interval', every: 30, from: '22:00', to: '02:00', days: ALL } };
  assert.equal(s.nextOccurrence(night, at(2026, 3, 3, 1, 0)), at(2026, 3, 3, 1, 30));
  assert.equal(s.nextOccurrence(night, at(2026, 3, 3, 1, 45)), at(2026, 3, 3, 22, 30));
});

test('interval longer than its window is flagged', () => {
  assert.equal(s.canFire({ type: 'interval', every: 120, from: '09:00', to: '10:00', days: ALL }), false);
  assert.equal(s.canFire(water.schedule), true);
});

test('daily survives the spring-forward DST gap', () => {
  const r = { ...bedtime, schedule: { type: 'daily', time: '02:30', days: ALL } };
  // 2026-03-29 02:00 → 03:00 in Berlin; 02:30 does not exist and resolves to 03:30.
  const next = s.nextOccurrence(r, at(2026, 3, 29, 0, 0));
  assert.equal(new Date(next).getHours(), 3);
  assert.equal(new Date(next).getDate(), 29);
});

test('daily stays at local wall time across the autumn DST change', () => {
  const before = s.nextOccurrence(bedtime, at(2026, 10, 24, 23, 0));
  assert.equal(new Date(before).getHours(), 22);
  assert.equal(new Date(before).getDate(), 25);
});

test('tick fires a reminder that is due', () => {
  const states = { bed: s.initialState(bedtime, MON(20, 0)) };
  const { states: out, fire } = s.tick([bedtime], states, MON(22, 30));
  assert.deepEqual(fire, ['bed']);
  assert.equal(out.bed.status, 'due');
  assert.equal(out.bed.lastSlot, MON(22, 30));
});

test('missed by less than 10 minutes still fires on resume', () => {
  const states = { bed: s.initialState(bedtime, MON(20, 0)) };
  assert.deepEqual(s.tick([bedtime], states, MON(22, 39)).fire, ['bed']);
});

test('missed by more than 10 minutes is skipped and rescheduled', () => {
  const states = { bed: s.initialState(bedtime, MON(20, 0)) };
  const { states: out, fire } = s.tick([bedtime], states, MON(22, 41));
  assert.deepEqual(fire, []);
  assert.equal(out.bed.status, 'scheduled');
  assert.equal(out.bed.nextAt, at(2026, 3, 3, 22, 30));
});

test('a due reminder never fires twice', () => {
  const states = { bed: s.initialState(bedtime, MON(20, 0)) };
  const first = s.tick([bedtime], states, MON(22, 30));
  const second = s.tick([bedtime], first.states, MON(22, 31));
  assert.deepEqual(second.fire, []);
});

test('Done after a daily fire schedules tomorrow even if the clock jumps back', () => {
  const fired = s.tick([bedtime], { bed: s.initialState(bedtime, MON(20, 0)) }, MON(22, 30)).states;
  const answered = { bed: s.done(bedtime, fired.bed, MON(22, 31)) };
  assert.equal(answered.bed.nextAt, at(2026, 3, 3, 22, 30));
  const clock = { lastNow: MON(22, 32), lastZone: -60, zone: -60 };
  const repaired = s.reconcile([bedtime], answered, MON(22, 0), clock);
  assert.equal(repaired.bed.nextAt, at(2026, 3, 3, 22, 30));
  assert.deepEqual(s.tick([bedtime], repaired, MON(22, 30)).fire, []);
});

test('Wait re-fires after the chosen minutes', () => {
  const fired = s.tick([bedtime], { bed: s.initialState(bedtime, MON(20, 0)) }, MON(22, 30)).states;
  const snoozed = { bed: s.wait(fired.bed, MON(22, 30), 3) };
  assert.equal(snoozed.bed.nextAt, MON(22, 33));
  assert.deepEqual(s.tick([bedtime], snoozed, MON(22, 32)).fire, []);
  assert.deepEqual(s.tick([bedtime], snoozed, MON(22, 33)).fire, ['bed']);
});

test('snooze keeps its remaining time when the clock jumps back', () => {
  const st = { bed: { status: 'snoozed', nextAt: MON(22, 33), lastSlot: MON(22, 30), firedAt: null } };
  const clock = { lastNow: MON(22, 31), lastZone: -60, zone: -60 };
  const out = s.reconcile([bedtime], st, MON(21, 31), clock);
  assert.equal(out.bed.nextAt, MON(21, 33));
});

test('reconcile is a no-op when the clock is steady', () => {
  const st = { bed: s.initialState(bedtime, MON(20, 0)) };
  const clock = { lastNow: MON(20, 0), lastZone: -60, zone: -60 };
  assert.equal(s.reconcile([bedtime], st, MON(20, 1), clock), st);
});

test('several reminders due together are returned earliest first', () => {
  const a = { ...bedtime, id: 'a', schedule: { ...bedtime.schedule, time: '22:31' } };
  const b = { ...bedtime, id: 'b' };
  const states = { a: s.initialState(a, MON(20, 0)), b: s.initialState(b, MON(20, 0)) };
  assert.deepEqual(s.tick([a, b], states, MON(22, 32)).fire, ['b', 'a']);
});

test('disabled reminders never fire', () => {
  const off = { ...bedtime, enabled: false };
  const states = { bed: s.initialState(bedtime, MON(20, 0)) };
  assert.deepEqual(s.tick([off], states, MON(22, 30)).fire, []);
});

test('turning a reminder back on starts fresh', () => {
  const stale = { status: 'scheduled', nextAt: MON(8, 0), lastSlot: null, firedAt: null };
  const st = s.afterChange({ ...bedtime, enabled: false }, bedtime, stale, MON(20, 0));
  assert.equal(st.nextAt, MON(22, 30));
});

test('editing the schedule recomputes, editing the text does not', () => {
  const st = s.initialState(bedtime, MON(20, 0));
  const later = { ...bedtime, schedule: { ...bedtime.schedule, time: '23:00' } };
  assert.equal(s.afterChange(bedtime, later, st, MON(20, 0)).nextAt, MON(23, 0));
  assert.equal(s.afterChange(bedtime, { ...bedtime, message: 'Lights out' }, st, MON(20, 0)), st);
});

test('restore re-shows a card that was on screen moments before quitting', () => {
  const st = { status: 'due', nextAt: null, lastSlot: MON(22, 30), firedAt: MON(22, 30) };
  const back = s.restore(bedtime, st, MON(22, 35));
  assert.equal(back.status, 'snoozed');
  assert.deepEqual(s.tick([bedtime], { bed: back }, MON(22, 35)).fire, ['bed']);
});

test('restore drops a card that is long stale', () => {
  const st = { status: 'due', nextAt: null, lastSlot: MON(22, 30), firedAt: MON(22, 30) };
  const back = s.restore(bedtime, st, at(2026, 3, 4, 9, 0));
  assert.equal(back.status, 'scheduled');
  assert.equal(back.nextAt, at(2026, 3, 4, 22, 30));
});
