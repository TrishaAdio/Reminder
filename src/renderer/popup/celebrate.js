// The reward for answering Done. Six celebrations, each with its own particles, sound and
// picture reaction, dealt from a shuffled bag so all six come up before any repeats.
// Every one also ripples the button and floats a "N today" tally. Transform and opacity only.

const HUES = [278, 240, 155, 52, 12, 82];
const STORE = 'remindani.celebrate';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const tint = (hue) => `oklch(var(--bit-l) var(--bit-c) ${hue})`;

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
    // Private storage can be unavailable; the bag simply starts over.
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

// ── Particles ─────────────────────────────────────────────────────────────────────────────
// Each throw is integrated once (gravity, drag, sway) and sampled into keyframes, so arcs
// are physical rather than eased.

function fly(spec) {
  const {
    shape,
    color,
    x,
    y,
    angle,
    speed,
    gravity = 0,
    drag = 0,
    life = 1000,
    delay = 0,
    size = 1,
    spin = 0,
    tumble = 0,
    sway = 0,
    swayRate = 3,
    grow = 0.15,
    fadeFrom = 0.55,
    pop = false,
  } = spec;
  const el = document.createElement('span');
  el.className = `bit ${shape}`;
  el.style.setProperty('--bit', color);
  stage().append(el);

  const steps = Math.max(12, Math.round(life / 40));
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
    let s = size * (k < grow ? 0.3 + (0.7 * k) / grow : 1);
    let o = k < fadeFrom ? 1 : 1 - (k - fadeFrom) / (1 - fadeFrom);
    // Bubbles swell and vanish in the last few frames instead of fading.
    if (pop && k > 0.86) {
      s *= 1 + (k - 0.86) * 4;
      o = Math.max(0, 1 - (k - 0.86) / 0.14);
    }
    // Turning over, but never thinner than a quarter, so a piece doesn't vanish edge-on.
    const turn = tumble ? Math.cos(t * tumble + phase) : 1;
    const flipX = Math.sign(turn || 1) * Math.max(0.25, Math.abs(turn));
    const dx = sway ? Math.sin(t * swayRate + phase) * sway : 0;
    frames.push({
      transform: `translate(${x + px + dx}px, ${y + py}px) rotate(${spin * t}deg) scale(${s * flipX}, ${s})`,
      opacity: Math.max(0, o),
    });
    vx -= vx * drag * dt;
    vy += gravity * dt - vy * drag * dt;
    px += vx * dt;
    py += vy * dt;
  }
  const anim = el.animate(frames, { duration: life, delay, easing: 'linear', fill: 'both' });
  return anim.finished.catch(() => {}).then(() => el.remove());
}

function throwAll(specs) {
  return Promise.all(specs.map(fly));
}

const center = (r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

// ── Sound ─────────────────────────────────────────────────────────────────────────────────

let audio = null;
function sound(volume, play) {
  if (!(volume > 0)) return;
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') audio.resume();
    const out = audio.createGain();
    out.gain.value = 0.2 * volume;
    out.connect(audio.destination);
    play((freq, at, { dur = 0.5, type = 'sine', level = 1, glide = null, attack = 0.008 } = {}) => {
      const t = audio.currentTime + 0.01 + at;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (glide) osc.frequency.exponentialRampToValueAtTime(glide, t + dur * 0.6);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(level, t + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(out);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    });
  } catch {
    // Sound is a bonus; Done works without it.
  }
}

// A note plus a quiet octave shimmer, the shape most of the chimes are built from.
const bell = (tone, freq, at, dur = 0.6, level = 1) => {
  tone(freq, at, { dur, level });
  tone(freq * 2, at, { dur: dur * 0.6, level: level * 0.12, type: 'triangle' });
};

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
  return { frames, duration: 430 * count };
}

const REACTIONS = {
  hop: () => hop(30),
  bounce: () => hop(20, 2),
  wiggle: () => ({
    frames: [0, -7, 6, -4, 3, 0].map((deg, i, a) => ({ offset: i / (a.length - 1), transform: `rotate(${deg}deg)` })),
    duration: 560,
  }),
  grow: () => ({
    frames: [
      { transform: 'none' },
      { transform: 'scale(1.09) translateY(-6px)', offset: 0.35 },
      { transform: 'scale(0.98)', offset: 0.7 },
      { transform: 'none' },
    ],
    duration: 520,
  }),
  sway: () => ({
    frames: [0, 5, -5, 3, 0].map((deg, i, a) => ({ offset: i / (a.length - 1), transform: `translateX(${deg * 1.4}px) rotate(${deg}deg)` })),
    duration: 700,
  }),
  spinHop: () => ({
    frames: [
      { transform: 'none' },
      { transform: 'translateY(-24px) rotate(-8deg)', offset: 0.4 },
      { transform: 'translateY(-10px) rotate(6deg)', offset: 0.7 },
      { transform: 'none' },
    ],
    duration: 560,
  }),
};

