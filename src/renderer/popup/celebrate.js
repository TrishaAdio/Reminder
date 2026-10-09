// The reward for answering Done. The popup window covers the whole work area, so the
// celebration uses all of it: six full-screen effects (confetti cannons, fireworks, hearts,
// star shower, bubbles, blossom storm), dealt from a shuffled bag so all six come up before
// any repeats. Every one also jumps the card, sends a shockwave and a flash out of the button
// and pops a praise badge with today's tally. Answering Done several times in a row without
// waiting builds a streak: more pieces and a slightly higher chime each time.
// Transform and opacity only; every path is physics-sampled once into keyframes.

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

// ── Particles ─────────────────────────────────────────────────────────────────────────────

// Width : height of each shape; `size` is the height in px. Sizes are real pixels (never
// scaled above 1), so large pieces stay sharp.
const ASPECT = { dot: 1, ember: 1, glitter: 1, strip: 0.42, spark: 1, star: 1, heart: 1.12, bubble: 1, petal: 0.72, streak: 0.18 };

function fly(spec) {
  const {
    shape,
    color,
    x,
    y,
    angle = -90,
    speed = 0,
    gravity = 0,
    drag = 0,
    wind = 0,
    life = 1200,
    delay = 0,
    size = 10,
    spin = 0,
    tumble = 0,
    sway = 0,
    swayRate = 3,
    twinkle = 0,
    grow = 0.12,
    fadeFrom = 0.6,
    pop = false,
    align = false,
  } = spec;
  const w = size * (ASPECT[shape] ?? 1);
  const el = add(`bit ${shape}`, { width: `${w}px`, height: `${size}px`, marginLeft: `${-w / 2}px`, marginTop: `${-size / 2}px` });
  el.style.setProperty('--bit', color);

  const steps = Math.max(16, Math.round(life / 33));
  const dt = life / 1000 / steps;
  const rad = (angle * Math.PI) / 180;
  let vx = Math.cos(rad) * speed;
  let vy = Math.sin(rad) * speed;
  let px = 0;
  let py = 0;
  const phase = rand(0, Math.PI * 2);
  const frames = [];
  for (let i = 0; i <= steps; i++) {
    const t = i * dt;
    const k = i / steps;
    let s = k < grow ? 0.25 + (0.75 * k) / grow : 1;
    let o = k < fadeFrom ? 1 : 1 - (k - fadeFrom) / (1 - fadeFrom);
    if (twinkle) o *= 0.55 + 0.45 * Math.sin(t * twinkle + phase);
    // Bubbles swell and vanish in the last few frames instead of fading.
    if (pop && k > 0.9) {
      s *= 1 + (k - 0.9) * 3;
      o = Math.max(0, 1 - (k - 0.9) / 0.1);
    }
    // Turning over, but never thinner than a quarter, so a piece doesn't vanish edge-on.
    const turn = tumble ? Math.cos(t * tumble + phase) : 1;
    const flipX = Math.sign(turn || 1) * Math.max(0.25, Math.abs(turn));
    const dx = sway ? Math.sin(t * swayRate + phase) * sway : 0;
    const rot = align ? (Math.atan2(vy, vx) * 180) / Math.PI + 90 : spin * t;
    frames.push({
      transform: `translate(${x + px + dx}px, ${y + py}px) rotate(${rot}deg) scale(${s * flipX}, ${s})`,
      opacity: Math.max(0, Math.min(1, o)),
    });
    vx += wind * dt - vx * drag * dt;
    vy += gravity * dt - vy * drag * dt;
    px += vx * dt;
    py += vy * dt;
  }
  return settle(el.animate(frames, { duration: life, delay, easing: 'linear', fill: 'both' })).then(() => el.remove());
}

