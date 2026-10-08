// Synthesises the six built-in sounds as 44.1 kHz mono WAV. Original and deterministic.
import { writeFileSync, mkdirSync } from 'node:fs';

const RATE = 44100;
const out = new URL('../assets/sounds/', import.meta.url).pathname;

function buffer(seconds) {
  return new Float32Array(Math.ceil(seconds * RATE));
}

// Struck-bar voice: a few partials, each with its own exponential decay.
function strike(buf, at, freq, partials, gain = 1) {
  const start = Math.floor(at * RATE);
  for (const [ratio, amp, decay] of partials) {
    const w = 2 * Math.PI * freq * ratio;
    for (let i = 0; start + i < buf.length; i++) {
      const t = i / RATE;
      const env = Math.exp(-t / decay) * Math.min(1, t / 0.002);
      if (env < 1e-4) break;
      buf[start + i] += gain * amp * env * Math.sin(w * t);
    }
  }
}

function seeded(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
}

// Karplus-Strong plucked string.
function pluck(buf, at, freq, gain = 1, seed = 7) {
  const rand = seeded(seed);
  const period = Math.round(RATE / freq);
  const ring = Float32Array.from({ length: period }, rand);
  const start = Math.floor(at * RATE);
  for (let i = 0, p = 0; start + i < buf.length && i < RATE * 1.6; i++) {
    const next = (p + 1) % period;
    const v = ring[p];
    ring[p] = 0.996 * 0.5 * (v + ring[next]);
    buf[start + i] += gain * v * Math.min(1, i / 40);
    p = next;
  }
}

function finish(buf, fadeOut = 0.25) {
  const fade = Math.floor(fadeOut * RATE);
  for (let i = 0; i < fade; i++) buf[buf.length - 1 - i] *= i / fade;
  const peak = buf.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  const scale = 0.7 / peak;
  const pcm = Buffer.alloc(44 + buf.length * 2);
  pcm.write('RIFF', 0);
  pcm.writeUInt32LE(36 + buf.length * 2, 4);
  pcm.write('WAVEfmt ', 8);
  pcm.writeUInt32LE(16, 16);
  pcm.writeUInt16LE(1, 20);
  pcm.writeUInt16LE(1, 22);
  pcm.writeUInt32LE(RATE, 24);
  pcm.writeUInt32LE(RATE * 2, 28);
  pcm.writeUInt16LE(2, 32);
  pcm.writeUInt16LE(16, 34);
  pcm.write('data', 36);
  pcm.writeUInt32LE(buf.length * 2, 40);
  buf.forEach((v, i) => pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v * scale)) * 32767), 44 + i * 2));
  return pcm;
}

const BELL = [
  [1, 1, 0.9],
  [2.0, 0.35, 0.5],
  [3.01, 0.18, 0.3],
  [4.2, 0.08, 0.18],
];
const GLASS = [
  [1, 1, 0.8],
  [2.76, 0.3, 0.35],
  [5.4, 0.12, 0.16],
];
const WOOD = [
  [1, 1, 0.35],
  [3.93, 0.25, 0.06],
  [9.2, 0.06, 0.02],
];

const sounds = {
  chime() {
    const b = buffer(2.4);
    strike(b, 0, 659.25, BELL);
    strike(b, 0.32, 523.25, BELL, 0.9);
    return finish(b, 0.6);
  },
  glass() {
    const b = buffer(2);
    strike(b, 0, 1318.5, GLASS);
    strike(b, 0.16, 1661.2, GLASS, 0.45);
    return finish(b, 0.5);
  },
  marimba() {
    const b = buffer(1.6);
    [523.25, 659.25, 783.99].forEach((f, i) => strike(b, i * 0.12, f, WOOD, 1 - i * 0.1));
    return finish(b, 0.4);
  },
  droplet() {
    const b = buffer(0.9);
    for (const [at, from, to, gain] of [
      [0, 1900, 900, 1],
      [0.17, 2300, 1100, 0.7],
    ]) {
      const start = Math.floor(at * RATE);
      let phase = 0;
      for (let i = 0; i < RATE * 0.35; i++) {
        const t = i / RATE;
        phase += (2 * Math.PI * (to + (from - to) * Math.exp(-t / 0.025))) / RATE;
        b[start + i] += gain * Math.sin(phase) * Math.exp(-t / 0.07) * Math.min(1, t / 0.001);
      }
    }
    return finish(b, 0.2);
  },
  tide() {
    const b = buffer(3);
    const chord = [220, 277.18, 329.63, 440];
    for (let i = 0; i < b.length; i++) {
      const t = i / RATE;
      const env = Math.min(1, t / 0.6) * Math.exp(-Math.max(0, t - 0.8) / 0.7);
      const swell = 1 + 0.08 * Math.sin(2 * Math.PI * 3.5 * t);
      let v = 0;
      chord.forEach((f, k) => (v += Math.sin(2 * Math.PI * f * t) * (k === 3 ? 0.3 : 1) + 0.12 * Math.sin(4 * Math.PI * f * t)));
      b[i] = v * env * swell;
    }
    return finish(b, 0.5);
  },
  pluck() {
    const b = buffer(1.8);
    [392, 493.88, 587.33, 783.99].forEach((f, i) => pluck(b, i * 0.09, f, 1 - i * 0.12, 11 + i));
    return finish(b, 0.4);
  },
};

mkdirSync(out, { recursive: true });
for (const [name, make] of Object.entries(sounds)) writeFileSync(`${out}${name}.wav`, make());
console.log('sounds written:', Object.keys(sounds).join(', '));
