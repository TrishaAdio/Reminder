'use strict';

const { randomUUID } = require('node:crypto');

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];

const SOUNDS = [
  { id: 'tide', name: 'Tide' },
  { id: 'droplet', name: 'Droplet' },
  { id: 'glass', name: 'Glass' },
  { id: 'marimba', name: 'Marimba' },
  { id: 'chime', name: 'Chime' },
  { id: 'pluck', name: 'Pluck' },
];

const PRESETS = [
  {
    id: 'bedtime',
    name: 'Bed time',
    icon: 'moon',
    message: 'Time to wind down',
    note: 'Screens off in 15 minutes.',
    schedule: { type: 'daily', time: '22:30', days: ALL_DAYS },
    sound: 'tide',
    repeatSound: false,
  },
  {
    id: 'water',
    name: 'Drink water',
    icon: 'drop',
    message: 'Have a glass of water',
    note: 'A few sips counts too.',
    schedule: { type: 'interval', every: 60, from: '09:00', to: '18:00', days: WEEKDAYS },
    sound: 'droplet',
    repeatSound: false,
  },
  {
    id: 'eyes',
    name: 'Rest your eyes',
    icon: 'eye',
    message: 'Look 20 feet away',
    note: 'Pick something across the room and hold it for 20 seconds.',
    schedule: { type: 'interval', every: 20, from: '09:00', to: '18:00', days: WEEKDAYS },
    sound: 'glass',
    repeatSound: false,
  },
  {
    id: 'stretch',
    name: 'Stretch',
    icon: 'stretch',
    message: 'Stand up and stretch',
    note: 'Shoulders back, reach up, take a few steps.',
    schedule: { type: 'interval', every: 50, from: '09:00', to: '18:00', days: WEEKDAYS },
    sound: 'marimba',
    repeatSound: false,
  },
  {
    id: 'medicine',
    name: 'Take medicine',
    icon: 'pill',
    message: 'Take your medicine',
    note: 'Morning dose, with a glass of water.',
    schedule: { type: 'daily', time: '08:30', days: ALL_DAYS },
    sound: 'chime',
    repeatSound: true,
  },
  {
    id: 'custom',
    name: 'Reminder',
    icon: 'flag',
    message: '',
    note: '',
    schedule: { type: 'daily', time: '09:00', days: WEEKDAYS },
    sound: 'pluck',
    repeatSound: false,
  },
];

const ICONS = new Set(PRESETS.map((p) => p.icon));
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const AUDIO_EXT = new Set(['.mp3', '.wav', '.m4a', '.ogg']);

function fromPreset(presetId, now) {
  const p = PRESETS.find((x) => x.id === presetId) ?? PRESETS.at(-1);
  return {
    id: randomUUID(),
    preset: p.id,
    name: p.name,
    message: p.message,
    note: p.note,
    icon: p.icon,
    enabled: true,
    schedule: structuredClone(p.schedule),
    sound: { kind: 'builtin', id: p.sound },
    repeatSound: p.repeatSound,
    createdAt: now,
  };
}

function text(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : undefined;
}

function days(value) {
  if (!Array.isArray(value)) return undefined;
  return [...new Set(value.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
}

function schedule(value, current) {
  if (!value || typeof value !== 'object') return current;
  const d = days(value.days) ?? current.days;
  if (value.type === 'daily') {
    const fallback = current.type === 'daily' ? current.time : '09:00';
    return { type: 'daily', time: TIME.test(value.time) ? value.time : fallback, days: d };
  }
  if (value.type === 'interval') {
    const every = Number.isInteger(value.every) ? Math.min(240, Math.max(5, value.every)) : 30;
    return {
      type: 'interval',
      every,
      from: TIME.test(value.from) ? value.from : '09:00',
      to: TIME.test(value.to) ? value.to : '18:00',
      days: d,
    };
  }
  return current;
}

function sound(value, current, soundExists) {
  if (!value || typeof value !== 'object') return current;
  if (value.kind === 'builtin' && SOUNDS.some((s) => s.id === value.id)) return { kind: 'builtin', id: value.id };
  if (value.kind === 'file' && typeof value.file === 'string' && soundExists(value.file)) {
    return { kind: 'file', file: value.file, name: text(value.name, 120) ?? value.file };
  }
  return current;
}

// Only known fields with valid values survive; everything else keeps its current value.
function applyPatch(reminder, patch, soundExists) {
  const next = { ...reminder };
  if ('name' in patch) next.name = text(patch.name, 60) ?? next.name;
  if ('message' in patch) next.message = text(patch.message, 80) ?? next.message;
  if ('note' in patch) next.note = text(patch.note, 160) ?? next.note;
  if ('icon' in patch && ICONS.has(patch.icon)) next.icon = patch.icon;
  if ('enabled' in patch && typeof patch.enabled === 'boolean') next.enabled = patch.enabled;
  if ('repeatSound' in patch && typeof patch.repeatSound === 'boolean') next.repeatSound = patch.repeatSound;
  if ('schedule' in patch) next.schedule = schedule(patch.schedule, reminder.schedule);
  if ('sound' in patch) next.sound = sound(patch.sound, reminder.sound, soundExists);
  return next;
}

module.exports = { PRESETS, SOUNDS, AUDIO_EXT, fromPreset, applyPatch };
