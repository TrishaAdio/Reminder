// Canvas particle engine for the Done celebrations.
//
// One full-window canvas, redrawn on every display refresh (requestAnimationFrame follows the
// monitor, so a 180Hz screen gets 180 frames a second). Physics is integrated from the real
// time between frames in small fixed substeps, so motion is identical at any refresh rate and
// never steps between precomputed points. Every shape is drawn once into a cached sprite and
// then only stamped with a transform, so a frame with a few hundred pieces stays cheap.

const ASPECT = {
  dot: 1, ember: 1, glitter: 1, strip: 0.42, spark: 1, star: 1, heart: 1.12, bubble: 1,
  petal: 0.72, streak: 0.18, rocket: 0.16, butterfly: 1.3, paw: 0.92, balloon: 0.8, cloud: 1.7,
};
// Extra room around a sprite for its glow, as a share of its height.
const GLOW = { ember: 0.9, glitter: 1.1, rocket: 0.7 };
const STEP = 1 / 480;

let canvas = null;
let ctx = null;
let dpr = 1;
let W = 0;
let H = 0;
let actors = [];
let raf = 0;
let last = 0;
let waiting = [];
const sprites = new Map();
const colors = new Map();
let probe = null;

// ── Colours: CSS strings (with var()) resolved once to something canvas understands ──────

export function color(css) {
  let c = colors.get(css);
  if (c) return c;
  probe.style.color = '';
  probe.style.color = css;
  c = getComputedStyle(probe).color || '#fff';
  colors.set(css, c);
  return c;
}

// The same colour, see-through. Computed colours come back as rgb(r, g, b) or oklch(l c h).
export function withAlpha(c, a) {
  const rgb = /^rgba?\(([^,]+),([^,]+),([^,)]+)/.exec(c);
  if (rgb) return `rgba(${rgb[1]},${rgb[2]},${rgb[3]},${a})`;
  return c.replace(/\s*\/\s*[\d.]+\s*\)$|\)$/, ` / ${a})`);
}

// ── Sprites ──────────────────────────────────────────────────────────────────────────────

function path(g, shape, w, h, fill) {
  g.fillStyle = fill;
  g.beginPath();
  switch (shape) {
    case 'dot':
    case 'glitter':
      g.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      break;
    case 'strip':
      g.roundRect(0, 0, w, h, Math.min(w, h) * 0.3);
      break;
    case 'spark': {
      const p = [[0.5, 0], [0.61, 0.39], [1, 0.5], [0.61, 0.61], [0.5, 1], [0.39, 0.61], [0, 0.5], [0.39, 0.39]];
      p.forEach(([x, y], i) => (i ? g.lineTo(x * w, y * h) : g.moveTo(x * w, y * h)));
      break;
    }
    case 'star': {
      const p = [[0.5, 0], [0.61, 0.35], [0.98, 0.35], [0.68, 0.57], [0.79, 0.91], [0.5, 0.7], [0.21, 0.91], [0.32, 0.57], [0.02, 0.35], [0.39, 0.35]];
      p.forEach(([x, y], i) => (i ? g.lineTo(x * w, y * h) : g.moveTo(x * w, y * h)));
      break;
    }
    case 'heart': {
      g.save();
      g.scale(w / 18, h / 16);
      g.fill(new Path2D('M9 15.5S.5 10 .5 4.8C.5 2.2 2.6.5 4.9.5 6.7.5 8.2 1.6 9 3.1 9.8 1.6 11.3.5 13.1.5c2.3 0 4.4 1.7 4.4 4.3C17.5 10 9 15.5 9 15.5z'));
      g.restore();
      return;
    }
    case 'petal':
      g.moveTo(0, 0);
      g.quadraticCurveTo(w * 1.05, -h * 0.05, w, h);
      g.quadraticCurveTo(-w * 0.05, h * 1.05, 0, 0);
      break;
    default:
      g.rect(0, 0, w, h);
  }
  g.fill();
}