// A rocket: a bright streak rising on an ease-out path to where it bursts.
function rocket(from, to, delay, duration) {
  const el = add('bit streak rocket', { width: '4px', height: '26px', marginLeft: '-2px', marginTop: '-13px' });
  const tilt = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI + 90;
  const frames = [
    { transform: `translate(${from.x}px, ${from.y}px) rotate(${tilt}deg)`, opacity: 0 },
    { transform: `translate(${from.x}px, ${from.y}px) rotate(${tilt}deg)`, opacity: 1, offset: 0.05 },
    { transform: `translate(${to.x}px, ${to.y}px) rotate(${tilt}deg) scale(0.6)`, opacity: 1, offset: 0.97 },
    { transform: `translate(${to.x}px, ${to.y}px) rotate(${tilt}deg) scale(0.2)`, opacity: 0 },
  ];
  return settle(el.animate(frames, { duration, delay, easing: 'cubic-bezier(0.15, 0.6, 0.3, 1)', fill: 'both' })).then(() => el.remove());
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

// ── The six celebrations ──────────────────────────────────────────────────────────────────
// Each gets the screen size, the button and card rects and an intensity (1 and up with the
// streak), and returns its particles' promises. `chime` gets the synth.

const EFFECTS = {
  // Two cannons fire confetti up from the bottom corners; it flutters down over everything.
  confetti: {
    reaction: 'hop',
    run({ W, H, more }) {
      const out = [];
      for (const side of [-1, 1]) {
        const x = side < 0 ? -10 : W + 10;
        out.push(
          ...many(70 * more, () =>
            fly({
              shape: pick(['strip', 'strip', 'strip', 'dot', 'spark']),
              color: Math.random() < 0.3 ? 'var(--accent)' : tint(pick(HUES)),
              x,
              y: H + 10,
              // Tuned so pieces peak between about 45% and 85% of the screen height, then
              // flutter down at drag-limited speed.
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
          ),
        );
      }
      return out;
    },
    chime({ tone, noise, bell }) {
      noise(0, { dur: 0.14, filter: 'highpass', freq: 900, level: 0.9 });
      noise(0.05, { dur: 0.14, filter: 'highpass', freq: 1100, level: 0.8 });
      noise(0, { dur: 0.5, filter: 'lowpass', freq: 300, level: 0.6 });
      [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((f, i) => bell(f, 0.08 + i * 0.05, 1.1, i === 4 ? 0.7 : 0.9));
      tone(2093, 0.36, { dur: 0.8, level: 0.12 });
    },
  },

  // Rockets rise from the bottom of the screen and burst into big glowing shells.
  fireworks: {
    reaction: 'grow',
    run({ W, H, card, more }) {
      const out = [];
      const shells = Math.round(4 + more * 1.5);
      for (let n = 0; n < shells; n++) {
        const to = { x: W * ((n + 0.5) / shells) + rand(-40, 40), y: rand(H * 0.12, Math.max(H * 0.18, card.y + card.height * 0.4)) };
        const from = { x: to.x + rand(-60, 60), y: H + 20 };
        const launch = n * 190 + rand(0, 60);
        const climb = 620;
        const burst = launch + climb;
        out.push(rocket(from, to, launch, climb));
        const hue = pick(HUES);
        const hue2 = pick(HUES);
        const sparks = Math.round(38 * Math.min(1.5, more));
        for (let i = 0; i < sparks; i++) {
          const a = (360 / sparks) * i + rand(-4, 4);
          out.push(
            fly({
              shape: i % 2 ? 'streak' : 'ember',
              align: i % 2 === 1,
              color: i % 5 === 0 ? 'var(--accent)' : tint(i % 3 ? hue : hue2),
              x: to.x,
              y: to.y,
              angle: a,
              speed: rand(380, 560),
              gravity: 340,
              drag: 2.4,
              life: rand(1200, 1600),
              delay: burst,
              size: i % 2 ? rand(16, 26) : rand(7, 11),
              grow: 0.03,
              fadeFrom: 0.45,
            }),
          );
        }
        // Glitter that hangs in the air and crackles after the shell.
        out.push(
          ...many(12, () =>
            fly({
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
          ),
        );
      }
      return out;
    },
    chime({ tone, noise, bell }) {
      for (let n = 0; n < 5; n++) {
        const launch = n * 0.19;
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
      const n = 40 * more;
      return many(n, (i) =>
        fly({
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
    run({ W, H, card, more }) {
      const shower = many(80 * more, (i) =>
        fly({
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
      // A few big sparkles flash right around the card.
      const flashes = many(10, () =>
        fly({
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
      return [...shower, ...flashes];
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
      const rising = many(55 * more, () =>
        fly({
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
      const fromCard = many(16, () =>
        fly({
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
      return [...rising, ...fromCard];
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
    run({ W, H, more }) {
      return many(110 * more, () =>
        fly({
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
    const W = window.innerWidth;
    const H = window.innerHeight;
    parts.push(flash(btn), shockwave(box, 36, { delay: 60, grow: 70, width: 4, duration: 800 }), ...effect.run({ W, H, btn, card: box, more }));
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
