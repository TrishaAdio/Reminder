'use strict';

process.env.TZ = 'Europe/Berlin';

const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('../src/main/scheduler');

const ALL = [0, 1, 2, 3, 4, 5, 6];
const at = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const MON = (h, mi) => at(2026, 3, 2, h, mi);

const bedtime = { id: 'bed', enabled: true, schedule: { type: 'daily', time: '22:30', days: ALL } };
const eyes = { id: 'eyes', enabled: true, schedule: { type: 'interval', every: 20, from: '09:00', to: '18:00', days: ALL } };
const quiet = (from, to) => ({ enabled: true, from, to });

test('quiet hours inside one day', () => {
  assert.equal(s.inQuietHours(MON(12, 30), quiet('12:00', '13:00')), true);
  assert.equal(s.inQuietHours(MON(13, 0), quiet('12:00', '13:00')), false);
  assert.equal(s.inQuietHours(MON(11, 59), quiet('12:00', '13:00')), false);
});

test('quiet hours across midnight', () => {
  assert.equal(s.inQuietHours(MON(23, 0), quiet('22:00', '07:00')), true);
  assert.equal(s.inQuietHours(MON(6, 59), quiet('22:00', '07:00')), true);
  assert.equal(s.inQuietHours(MON(7, 0), quiet('22:00', '07:00')), false);
});

test('quiet hours off, or empty, never mute', () => {
  assert.equal(s.inQuietHours(MON(23, 0), { enabled: false, from: '22:00', to: '07:00' }), false);
  assert.equal(s.inQuietHours(MON(23, 0), quiet('22:00', '22:00')), false);
});

test('pause mutes until its end', () => {
  const settings = { pausedUntil: MON(12, 0), quiet: { enabled: false, from: '22:00', to: '07:00' } };
  assert.equal(s.isMuted(MON(11, 59), settings), true);
  assert.equal(s.isMuted(MON(12, 0), settings), false);
});

test('pause lengths', () => {
  assert.equal(s.pauseEnd('30m', MON(10, 0)), MON(10, 30));
  assert.equal(s.pauseEnd('1h', MON(10, 0)), MON(11, 0));
  assert.equal(s.pauseEnd('tomorrow', MON(10, 0)), at(2026, 3, 3, 0, 0));
});

test('a reminder that comes up while muted is skipped, not queued', () => {
  const states = { bed: s.initialState(bedtime, MON(20, 0)) };
  const { states: out, fire, skipped } = s.tick([bedtime], states, MON(22, 30), true);
  assert.deepEqual(fire, []);
  assert.deepEqual(skipped, ['bed']);
  assert.equal(out.bed.nextAt, at(2026, 3, 3, 22, 30));
  // Unmuting later the same evening does not bring it back.
  assert.deepEqual(s.tick([bedtime], out, MON(22, 35), false).fire, []);
});

test('a snooze that runs out while muted goes back to the schedule', () => {
  const states = { bed: { status: 'snoozed', nextAt: MON(22, 33), lastSlot: MON(22, 30), firedAt: null, since: MON(22, 31) } };
  const { states: out, fire } = s.tick([bedtime], states, MON(22, 33), true);
  assert.deepEqual(fire, []);
  assert.equal(out.bed.status, 'scheduled');
  assert.equal(out.bed.nextAt, at(2026, 3, 3, 22, 30));
});

test('interval reminders keep their rhythm while muted', () => {
  const states = { eyes: s.initialState(eyes, MON(9, 0)) };
  const { states: out } = s.tick([eyes], states, MON(9, 20), true);
  assert.equal(out.eyes.nextAt, MON(9, 40));
});

test('since marks the start of every countdown', () => {
  assert.equal(s.initialState(bedtime, MON(20, 0)).since, MON(20, 0));
  const st = { status: 'due', nextAt: null, lastSlot: MON(22, 30), firedAt: MON(22, 30), since: MON(20, 0) };
  assert.equal(s.wait(st, MON(22, 31), 2).since, MON(22, 31));
  assert.equal(s.done(bedtime, st, MON(22, 32)).since, MON(22, 32));
});

test('occurrences project the rest of the day', () => {
  const st = s.initialState(eyes, MON(16, 30));
  const today = s.occurrences(eyes, st, MON(16, 30), at(2026, 3, 3, 0, 0));
  assert.deepEqual(today, [MON(16, 50), MON(17, 10), MON(17, 30), MON(17, 50)]);
});

test('occurrences are empty for disabled or never-firing reminders', () => {
  const st = s.initialState(eyes, MON(10, 0));
  assert.deepEqual(s.occurrences({ ...eyes, enabled: false }, st, MON(10, 0), MON(23, 0)), []);
  assert.deepEqual(s.occurrences(eyes, { ...st, nextAt: null }, MON(10, 0), MON(23, 0)), []);
});

test('daily occurrences within a day are just one', () => {
  const st = s.initialState(bedtime, MON(8, 0));
  assert.deepEqual(s.occurrences(bedtime, st, MON(8, 0), at(2026, 3, 3, 0, 0)), [MON(22, 30)]);
});
