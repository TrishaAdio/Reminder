// The reward for answering Done. The popup window covers the whole work area, so the
// celebration uses all of it: eleven full-screen effects (confetti cannons, fireworks, hearts,
// star shower, bubbles, blossom storm, balloons, butterflies, rainbow, sparkle swirl, paw
// prints), dealt from a shuffled bag so all of them come up before any repeats. Every one also
// jumps the card, sends a shockwave and a flash out of the button and pops a praise badge with
// today's tally. Answering Done several times in a row without waiting builds a streak: more
// pieces and a slightly higher chime each time.
// Pieces are drawn by the canvas engine in particles.js, at the display's own refresh rate.

import { begin, emit, custom, stamp, color, idle } from './particles.js';

const HUES = [278, 240, 155, 52, 12, 82];
const STORE = 'remindani.celebrate';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const tint = (hue) => `oklch(var(--bit-l) var(--bit-c) ${hue})`;
const many = (n, fn) => Array.from({ length: Math.round(n) }, (_, i) => fn(i));
const settle = (anim) => anim.finished.catch(() => {});

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORE)) ?? {};
  } catch {
    return {};
  }
}

function save(data) {
  try {
    localStorage.setItem(STORE, JSON.stringify(data));
  } catch {
    // Storage can be unavailable; the bag and tally simply start over.
  }
}

let layer = null;
function stage() {
  if (!layer?.isConnected) {
    layer = document.createElement('div');
    layer.className = 'burst';
    layer.setAttribute('aria-hidden', 'true');
    document.body.append(layer);
  }
  return layer;
}

function add(className, style = {}) {
  const el = document.createElement('span');
  el.className = className;
  Object.assign(el.style, style);
  stage().append(el);
  return el;
}

// ── Sound ─────────────────────────────────────────────────────────────────────────────────

let audio = null;
let bus = null;
let noiseBuffer = null;

function engine() {
  audio ??= new AudioContext();
  if (audio.state === 'suspended') audio.resume();
  if (!bus) {
    const out = audio.createDynamicsCompressor();
    out.threshold.value = -14;
    out.ratio.value = 4;
    out.connect(audio.destination);
    // A small synthetic room, so the chimes ring out instead of stopping dead.
    const len = Math.round(audio.sampleRate * 1.6);
    const impulse = audio.createBuffer(2, len, audio.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = impulse.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    const reverb = audio.createConvolver();
    reverb.buffer = impulse;
    const wet = audio.createGain();
    wet.gain.value = 0.32;
    reverb.connect(wet).connect(out);
    noiseBuffer = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
    const n = noiseBuffer.getChannelData(0);
    for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;
    bus = { out, reverb };
  }
  return bus;
}

function sound(volume, pitch, play) {
  if (!(volume > 0)) return;
  try {
    const { out, reverb } = engine();
    const master = audio.createGain();
    master.gain.value = 0.26 * volume;
    master.connect(out);
    master.connect(reverb);
    const now = audio.currentTime + 0.02;
    const envelope = (gain, t, level, attack, dur) => {
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(level, t + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    };
    const tone = (freq, at, { dur = 0.6, type = 'sine', level = 1, glide = null, attack = 0.006, tuned = true } = {}) => {
      const t = now + at;
      const f = tuned ? freq * pitch : freq;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f, t);
      if (glide) osc.frequency.exponentialRampToValueAtTime(tuned ? glide * pitch : glide, t + dur * 0.7);
      envelope(gain, t, level, attack, dur);
      osc.connect(gain).connect(master);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    };
    const noise = (at, { dur = 0.3, filter = 'lowpass', freq = 1000, sweep = null, q = 0.8, level = 1, attack = 0.004 } = {}) => {
      const t = now + at;
      const src = audio.createBufferSource();
      src.buffer = noiseBuffer;
      src.loop = true;
      const f = audio.createBiquadFilter();
      f.type = filter;
      f.Q.value = q;
      f.frequency.setValueAtTime(freq, t);
      if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
      const gain = audio.createGain();
      envelope(gain, t, level, attack, dur);
      src.connect(f).connect(gain).connect(master);
      src.start(t, Math.random() * 0.5);
      src.stop(t + dur + 0.05);
    };
    // A bell: fundamental, a quiet octave and a faint inharmonic shimmer.
    const bell = (freq, at, dur = 0.9, level = 1) => {
      tone(freq, at, { dur, level });
      tone(freq * 2, at, { dur: dur * 0.6, level: level * 0.16, type: 'triangle' });
      tone(freq * 2.76, at, { dur: dur * 0.35, level: level * 0.05 });
    };
    play({ tone, noise, bell });
  } catch {
    // Sound is a bonus; Done works without it.
  }
}

// ── Picture reactions ─────────────────────────────────────────────────────────────────────

function hop(height, count = 1) {
  const frames = [];
  const steps = 16 * count;
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    const u = (k * count) % 1;
    const h = height * (count > 1 && k * count >= 1 ? 0.6 : 1);
    frames.push({ offset: k, transform: `translateY(${-h * 4 * u * (1 - u)}px)` });
  }
  frames.push({ offset: 1, transform: 'none' });
  return { frames, duration: 460 * count };
}

