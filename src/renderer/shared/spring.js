// Damped-spring solver. Each spring is integrated once, sampled every ~8ms and emitted as a
// CSS linear() easing, which both WAAPI and CSS transitions accept. See docs/DESIGN.md.

export const SPRINGS = {
  enter: { stiffness: 260, damping: 24 },
  exit: { stiffness: 700, damping: 52 },
  press: { stiffness: 3000, damping: 110 },
  release: { stiffness: 520, damping: 26 },
  layout: { stiffness: 320, damping: 30 },
  toggle: { stiffness: 600, damping: 34 },
  // Critically damped, no overshoot: for opacity, blur and colour, which must never pass 1.
  smooth: { stiffness: 340, damping: 37 },
};

// 240 points a second, so springs stay smooth on high-refresh displays (up to 240Hz).
const SAMPLE = 1 / 240;
const STEP = 1 / 2000;
const PRECISION = 0.001;
const cache = new Map();

export function spring(name) {
  if (cache.has(name)) return cache.get(name);
  const { stiffness, damping, mass = 1 } = SPRINGS[name];
  let x = 0;
  let v = 0;
  let t = 0;
  let settled = 0;
  let nextSample = SAMPLE;
  const samples = [0];
  while (t < 2) {
    v += ((-stiffness * (x - 1) - damping * v) / mass) * STEP;
    x += v * STEP;
    t += STEP;
    if (Math.abs(x - 1) > PRECISION) settled = t;
    if (t >= nextSample) {
      samples.push(x);
      nextSample += SAMPLE;
    }
  }
  const points = samples.slice(0, Math.ceil(settled / SAMPLE) + 1);
  points[points.length - 1] = 1;
  const result = {
    duration: Math.round(settled * 1000),
    easing: `linear(${points.map((p) => Number(p.toFixed(4))).join(', ')})`,
  };
  cache.set(name, result);
  return result;
}

const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
export const reducedMotion = () => reducedQuery.matches;

// Cross-fades for reduced motion still settle on a critically damped curve, never a stock ease.
export const FADE = { duration: 150, easing: spring('exit').easing };

const running = new WeakMap();

function freeze(anim) {
  try {
    anim.commitStyles();
  } catch {
    // Elements that are not rendered cannot commit; cancelling alone is fine for them.
  }
  anim.cancel();
}

export function stop(el) {
  const anim = running.get(el);
  if (anim) {
    anim.cancel();
    running.delete(el);
  }
}

// Interruptible: a running animation is frozen where it is and the new one starts from there.
export function animate(el, keyframes, name, { delay = 0 } = {}) {
  const prev = running.get(el);
  if (prev) freeze(prev);
  const timing = typeof name === 'string' ? spring(name) : name;
  const anim = el.animate(keyframes, { ...timing, delay, fill: 'both' });
  running.set(el, anim);
  anim.finished
    .then(() => {
      if (running.get(el) !== anim) return;
      freeze(anim);
      running.delete(el);
    })
    .catch(() => {});
  return anim.finished.catch(() => {});
}

export function installSpringProperties(root = document.documentElement) {
  for (const name of ['press', 'release', 'toggle', 'layout', 'enter', 'exit', 'smooth']) {
    const { duration, easing } = spring(name);
    root.style.setProperty(`--${name}-duration`, `${duration}ms`);
    root.style.setProperty(`--${name}-easing`, easing);
  }
}

// A spring that follows a target and keeps its velocity when the target moves mid-flight, the
// way iOS thumbs and gestures feel: click three tabs quickly and the thumb carries its
// momentum instead of restarting from rest. Integrated per frame from real frame time, in
// 1/480 s substeps, so it is the same at 60, 144 or 240 Hz. Reduced motion jumps.
export function follower({ stiffness = 380, damping = 34, precision = 0.001, onFrame }) {
  let x = null;
  let v = 0;
  let target = 0;
  let raf = 0;
  let last = 0;
  const tick = (t) => {
    raf = 0;
    let dt = Math.min(0.05, Math.max(0, (t - last) / 1000));
    last = t;
    while (dt > 0) {
      const h = Math.min(1 / 480, dt);
      v += (-stiffness * (x - target) - damping * v) * h;
      x += v * h;
      dt -= h;
    }
    const done = Math.abs(x - target) < precision && Math.abs(v) < precision * 20;
    if (done) {
      x = target;
      v = 0;
    }
    onFrame(x, v, done);
    if (!done) raf = requestAnimationFrame(tick);
  };
  return {
    set(next, animated = true) {
      target = next;
      if (x == null || !animated || reducedMotion()) {
        cancelAnimationFrame(raf);
        raf = 0;
        x = next;
        v = 0;
        onFrame(x, 0, true);
        return;
      }
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    },
  };
}

// A sliding thumb (tabs, segmented controls) that glides on a follower and stretches a little
// along its path while it moves, then settles round. Positions are in thumb widths.
export function glider(el) {
  return follower({
    stiffness: 420,
    damping: 36,
    precision: 0.002,
    onFrame: (x, v, done) => {
      const s = done ? 0 : Math.min(0.14, Math.abs(v) * 0.022);
      el.style.transform = s ? `translateX(${x * 100}%) scale(${1 + s}, ${1 - s * 0.4})` : `translateX(${x * 100}%)`;
      el.style.willChange = done ? '' : 'transform';
    },
  });
}

// Frosted surfaces. A parent with opacity below 1 switches their blur off (Chromium makes the
// parent the backdrop root), so a page that fades as a whole shows its glass un-frosted and
// then pops frosted at the end. Fades go to these surfaces and their siblings instead; parents
// only move (transform doesn't affect the blur).
export const FROSTED = '.card, .preset, .popover, .credit-pill, .setup-look, .setup-chip, .setup-input, .setup-preview-box, .live-bubble, .toast';

// The pieces of `root` that can fade without un-frosting anything: frosted surfaces, and
// everything else that has no frosted surface inside.
export function fadeParts(root) {
  const out = [];
  for (const child of root.children) {
    if (child.hidden || child.classList.contains('leaving')) continue;
    if (!child.matches(FROSTED) && child.querySelector(FROSTED)) out.push(...fadeParts(child));
    else out.push(child);
  }
  return out;
}

// Brief visual press for keyboard activation, which does not trigger :active.
export function pulse(el) {
  el.classList.add('is-pressed');
  setTimeout(() => el.classList.remove('is-pressed'), 90);
}