// ── The six celebrations ──────────────────────────────────────────────────────────────────

const EFFECTS = {
  // Paper confetti pops up out of the button and tumbles down.
  confetti: {
    reaction: 'hop',
    particles(btn) {
      const c = center(btn);
      return Array.from({ length: 30 }, () => ({
        shape: pick(['strip', 'strip', 'dot', 'spark']),
        color: Math.random() < 0.35 ? 'var(--accent)' : tint(pick(HUES)),
        x: c.x + rand(-0.35, 0.35) * btn.width,
        y: c.y,
        angle: rand(-155, -25),
        speed: rand(450, 800),
        gravity: 1500,
        drag: 2.4,
        life: 1000,
        delay: rand(0, 60),
        spin: rand(-900, 900),
        tumble: rand(6, 14),
      }));
    },
    chime(tone) {
      [659.25, 830.61, 987.77, 1318.51].forEach((f, i) => bell(tone, f, i * 0.06, 0.55 + i * 0.08, i === 3 ? 0.5 : 1));
    },
  },

  // Three little fireworks burst above the card, one after another.
  fireworks: {
    reaction: 'grow',
    particles(btn, card) {
      const specs = [];
      [0.22, 0.55, 0.85].forEach((fx, n) => {
        const x = card.x + card.width * fx + rand(-20, 20);
        const y = card.y + rand(-40, 30);
        const hue = pick(HUES);
        const count = 16;
        for (let i = 0; i < count; i++) {
          specs.push({
            shape: i % 3 ? 'spark' : 'dot',
            color: i % 4 === 0 ? 'var(--accent)' : tint(hue),
            x,
            y,
            angle: (360 / count) * i + rand(-8, 8),
            speed: rand(260, 360),
            gravity: 260,
            drag: 3.2,
            life: 900,
            delay: n * 170,
            size: rand(0.8, 1.2),
            spin: rand(-200, 200),
            grow: 0.08,
            fadeFrom: 0.35,
          });
        }
      });
      return specs;
    },
    chime(tone) {
      [0, 0.17, 0.34].forEach((at, n) => {
        tone(180, at, { dur: 0.12, type: 'triangle', glide: 70, level: 0.5 });
        bell(tone, [1046.5, 1318.51, 1567.98][n], at + 0.02, 0.5, 0.55);
      });
    },
  },

  // Hearts float up from the button, swaying as they rise.
  hearts: {
    reaction: 'wiggle',
    particles(btn) {
      const c = center(btn);
      return Array.from({ length: 14 }, (_, i) => ({
        shape: 'heart',
        color: i % 3 === 0 ? 'var(--accent)' : tint(pick([12, 12, 350, 278])),
        x: c.x + rand(-0.4, 0.4) * btn.width,
        y: c.y + rand(-10, 10),
        angle: rand(-105, -75),
        speed: rand(160, 300),
        gravity: -160,
        drag: 0.6,
        life: 1300,
        delay: i * 40,
        size: rand(0.8, 1.5),
        sway: rand(10, 22),
        swayRate: rand(4, 7),
        grow: 0.2,
        fadeFrom: 0.5,
      }));
    },
    chime(tone) {
      bell(tone, 659.25, 0, 0.5);
      bell(tone, 880, 0.14, 0.9);
      tone(1318.51, 0.14, { dur: 0.7, level: 0.12 });
    },
  },

  // Gold stars rain down over the card and twinkle out.
  stars: {
    reaction: 'bounce',
    particles(btn, card) {
      return Array.from({ length: 22 }, (_, i) => ({
        shape: 'star',
        color: i % 2 ? 'var(--accent)' : tint(pick([82, 52, 240])),
        x: card.x + rand(0.02, 0.98) * card.width,
        y: card.y - rand(10, 90),
        angle: rand(80, 100),
        speed: rand(60, 200),
        gravity: 700,
        drag: 1.6,
        life: 1100,
        delay: rand(0, 260),
        size: rand(0.7, 1.4),
        spin: rand(-260, 260),
        fadeFrom: 0.6,
      }));
    },
    chime(tone) {
      [2093, 1760, 1567.98, 1318.51, 1046.5].forEach((f, i) => bell(tone, f, i * 0.07, 0.45, 0.7));
    },
  },

  // Bubbles rise out of the card and pop one by one.
  bubbles: {
    reaction: 'sway',
    particles(btn, card) {
      return Array.from({ length: 16 }, (_, i) => ({
        shape: 'bubble',
        color: tint(pick([240, 240, 200, 155])),
        x: card.x + rand(0.08, 0.92) * card.width,
        y: card.y + card.height * rand(0.2, 0.8),
        angle: -90,
        speed: rand(140, 280),
        gravity: -120,
        drag: 0.8,
        life: rand(800, 1250),
        delay: i * 35,
        size: rand(0.7, 1.6),
        sway: rand(6, 14),
        swayRate: rand(5, 9),
        grow: 0.25,
        fadeFrom: 0.9,
        pop: true,
      }));
    },
    chime(tone) {
      [0, 0.09, 0.2, 0.28, 0.4].forEach((at, i) => {
        const f = [520, 700, 600, 860, 1040][i];
        tone(f, at, { dur: 0.14, glide: f * 1.9, level: 0.7 });
      });
    },
  },

  // Blossom petals drift in from both sides and float across the card.
  petals: {
    reaction: 'spinHop',
    particles(btn, card) {
      return Array.from({ length: 20 }, (_, i) => {
        const left = i % 2 === 0;
        return {
          shape: 'petal',
          color: tint(pick([350, 12, 12, 330])),
          x: left ? card.x - rand(0, 30) : card.x + card.width + rand(0, 30),
          y: card.y + rand(-80, card.height * 0.5),
          angle: left ? rand(-35, 5) : rand(175, 215),
          speed: rand(220, 380),
          gravity: 160,
          drag: 0.9,
          life: 1300,
          delay: i * 30,
          size: rand(0.8, 1.4),
          spin: rand(-320, 320),
          tumble: rand(4, 8),
          sway: rand(6, 14),
          grow: 0.1,
          fadeFrom: 0.6,
        };
      });
    },
    chime(tone) {
      [587.33, 659.25, 783.99, 880, 1174.66].forEach((f, i) => {
        tone(f, i * 0.05, { dur: 0.7, type: 'triangle', level: 0.6, attack: 0.004 });
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

// How many Done answers today, shown as a small tally that floats up from the button.
function countToday(data, counts) {
  const today = new Date().toDateString();
  if (data.day !== today) Object.assign(data, { day: today, done: 0 });
  if (counts) data.done += 1;
  return data.done;
}

function ripple(btn, calm) {
  const el = document.createElement('span');
  el.className = 'done-ring';
  Object.assign(el.style, { left: `${btn.x}px`, top: `${btn.y}px`, width: `${btn.width}px`, height: `${btn.height}px` });
  stage().append(el);
  const frames = calm
    ? [{ opacity: 0.7 }, { opacity: 0 }]
    : [
        { opacity: 0.9, transform: 'scale(1)' },
        { opacity: 0, transform: `scale(${1 + 30 / btn.width}, ${1 + 30 / btn.height})` },
      ];
  return el
    .animate(frames, { duration: calm ? 300 : 560, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)', fill: 'both' })
    .finished.catch(() => {})
    .then(() => el.remove());
}

function tally(btn, count, check, calm) {
  if (!count) return Promise.resolve();
  const el = document.createElement('span');
  el.className = 'tally t-small';
  el.innerHTML = check;
  el.append(count === 1 ? 'First one today' : `${count} done today`);
  stage().append(el);
  const x = btn.x + btn.width / 2;
  const y = btn.y - 14;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  const frames = calm
    ? [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }]
    : [
        { opacity: 0, transform: 'translate(-50%, 10px) scale(0.7)' },
        { opacity: 1, transform: 'translate(-50%, -12px) scale(1.06)', offset: 0.22 },
        { opacity: 1, transform: 'translate(-50%, -16px) scale(1)', offset: 0.4 },
        { opacity: 1, transform: 'translate(-50%, -22px) scale(1)', offset: 0.78 },
        { opacity: 0, transform: 'translate(-50%, -30px) scale(0.96)' },
      ];
  return el
    .animate(frames, { duration: 1150, easing: 'linear', fill: 'both' })
    .finished.catch(() => {})
    .then(() => el.remove());
}

// Plays one celebration. Resolves when the picture reaction is over (so the card can leave)
// and exposes `landed`, which resolves once every particle is gone (so the window can hide).
export function celebrate({ button, card, buddy, calm, volume, counts, check }) {
  const data = load();
  const name = nextEffect(data);
  const count = countToday(data, counts);
  save(data);
  const effect = EFFECTS[name];
  const btn = button.getBoundingClientRect();
  const box = card.getBoundingClientRect();

  sound(volume, effect.chime);
  const parts = [ripple(btn, calm), tally(btn, counts ? count : 0, check, calm)];
  if (!calm) parts.push(throwAll(effect.particles(btn, box)));

  let reacted = Promise.resolve();
  if (!calm && buddy && !buddy.hidden) {
    const { frames, duration } = REACTIONS[effect.reaction]();
    reacted = buddy.animate(frames, { duration, easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)' }).finished.catch(() => {});
  }
  return { name, reacted, landed: Promise.all([...parts, reacted]) };
}