const REACTIONS = {
  hop: () => hop(46),
  bounce: () => hop(32, 2),
  wiggle: () => ({
    frames: [0, -9, 8, -6, 4, 0].map((deg, i, a) => ({ offset: i / (a.length - 1), transform: `translateY(${i % 2 ? -10 : 0}px) rotate(${deg}deg)` })),
    duration: 640,
  }),
  grow: () => ({
    frames: [
      { transform: 'none' },
      { transform: 'scale(1.14) translateY(-14px)', offset: 0.35 },
      { transform: 'scale(0.97)', offset: 0.7 },
      { transform: 'none' },
    ],
    duration: 560,
  }),
  sway: () => ({
    frames: [0, 7, -7, 4, 0].map((deg, i, a) => ({ offset: i / (a.length - 1), transform: `translate(${deg * 2}px, ${-Math.abs(deg)}px) rotate(${deg}deg)` })),
    duration: 760,
  }),
  spinHop: () => ({
    frames: [
      { transform: 'none' },
      { transform: 'translateY(-40px) rotate(-10deg)', offset: 0.4 },
      { transform: 'translateY(-16px) rotate(8deg)', offset: 0.7 },
      { transform: 'none' },
    ],
    duration: 620,
  }),
};

// ── The eleven celebrations ───────────────────────────────────────────────────────────────
// Each gets the screen size, the button and card rects, an intensity (1 and up with the
// streak) and `sfx`, which plays extra sounds at set times. Pieces go to the canvas engine.