function drawSprite(g, shape, fill, w, h) {
  if (shape === 'ember') {
    g.shadowColor = fill;
    g.shadowBlur = h * 0.8;
    const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    r.addColorStop(0, '#fff');
    r.addColorStop(0.35, '#fff');
    r.addColorStop(0.7, fill);
    r.addColorStop(1, fill);
    path(g, 'dot', w, h, r);
  } else if (shape === 'glitter') {
    g.shadowColor = fill;
    g.shadowBlur = h * 1.1;
    path(g, 'dot', w, h, '#fff');
  } else if (shape === 'streak' || shape === 'rocket') {
    const lg = g.createLinearGradient(0, h, 0, 0);
    lg.addColorStop(0, shape === 'rocket' ? 'rgba(255,255,255,0)' : fill);
    lg.addColorStop(shape === 'rocket' ? 0.7 : 0.15, fill);
    lg.addColorStop(1, shape === 'rocket' ? '#fff' : 'rgba(255,255,255,0)');
    if (shape === 'rocket') {
      g.shadowColor = fill;
      g.shadowBlur = h * 0.35;
    }
    g.fillStyle = lg;
    g.beginPath();
    g.roundRect(0, 0, w, h, w / 2);
    g.fill();
  } else if (shape === 'bubble') {
    const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    r.addColorStop(0.52, 'rgba(255,255,255,0)');
    r.addColorStop(0.8, withAlpha(fill, 0.5));
    r.addColorStop(0.97, fill);
    r.addColorStop(1, 'rgba(255,255,255,0)');
    path(g, 'dot', w, h, r);
    g.globalAlpha = 0.9;
    g.fillStyle = '#fff';
    g.beginPath();
    g.ellipse(w * 0.32, h * 0.28, w * 0.09, h * 0.07, -0.6, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 0.4;
    g.beginPath();
    g.arc(w * 0.68, h * 0.74, w * 0.04, 0, Math.PI * 2);
    g.fill();
  } else if (shape === 'petal') {
    const lg = g.createLinearGradient(0, 0, w, h);
    lg.addColorStop(0, '#fff');
    lg.addColorStop(0.45, fill);
    lg.addColorStop(1, fill);
    path(g, 'petal', w, h, lg);
  } else if (shape === 'butterfly') {
    // Two wing pairs around a slim body; the engine flaps it by squashing X.
    const cx = w / 2;
    const wing = (dir, top) => {
      g.beginPath();
      if (top) g.ellipse(cx + dir * w * 0.24, h * 0.36, w * 0.25, h * 0.3, dir * 0.5, 0, Math.PI * 2);
      else g.ellipse(cx + dir * w * 0.18, h * 0.68, w * 0.17, h * 0.2, -dir * 0.4, 0, Math.PI * 2);
      g.fill();
    };
    // Wings shade from a light centre to the full colour, edged a little darker.
    const shade = g.createRadialGradient(cx, h * 0.45, 0, cx, h * 0.45, w * 0.55);
    shade.addColorStop(0, '#fff');
    shade.addColorStop(0.35, fill);
    shade.addColorStop(1, fill);
    g.fillStyle = shade;
    g.strokeStyle = 'rgba(40,20,40,0.35)';
    g.lineWidth = Math.max(1, w * 0.03);
    for (const d of [-1, 1]) {
      wing(d, false);
      g.stroke();
      wing(d, true);
      g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (const d of [-1, 1]) {
      g.beginPath();
      g.arc(cx + d * w * 0.26, h * 0.33, w * 0.07, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(40,30,40,0.85)';
    g.beginPath();
    g.roundRect(cx - w * 0.035, h * 0.18, w * 0.07, h * 0.66, w * 0.035);
    g.fill();
  } else if (shape === 'paw') {
    g.fillStyle = fill;
    g.beginPath();
    g.ellipse(w * 0.5, h * 0.7, w * 0.3, h * 0.24, 0, 0, Math.PI * 2);
    g.fill();
    for (const [x, y, rx, ry, a] of [[0.14, 0.4, 0.12, 0.15, -0.3], [0.37, 0.16, 0.12, 0.15, -0.1], [0.63, 0.16, 0.12, 0.15, 0.1], [0.86, 0.4, 0.12, 0.15, 0.3]]) {
      g.beginPath();
      g.ellipse(w * x, h * y, w * rx, h * ry, a, 0, Math.PI * 2);
      g.fill();
    }
  } else if (shape === 'balloon') {
    const bh = h * 0.9;
    const r = g.createRadialGradient(w * 0.35, bh * 0.3, w * 0.05, w * 0.5, bh * 0.5, w * 0.62);
    r.addColorStop(0, 'rgba(255,255,255,0.85)');
    r.addColorStop(0.25, fill);
    r.addColorStop(1, fill);
    g.fillStyle = r;
    g.beginPath();
    g.ellipse(w / 2, bh / 2, w / 2, bh / 2, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(w * 0.44, h);
    g.lineTo(w * 0.56, h);
    g.lineTo(w * 0.5, bh * 0.97);
    g.fill();
  } else if (shape === 'cloud') {
    g.fillStyle = fill;
    for (const [x, y, rad] of [[0.25, 0.62, 0.22], [0.45, 0.42, 0.3], [0.7, 0.5, 0.26], [0.85, 0.68, 0.16], [0.5, 0.7, 0.26]]) {
      g.beginPath();
      g.arc(w * x, h * y, h * rad * 1.25, 0, Math.PI * 2);
      g.fill();
    }
  } else {
    path(g, shape, w, h, fill);
  }
}

// Sprites come in power-of-two heights (in device pixels) and are only ever drawn smaller.
function sprite(shape, fill, cssHeight) {
  const S = Math.min(256, Math.max(8, 2 ** Math.ceil(Math.log2(cssHeight * dpr))));
  const key = `${shape}|${fill}|${S}`;
  let s = sprites.get(key);
  if (s) return s;
  const w = Math.max(2, Math.round(S * (ASPECT[shape] ?? 1)));
  const pad = Math.ceil(S * (GLOW[shape] ?? 0)) + 2;
  const c = document.createElement('canvas');
  c.width = w + pad * 2;
  c.height = S + pad * 2;
  const g = c.getContext('2d');
  g.translate(pad, pad);
  drawSprite(g, shape, fill, w, S);
  s = { canvas: c, w, h: S, pad };
  sprites.set(key, s);
  return s;
}

// ── Engine ───────────────────────────────────────────────────────────────────────────────

function ensure(stage) {
  if (!canvas || !canvas.isConnected) {
    canvas = document.createElement('canvas');
    canvas.className = 'burst-canvas';
    probe = document.createElement('span');
    probe.className = 'burst-probe';
    stage.prepend(canvas, probe);
    ctx = canvas.getContext('2d');
  }
  const nextDpr = window.devicePixelRatio || 1;
  if (innerWidth !== W || innerHeight !== H || nextDpr !== dpr) {
    W = innerWidth;
    H = innerHeight;
    if (nextDpr !== dpr) sprites.clear();
    dpr = nextDpr;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
}

// Starts a celebration on `stage`. Colours are resolved fresh each time, since the theme
// (and with it --accent and the tint lightness) can change between cards.
export function begin(stage) {
  ensure(stage);
  colors.clear();
  return { W, H };
}

// A physical piece. Same options the effects have always used:
//   x, y, angle (deg), speed (px/s), gravity, wind (px/s²), drag (1/s), life, delay (ms),
//   size (css px height), spin (deg/s), tumble/sway/swayRate/twinkle (rad/s), grow/fadeFrom (0–1),
//   pop (bubbles swell and vanish), align (point along the velocity), blur (stretch with speed),
//   flap (wing beats per second).
export function emit(spec) {
  const rad = ((spec.angle ?? -90) * Math.PI) / 180;
  const speed = spec.speed ?? 0;
  actors.push({
    kind: 'piece',
    spec,
    fill: color(spec.color),
    start: performance.now() + (spec.delay ?? 0),
    life: spec.life ?? 1200,
    x: spec.x,
    y: spec.y,
    vx: Math.cos(rad) * speed,
    vy: Math.sin(rad) * speed,
    t: 0,
    phase: Math.random() * Math.PI * 2,
  });
  run();
}

// Anything that draws itself: `render(ctx, t, k)` gets seconds since start and progress 0–1.
export function custom({ delay = 0, life, render }) {
  actors.push({ kind: 'custom', start: performance.now() + delay, life, render });
  run();
}

// Stamps a sprite: centre (x, y) in css px, rotation in radians, scale per axis, alpha.
export function stamp(shape, fill, size, x, y, rot = 0, sx = 1, sy = 1, alpha = 1) {
  if (alpha <= 0.002 || sx === 0 || sy === 0) return;
  const s = sprite(shape, fill, size);
  const f = size / s.h;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  ctx.setTransform(cos * sx * dpr, sin * sx * dpr, -sin * sy * dpr, cos * sy * dpr, x * dpr, y * dpr);
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(s.canvas, -(s.w / 2 + s.pad) * f, -(s.h / 2 + s.pad) * f, (s.w + s.pad * 2) * f, (s.h + s.pad * 2) * f);
}

function step(a, dt) {
  const s = a.spec;
  const drag = s.drag ?? 0;
  const gravity = s.gravity ?? 0;
  const wind = s.wind ?? 0;
  let left = dt;
  while (left > 1e-6) {
    const h = Math.min(STEP, left);
    a.vx += wind * h - a.vx * drag * h;
    a.vy += gravity * h - a.vy * drag * h;
    a.x += a.vx * h;
    a.y += a.vy * h;
    left -= h;
  }
  a.t += dt;
}

function drawPiece(a) {
  const s = a.spec;
  const k = Math.min(1, (a.t * 1000) / a.life);
  const grow = s.grow ?? 0.12;
  const fadeFrom = s.fadeFrom ?? 0.6;
  // Ease in the growth so pieces bloom instead of popping in.
  let scale = k < grow ? 0.25 + 0.75 * (1 - (1 - k / grow) ** 2) : 1;
  let o = k < fadeFrom ? 1 : 1 - (k - fadeFrom) / (1 - fadeFrom);
  o *= o < 1 ? 1 - (1 - o) * 0.15 : 1;
  if (s.twinkle) o *= 0.55 + 0.45 * Math.sin(a.t * s.twinkle + a.phase);
  if (s.pop && k > 0.9) {
    scale *= 1 + (k - 0.9) * 3;
    o = Math.max(0, 1 - (k - 0.9) / 0.1);
  }
  let sx = scale;
  let sy = scale;
  if (s.tumble) {
    const turn = Math.cos(a.t * s.tumble + a.phase);
    sx *= Math.sign(turn || 1) * Math.max(0.25, Math.abs(turn));
  }
  // Wing beats: open wide, close to a third, with the quick downstroke of a real beat.
  if (s.flap) sx *= 0.33 + 0.67 * Math.abs(Math.sin(a.t * s.flap * Math.PI + a.phase)) ** 0.7;
  const dx = s.sway ? Math.sin(a.t * (s.swayRate ?? 3) + a.phase) * s.sway : 0;
  const speed = Math.hypot(a.vx, a.vy);
  let rot;
  if (s.rot != null) rot = (s.rot * Math.PI) / 180;
  else if (s.align || s.blur) rot = Math.atan2(a.vy, a.vx) + Math.PI / 2;
  else if (s.tilt) rot = Math.max(-0.5, Math.min(0.5, a.vx / 600)) + Math.sin(a.t * 3 + a.phase) * 0.12;
  else rot = (((s.spin ?? 0) * a.t) * Math.PI) / 180;
  // Motion blur: fast pieces stretch along their path.
  if (s.blur) sy *= 1 + Math.min(2.2, speed / 260);
  stamp(s.shape, a.fill, s.size ?? 10, a.x + dx, a.y, rot, sx, sy, o);
}

let inFrame = false;

function frame(now) {
  raf = 0;
  inFrame = true;
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const alive = [];
  for (const a of actors) {
    if (now < a.start) {
      alive.push(a);
      continue;
    }
    if (a.kind === 'piece') {
      // A piece that starts mid-frame only moves for the part of the frame it existed.
      step(a, a.t === 0 ? Math.min(dt, (now - a.start) / 1000) : dt);
      if (a.t * 1000 >= a.life) continue;
      drawPiece(a);
    } else {
      const t = (now - a.start) / 1000;
      const k = Math.min(1, (t * 1000) / a.life);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = 1;
      a.render(ctx, t, k);
      if (k >= 1) continue;
    }
    alive.push(a);
  }
  actors = alive;
  inFrame = false;
  if (actors.length) raf = requestAnimationFrame(frame);
  else {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const done = waiting;
    waiting = [];
    done.forEach((resolve) => resolve());
  }
}

// Pieces added while a frame is being drawn ride along with it; the frame schedules the next.
function run() {
  if (raf || inFrame) return;
  last = performance.now();
  raf = requestAnimationFrame(frame);
}

// Resolves once everything has finished and the canvas is clear.
export function idle() {
  if (!actors.length) return Promise.resolve();
  return new Promise((resolve) => waiting.push(resolve));
}

export const viewport = () => ({ W, H, dpr, ctx });