const EFFECTS = {
  // Two cannons fire confetti up from the bottom corners; it flutters down over everything.
  confetti: {
    reaction: 'hop',
    run({ W, H, more }) {
      for (const side of [-1, 1]) {
        const x = side < 0 ? -10 : W + 10;
        many(80 * more, () =>
          emit({
            shape: pick(['strip', 'strip', 'strip', 'dot', 'spark']),
            color: Math.random() < 0.3 ? 'var(--accent)' : tint(pick(HUES)),
            x,
            y: H + 10,
            // Peaks between about 45% and 85% of the screen height, then flutters down at
            // drag-limited speed.
            angle: side < 0 ? rand(-82, -50) : rand(-130, -98),
            speed: rand(0.8, 1.35) * 2.2 * Math.max(700, H),
            gravity: 850,
            drag: 2.4,
            life: rand(2300, 2900),
            delay: rand(0, 120),
            size: rand(12, 22),
            spin: rand(-700, 700),
            tumble: rand(5, 12),
            sway: rand(8, 26),
            swayRate: rand(2, 4),
            grow: 0.04,
            fadeFrom: 0.78,
          }),
        );
      }
    },
    chime({ tone, noise, bell }) {
      noise(0, { dur: 0.14, filter: 'highpass', freq: 900, level: 0.9 });
      noise(0.05, { dur: 0.14, filter: 'highpass', freq: 1100, level: 0.8 });
      noise(0, { dur: 0.5, filter: 'lowpass', freq: 300, level: 0.6 });
      [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((f, i) => bell(f, 0.08 + i * 0.05, 1.1, i === 4 ? 0.7 : 0.9));
      tone(2093, 0.36, { dur: 0.8, level: 0.12 });
    },
  },

  // Rockets climb on real ballistic arcs, trailing sparks, and burst into glowing shells.
  fireworks: {
    reaction: 'grow',
    run({ W, H, card, more }) {
      const shells = Math.round(4 + more * 1.5);
      for (let n = 0; n < shells; n++) {
        const to = { x: W * ((n + 0.5) / shells) + rand(-40, 40), y: rand(H * 0.12, Math.max(H * 0.18, card.y + card.height * 0.4)) };
        const from = { x: to.x + rand(-70, 70), y: H + 20 };
        const g = 900;
        const climb = Math.sqrt((2 * (from.y - to.y)) / g);
        const vy = -g * climb;
        const vx = (to.x - from.x) / climb;
        const launch = n * 180 + rand(0, 60);
        let trail = 0;
        const fill = color('var(--accent)');
        custom({
          delay: launch,
          life: climb * 1000,
          render(_, t) {
            const x = from.x + vx * t;
            const y = from.y + vy * t + 0.5 * g * t * t;
            const vNow = vy + g * t;
            stamp('rocket', fill, 30, x, y, Math.atan2(vNow, vx) + Math.PI / 2, 1, 1 + Math.min(1.2, -vNow / 900), 1);
            // Sparks fall off the rocket every 14ms, whatever the refresh rate.
            while (trail <= t) {
              trail += 0.014;
              emit({ shape: 'glitter', color: 'var(--accent)', x: x + rand(-2, 2), y, angle: rand(60, 120), speed: rand(20, 70), gravity: 300, life: rand(300, 520), size: rand(3, 5), fadeFrom: 0.2 });
            }
          },
        });
        const burst = launch + climb * 1000;
        const hue = pick(HUES);
        const hue2 = pick(HUES);
        const sparks = Math.round(56 * Math.min(1.5, more));
        for (let i = 0; i < sparks; i++) {
          const streak = i % 2 === 1;
          emit({
            shape: streak ? 'streak' : 'ember',
            blur: streak,
            color: i % 5 === 0 ? 'var(--accent)' : tint(i % 3 ? hue : hue2),
            x: to.x,
            y: to.y,
            angle: (360 / sparks) * i + rand(-4, 4),
            speed: rand(380, 580),
            gravity: 340,
            drag: 2.4,
            life: rand(1200, 1700),
            delay: burst,
            size: streak ? rand(12, 18) : rand(7, 11),
            grow: 0.03,
            fadeFrom: 0.45,
          });
        }
        many(14, () =>
          emit({
            shape: 'glitter',
            color: 'var(--accent)',
            x: to.x + rand(-120, 120),
            y: to.y + rand(-90, 110),
            angle: 90,
            speed: rand(10, 50),
            gravity: 90,
            life: rand(900, 1300),
            delay: burst + rand(200, 500),
            size: rand(4, 7),
            twinkle: rand(25, 40),
            fadeFrom: 0.3,
          }),
        );
      }
    },
    chime({ tone, noise, bell }) {
      for (let n = 0; n < 5; n++) {
        const launch = n * 0.18;
        const burst = launch + 0.62;
        tone(700, launch, { dur: 0.62, glide: 2100, level: 0.08, tuned: false, attack: 0.05 });
        noise(burst, { dur: 1.1, filter: 'lowpass', freq: 520, sweep: 120, level: 1 });
        tone(80, burst, { dur: 0.5, glide: 38, level: 0.7, tuned: false });
        bell([1046.5, 1318.51, 1567.98, 1318.51, 2093][n], burst + 0.02, 0.9, 0.35);
        for (let c = 0; c < 6; c++) noise(burst + rand(0.2, 0.7), { dur: 0.04, filter: 'highpass', freq: 3000, level: 0.35 });
      }
    },
  },

  // A ring of big hearts bursts out of the card, then they float up the screen, swaying.
  hearts: {
    reaction: 'wiggle',
    run({ card, more }) {
      const c = { x: card.x + card.width / 2, y: card.y + card.height / 2 };
      const n = Math.round(44 * more);
      many(n, (i) =>
        emit({
          shape: 'heart',
          color: i % 4 === 0 ? 'var(--accent)' : tint(pick([12, 12, 350, 330, 278])),
          x: c.x + rand(-60, 60),
          y: c.y + rand(-20, 20),
          angle: (360 / n) * i + rand(-10, 10),
          speed: rand(500, 900),
          gravity: -260,
          drag: 3.4,
          life: rand(1800, 2400),
          delay: rand(0, 160),
          size: rand(18, 48),
          tilt: true,
          sway: rand(10, 30),
          swayRate: rand(3, 6),
          grow: 0.1,
          fadeFrom: 0.62,
        }),
      );
    },
    chime({ tone, noise, bell }) {
      noise(0, { dur: 0.3, filter: 'bandpass', freq: 900, sweep: 2400, level: 0.35 });
      [523.25, 659.25, 783.99].forEach((f) => tone(f, 0.02, { dur: 1.4, type: 'triangle', level: 0.5, attack: 0.04 }));
      bell(1046.5, 0.12, 1.3, 0.8);
      bell(1318.51, 0.3, 1.3, 0.6);
    },
  },

  // Gold stars rain down over the whole screen, spinning and twinkling.
  stars: {
    reaction: 'bounce',
    run({ W, card, more }) {
      many(90 * more, (i) =>
        emit({
          shape: i % 5 ? 'star' : 'spark',
          color: i % 2 ? 'var(--accent)' : tint(pick([82, 52, 240, 278])),
          x: rand(0, W),
          y: rand(-140, -20),
          angle: rand(80, 100),
          speed: rand(150, 420),
          gravity: 520,
          drag: 0.9,
          life: rand(2000, 2600),
          delay: rand(0, 700),
          size: rand(14, 38),
          spin: rand(-220, 220),
          twinkle: rand(8, 16),
          fadeFrom: 0.75,
        }),
      );
      many(12, () =>
        emit({
          shape: 'spark',
          color: 'var(--accent)',
          x: card.x + rand(0, card.width),
          y: card.y + rand(-40, card.height + 20),
          life: 700,
          delay: rand(0, 450),
          size: rand(26, 44),
          spin: rand(-120, 120),
          grow: 0.3,
          fadeFrom: 0.35,
        }),
      );
    },
    chime({ bell, tone }) {
      [1567.98, 1760, 2093, 2349.32, 2637.02, 3135.96].forEach((f, i) => bell(f, i * 0.06, 0.8, 0.55));
      [2637.02, 2093, 1760, 2093].forEach((f, i) => bell(f, 0.45 + i * 0.09, 0.9, 0.35));
      tone(523.25, 0, { dur: 1.6, type: 'triangle', level: 0.3, attack: 0.03 });
    },
  },

  // Bubbles of every size float up from the bottom of the screen and pop on the way.
  bubbles: {
    reaction: 'sway',
    run({ W, H, card, more }) {
      many(60 * more, () =>
        emit({
          shape: 'bubble',
          color: tint(pick([240, 240, 200, 155, 278])),
          x: rand(0, W),
          y: H + rand(10, 60),
          angle: -90 + rand(-6, 6),
          speed: rand(380, 760),
          gravity: -60,
          drag: 0.5,
          life: rand(1500, 2600),
          delay: rand(0, 600),
          size: rand(16, 70),
          sway: rand(10, 30),
          swayRate: rand(2, 5),
          grow: 0.15,
          fadeFrom: 0.97,
          pop: true,
        }),
      );
      many(16, () =>
        emit({
          shape: 'bubble',
          color: tint(pick([240, 200])),
          x: card.x + rand(0.1, 0.9) * card.width,
          y: card.y + card.height * rand(0.3, 0.8),
          angle: -90,
          speed: rand(200, 420),
          gravity: -80,
          drag: 0.7,
          life: rand(900, 1400),
          delay: rand(0, 200),
          size: rand(14, 36),
          sway: rand(6, 14),
          swayRate: rand(5, 9),
          grow: 0.25,
          fadeFrom: 0.95,
          pop: true,
        }),
      );
    },
    chime({ tone }) {
      for (let i = 0; i < 16; i++) {
        const f = rand(320, 980);
        tone(f, i * 0.07 + rand(0, 0.05), { dur: 0.13, glide: f * 2.3, level: rand(0.35, 0.7) });
      }
      tone(1046.5, 0.02, { dur: 1, level: 0.25 });
    },
  },

  // A gust of blossom petals blows across the whole screen.
  petals: {
    reaction: 'spinHop',
    run({ H, more }) {
      many(120 * more, () =>
        emit({
          shape: 'petal',
          color: Math.random() < 0.18 ? 'oklch(0.96 0.02 350)' : tint(pick([350, 12, 12, 330])),
          x: rand(-120, -10),
          y: rand(-H * 0.1, H * 0.85),
          angle: rand(-25, 15),
          speed: rand(700, 1300),
          gravity: 140,
          wind: 260,
          drag: 0.75,
          life: rand(2200, 2800),
          delay: rand(0, 650),
          size: rand(14, 30),
          spin: rand(-360, 360),
          tumble: rand(3, 7),
          sway: rand(10, 30),
          swayRate: rand(2, 4),
          grow: 0.05,
          fadeFrom: 0.8,
        }),
      );
    },
    chime({ tone, noise }) {
      noise(0, { dur: 1.8, filter: 'bandpass', freq: 500, sweep: 1600, q: 0.6, level: 0.45, attack: 0.5 });
      [587.33, 659.25, 783.99, 880, 987.77, 1174.66, 1318.51, 1567.98].forEach((f, i) => {
        tone(f, 0.05 + i * 0.05, { dur: 1.1, type: 'triangle', level: 0.55, attack: 0.003 });
      });
    },
  },

  // Balloons rise from the bottom on wiggling strings; some pop into confetti near the top.
  balloons: {
    reaction: 'hop',
    run({ W, H, more, sfx }) {
      const n = Math.round(18 * more);
      const pops = [];
      for (let i = 0; i < n; i++) {
        const size = rand(46, 74);
        const x0 = W * ((i + 0.5) / n) + rand(-30, 30);
        const y0 = H + size + rand(0, 120);
        const rise = rand(300, 430);
        const delay = rand(0, 700);
        const sway = rand(10, 24);
        const swayRate = rand(1.4, 2.4);
        const phase = rand(0, Math.PI * 2);
        const popsAt = i % 3 === 0 ? rand(1.4, 2.2) : null;
        const life = (popsAt ?? (y0 + size * 2) / rise) * 1000;
        const fill = color(tint(pick(HUES)));
        const string = color('var(--text-2)');
        if (popsAt) pops.push(delay / 1000 + popsAt);
        custom({
          delay,
          life,
          render(g, t, k) {
            const x = x0 + Math.sin(t * swayRate + phase) * sway;
            const y = y0 - rise * t - 40 * t * t;
            const tilt = Math.cos(t * swayRate + phase) * 0.12;
            // The string trails below, curling as the balloon sways.
            g.globalAlpha = 0.7;
            g.strokeStyle = string;
            g.lineWidth = 1.2;
            g.beginPath();
            g.moveTo(x, y + size * 0.5);
            for (let s = 1; s <= 6; s++) {
              const sy = y + size * 0.5 + s * size * 0.16;
              g.lineTo(x + Math.sin(t * 6 + s * 0.9 + phase) * 4 * (s / 6) - tilt * s * 6, sy);
            }
            g.stroke();
            stamp('balloon', fill, size, x, y, tilt, 1, 1, Math.min(1, t * 6));
            if (popsAt && k >= 1) {
              many(16, () => emit({ shape: pick(['strip', 'dot', 'spark']), color: fill, x, y, angle: rand(0, 360), speed: rand(180, 420), gravity: 700, drag: 2, life: rand(600, 900), size: rand(7, 12), spin: rand(-600, 600), tumble: rand(6, 12), fadeFrom: 0.5 }));
            }
          },
        });
      }
      sfx(({ noise, tone, bell }) => {
        for (const at of pops) {
          noise(at, { dur: 0.06, filter: 'highpass', freq: 1800, level: 0.9 });
          tone(170, at, { dur: 0.12, glide: 60, level: 0.5, tuned: false });
          bell(rand(1046, 1568), at + 0.02, 0.5, 0.25);
        }
      });
    },
    chime({ tone, bell }) {
      tone(420, 0, { dur: 0.22, glide: 700, type: 'triangle', level: 0.35 });
      tone(500, 0.12, { dur: 0.22, glide: 820, type: 'triangle', level: 0.3 });
      [659.25, 783.99, 1046.5].forEach((f, i) => bell(f, 0.2 + i * 0.08, 1, 0.6));
    },
  },

  // Butterflies flutter out of the card's edges and drift up and away.
  butterflies: {
    reaction: 'sway',
    run({ card, more }) {
      const n = Math.round(22 * more);
      many(n, (i) => {
        const left = i % 2 === 0;
        return emit({
          shape: 'butterfly',
          color: Math.random() < 0.25 ? 'var(--accent)' : tint(pick([278, 240, 330, 52, 155])),
          x: left ? card.x + rand(0, 40) : card.x + card.width - rand(0, 40),
          y: card.y + rand(10, card.height - 10),
          angle: left ? rand(-160, -110) : rand(-70, -20),
          speed: rand(260, 460),
          gravity: -70,
          wind: left ? -30 : 30,
          drag: 0.9,
          life: rand(2000, 2700),
          delay: rand(0, 500),
          size: rand(24, 40),
          flap: rand(7, 10),
          tilt: true,
          sway: rand(14, 30),
          swayRate: rand(2.5, 4),
          grow: 0.08,
          fadeFrom: 0.75,
        });
      });
    },
    chime({ tone, noise }) {
      for (let i = 0; i < 18; i++) noise(i * 0.035, { dur: 0.03, filter: 'bandpass', freq: 2600, q: 2, level: 0.18 });
      [1174.66, 1318.51, 1567.98, 1760, 2093].forEach((f, i) => tone(f, 0.1 + i * 0.11, { dur: 0.7, type: 'triangle', level: 0.4 }));
    },
  },

  // A rainbow sweeps over the card from cloud to cloud, scattering sparkles as it goes.
  rainbow: {
    reaction: 'grow',
    run({ card }) {
      const cx = card.x + card.width / 2;
      const cy = card.y + card.height * 0.8;
      const bands = [20, 55, 95, 150, 230, 285].map((h) => color(`oklch(0.8 0.14 ${h})`));
      const band = 14;
      // Wide enough to clear the card's sides, low enough to stay on screen.
      const R0 = Math.min(card.width * 0.54, cy - 60 - bands.length * band);
      const outer = R0 + bands.length * band;
      const cloud = color('oklch(0.98 0.01 250)');
      let sparkle = 0;
      custom({
        life: 2300,
        render(g, t) {
          const sweep = 1 - (1 - Math.min(1, t / 0.75)) ** 3;
          const fade = t < 1.7 ? 1 : Math.max(0, 1 - (t - 1.7) / 0.6);
          g.lineCap = 'round';
          bands.forEach((c, i) => {
            g.globalAlpha = 0.85 * fade;
            g.strokeStyle = c;
            g.lineWidth = band + 0.6;
            g.beginPath();
            g.arc(cx, cy, outer - band * (i + 0.5), Math.PI, Math.PI + Math.PI * sweep);
            g.stroke();
          });
          // Sparkles fall off the leading edge every 10ms.
          const a = Math.PI + Math.PI * sweep;
          while (sweep < 1 && sparkle <= t) {
            sparkle += 0.01;
            const r = rand(R0, outer);
            emit({ shape: pick(['glitter', 'spark']), color: pick(['var(--accent)', 'oklch(0.9 0.1 95)', 'oklch(0.85 0.1 230)']), x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, angle: rand(30, 150), speed: rand(30, 120), gravity: 200, life: rand(500, 900), size: rand(5, 12), spin: rand(-200, 200), fadeFrom: 0.3 });
          }
          // Puffy clouds at both feet, the right one arriving with the rainbow.
          for (const [side, at] of [[-1, 0], [1, 0.62]]) {
            const u = Math.max(0, t - at) / 0.35;
            if (u <= 0) continue;
            const s = u < 1 ? 1 + Math.sin(u * Math.PI) * 0.25 : 1;
            stamp('cloud', cloud, 46, cx + side * (outer - (bands.length * band) / 2), cy + 8, 0, s * Math.min(1, u * 2), s * Math.min(1, u * 2), fade);
          }
        },
      });
    },
    chime({ bell, tone }) {
      [523.25, 587.33, 659.25, 698.46, 783.99, 880, 987.77, 1046.5].forEach((f, i) => bell(f, i * 0.09, 0.9, 0.5));
      [1046.5, 1318.51, 1567.98].forEach((f) => tone(f, 0.75, { dur: 1.4, level: 0.18, attack: 0.05 }));
    },
  },

  // A galaxy of sparkles spins out of the card and spirals away.
  swirl: {
    reaction: 'wiggle',
    run({ card, more }) {
      const cx = card.x + card.width / 2;
      const cy = card.y + card.height / 2;
      const n = Math.round(150 * more);
      const stars = many(n, (i) => ({
        a0: (i / n) * Math.PI * 2 * 3 + rand(-0.2, 0.2),
        r0: rand(10, 40),
        reach: rand(220, 520),
        spin: rand(2.6, 4.2),
        size: rand(5, 13),
        shape: pick(['glitter', 'ember', 'spark', 'spark']),
        fill: color(i % 4 === 0 ? 'var(--accent)' : tint(pick([278, 240, 330, 200]))),
        delay: rand(0, 0.25),
        twinkle: rand(10, 24),
      }));
      custom({
        life: 2200,
        render(_, t) {
          for (const s of stars) {
            const u = t - s.delay;
            if (u <= 0) continue;
            const out = 1 - Math.exp(-u * 1.9);
            const r = s.r0 + s.reach * out;
            const a = s.a0 + s.spin * (1 - Math.exp(-u * 1.5)) + u * 0.5;
            const x = cx + Math.cos(a) * r;
            const y = cy + Math.sin(a) * r * 0.55;
            const k = u / 2;
            const o = (k < 0.08 ? k / 0.08 : k > 0.6 ? Math.max(0, 1 - (k - 0.6) / 0.4) : 1) * (0.6 + 0.4 * Math.sin(u * s.twinkle));
            // Stretched along the orbit while it is still fast.
            const speed = s.spin * 1.5 * Math.exp(-u * 1.5) * r;
            stamp(s.shape, s.fill, s.size, x, y, a + Math.PI, 1, s.shape === 'spark' ? 1 : 1 + Math.min(1.8, speed / 400), o);
          }
        },
      });
    },
    chime({ tone, noise, bell }) {
      noise(0, { dur: 1.2, filter: 'bandpass', freq: 300, sweep: 3200, q: 1.2, level: 0.4, attack: 0.25 });
      [523.25, 659.25, 783.99].forEach((f) => tone(f, 0, { dur: 1.8, level: 0.22, attack: 0.25 }));
      for (let i = 0; i < 8; i++) bell(rand(1568, 3136), 0.2 + i * 0.11, 0.5, 0.3);
    },
  },

  // A kitten walks across the screen, leaving paw prints, with a heart now and then.
  paws: {
    reaction: 'bounce',
    run({ W, H, card, more, sfx }) {
      const below = card.y + card.height + 110;
      const y0 = below < H - 40 ? below : Math.max(60, card.y - 90);
      const fill = 'var(--accent)';
      const step = 64;
      const steps = Math.ceil((W + 80) / step);
      const pace = Math.max(55, 1700 / steps);
      const taps = [];
      for (let i = 0; i < steps; i++) {
        const x = -40 + i * step;
        const wave = Math.sin(x / 260) * 46;
        const dir = Math.atan2(Math.cos(x / 260) * 46 / 260, 1);
        const side = i % 2 ? 1 : -1;
        const nx = -Math.sin(dir) * side * 15;
        const ny = Math.cos(dir) * side * 15;
        const delay = i * pace;
        taps.push(delay / 1000);
        emit({ shape: 'paw', color: fill, x: x + nx, y: y0 + wave + ny, speed: 0, life: 1500, delay, size: 26, rot: (dir * 180) / Math.PI + 90, grow: 0.08, fadeFrom: 0.55 });
        if (i % 4 === 2) {
          many(Math.round(3 * more), () =>
            emit({ shape: 'heart', color: tint(pick([12, 350, 330])), x: x + nx, y: y0 + wave + ny - 10, angle: rand(-120, -60), speed: rand(90, 180), gravity: -60, drag: 1.4, life: rand(900, 1200), delay: delay + 80, size: rand(12, 20), sway: rand(4, 10), grow: 0.15, fadeFrom: 0.5 }),
          );
        }
      }
      sfx(({ tone }) => taps.forEach((at, i) => tone(i % 2 ? 1046.5 : 880, at, { dur: 0.09, glide: (i % 2 ? 1046.5 : 880) * 0.75, level: 0.3 })));
    },
    chime({ bell }) {
      bell(783.99, 0, 0.6, 0.4);
      bell(1046.5, 0.1, 0.8, 0.4);
    },
  },
};

const NAMES = Object.keys(EFFECTS);

// Shuffle-bag: every celebration appears once per round, and a round never starts with the
// one that ended the last.
function nextEffect(data) {
  let bag = Array.isArray(data.bag) ? data.bag.filter((n) => NAMES.includes(n)) : [];
  if (!bag.length) {
    bag = [...NAMES].sort(() => Math.random() - 0.5);
    if (bag[0] === data.last && bag.length > 1) bag.push(bag.shift());
  }
  const name = bag.shift();
  data.bag = bag;
  data.last = name;
  return name;
}

// Cute words for the badge.
const CUTE = [
  'Yay, you did it!',
  'Look at you go!',
  'So proud of you!',
  'Little win, big smile!',
  'Gold star for you!',
  'Aww, well done!',
  'You’re doing amazing!',
  'Cutie did it!',
  'High five!',
  'Happy you, happy day!',
];

// Lines that match the reminder, by its icon.
const FOR_REMINDER = {
  drop: ['Hydrated & adorable!', 'Sip sip hooray!', 'Water you doing? Winning!'],
  eye: ['Happy eyes!', 'Your eyes say thank you!', 'Eyes rested, cutie!'],
  moon: ['Sweet dreams soon!', 'Cozy mode: on!', 'Sleepy time, superstar!'],
  pill: ['Healthy & happy!', 'Taking care of you!', 'Good job, healthy bean!'],
  stretch: ['Stretchy & strong!', 'Wiggle wiggle, done!', 'Feeling bendy!'],
  cup: ['Cup of yay!', 'Tea-rrific!'],
  book: ['Smarty pants!', 'Big brain energy!'],
  sun: ['You’re sunshine!', 'Bright and done!'],
};

// Lines that match the celebration on screen.
const FOR_EFFECT = {
  confetti: ['Party time!', 'Yippee!'],
  fireworks: ['You’re dazzling!', 'Sparkly work!'],
  hearts: ['Love that for you!', 'Sending you hearts!'],
  stars: ['Superstar!', 'Shine on, star!'],
  bubbles: ['Bubbly & done!', 'Pop pop, hooray!'],
  petals: ['Blooming lovely!', 'Pretty as petals!'],
};

const FIRST = ['First one, yay!', 'Great start, cutie!', 'And so it begins!'];
const STREAK = ['Combo ×{n}!', 'On a cute streak!', 'Unstoppable cutie!', '{n} in a row, wow!'];

function praise(data, { streak, count, effect, icon }) {
  let list;
  // Streak lines always mark 3 and every 5th in a row, and only now and then in between,
  // so the lines about the reminder itself still get their turn.
  const milestone = streak === 3 || (streak >= 5 && streak % 5 === 0);
  if (count === 1) list = FIRST;
  else if (streak >= 3 && (milestone || Math.random() < 0.2)) list = STREAK;
  else {
    const roll = Math.random();
    list = (roll < 0.5 && FOR_REMINDER[icon]) || (roll < 0.75 && FOR_EFFECT[effect]) || CUTE;
  }
  // Never the same line twice in a row.
  let line = pick(list);
  if (line === data.word && list.length > 1) line = list[(list.indexOf(line) + 1) % list.length];
  data.word = line;
  return { line: line.replace('{n}', streak), saysStreak: line.includes('{n}') };
}

// ── Shared moment: card jump, shockwave, flash, praise badge ─────────────────────────────

function flash(btn) {
  const d = Math.max(btn.width, btn.height) * 4;
  const el = add('flash', { left: `${btn.x + btn.width / 2 - d / 2}px`, top: `${btn.y + btn.height / 2 - d / 2}px`, width: `${d}px`, height: `${d}px` });
  return settle(el.animate([{ opacity: 0.85, transform: 'scale(0.15)' }, { opacity: 0, transform: 'scale(1)' }], { duration: 650, easing: 'cubic-bezier(0.1, 0.7, 0.3, 1)', fill: 'both' })).then(() => el.remove());
}

function shockwave(rect, radius, { delay = 0, grow = 60, width = 3, duration = 700 } = {}) {
  const el = add('shockwave', { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px`, borderRadius: `${radius}px`, '--w': `${width}px` });
  return settle(
    el.animate(
      [
        { opacity: 1, transform: 'scale(1)' },
        { opacity: 0, transform: `scale(${1 + (grow * 2) / rect.width}, ${1 + (grow * 2) / rect.height})` },
      ],
      { duration, delay, easing: 'cubic-bezier(0.1, 0.7, 0.3, 1)', fill: 'both' },
    ),
  ).then(() => el.remove());
}

function badge(card, { word, count, streak, check, leaving, calm }) {
  const el = add('praise');
  const mark = document.createElement('span');
  mark.className = 'praise-mark';
  mark.innerHTML = check;
  const text = document.createElement('span');
  text.className = 'praise-text';
  const title = document.createElement('span');
  title.className = 'praise-title';
  title.textContent = word.line;
  text.append(title);
  if (count) {
    const sub = document.createElement('span');
    sub.className = 'praise-sub';
    // The streak count goes here unless the line already says it ("5 in a row, wow!").
    const run = streak >= 2 && !word.saysStreak ? ` · ${streak} in a row` : '';
    sub.textContent = `${count === 1 ? 'First one today' : `${count} done today`}${run}`;
    text.append(sub);
  }
  el.append(mark, text);
  const x = card.x + card.width / 2;
  // Where the card was, if it is leaving; otherwise over its top edge, out of the way.
  const y = leaving ? card.y + card.height / 2 : card.y;
  Object.assign(el.style, { left: `${x}px`, top: `${y}px` });
  const frames = calm
    ? [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }]
    : [
        { opacity: 0, transform: 'translate(-50%, -50%) scale(0.4) rotate(-6deg)' },
        { opacity: 1, transform: 'translate(-50%, -50%) scale(1.12) rotate(2deg)', offset: 0.12 },
        { opacity: 1, transform: 'translate(-50%, -50%) scale(0.97) rotate(-1deg)', offset: 0.2 },
        { opacity: 1, transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', offset: 0.27 },
        { opacity: 1, transform: 'translate(-50%, -58%) scale(1)', offset: 0.78 },
        { opacity: 0, transform: 'translate(-50%, -80%) scale(0.94)' },
      ];
  const done = settle(el.animate(frames, { duration: 1700, delay: calm ? 0 : 140, easing: 'linear', fill: 'both' }));
  if (!calm) {
    settle(mark.animate([{ transform: 'scale(0) rotate(-90deg)' }, { transform: 'scale(1.25) rotate(8deg)', offset: 0.6 }, { transform: 'none' }], { duration: 520, delay: 220, easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)', fill: 'both' }));
  }
  return done.then(() => el.remove());
}

// Plays one celebration. `next` is the main process's reply (the next card, or null), which
// decides where the badge goes. Resolves `reacted` when the card and picture have finished
// reacting (so the card can leave) and `landed` once everything is gone (so the window can hide).
export function celebrate({ button, card, buddy, calm, volume, counts, check, next, icon }) {
  const data = load();
  const today = new Date().toDateString();
  if (data.day !== today) Object.assign(data, { day: today, done: 0, streak: 0 });
  if (counts) {
    data.done = (data.done ?? 0) + 1;
    data.streak = (data.streak ?? 0) + 1;
  }
  const streak = counts ? data.streak : 0;
  const name = nextEffect(data);
  const word = praise(data, { streak, count: counts ? data.done : 0, effect: name, icon });
  save(data);

  const effect = EFFECTS[name];
  const btn = button.getBoundingClientRect();
  const box = card.getBoundingClientRect();
  const more = 1 + 0.15 * Math.min(6, Math.max(0, streak - 1));
  // Each Done in a row lifts the chime a semitone, up to five.
  const pitch = 2 ** (Math.min(5, Math.max(0, streak - 1)) / 12);

  sound(volume, pitch, effect.chime);
  const parts = [shockwave(btn, 20, { grow: 26, duration: 560 })];
  parts.push(Promise.resolve(next).then((n) => badge(box, { word, count: counts ? data.done : 0, streak, check, leaving: !n, calm })));

  let reacted = Promise.resolve();
  if (!calm) {
    const { W, H } = begin(stage());
    effect.run({ W, H, btn, card: box, more, sfx: (play) => sound(volume, pitch, play) });
    parts.push(flash(btn), shockwave(box, 36, { delay: 60, grow: 70, width: 4, duration: 800 }), idle());
    const jump = card.animate(
      [
        { transform: 'none' },
        { transform: 'translateY(-10px) scale(1.035)', offset: 0.3 },
        { transform: 'translateY(2px) scale(0.995)', offset: 0.65 },
        { transform: 'none' },
      ],
      { duration: 460, easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)' },
    );
    const waits = [settle(jump)];
    if (buddy) {
      const { frames, duration } = REACTIONS[effect.reaction]();
      waits.push(settle(buddy.animate(frames, { duration, easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)' })));
    }
    reacted = Promise.all(waits);
  }
  return { name, reacted, landed: Promise.all([...parts, reacted]) };
}

// Waiting instead of Done ends the streak.
export function breakStreak() {
  const data = load();
  if (data.streak) {
    data.streak = 0;
    save(data);
  }
}
