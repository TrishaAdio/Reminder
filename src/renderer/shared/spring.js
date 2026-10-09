// Damped-spring solver. Each spring is integrated once, sampled every ~8ms and emitted as a
// CSS linear() easing, which both WAAPI and CSS transitions accept. See docs/DESIGN.md.

export const SPRINGS = {
  enter: { stiffness: 260, damping: 24 },
  exit: { stiffness: 700, damping: 52 },
  press: { stiffness: 3000, damping: 110 },
  release: { stiffness: 520, damping: 26 },
  layout: { stiffness: 320, damping: 30 },
  toggle: { stiffness: 600, damping: 34 },
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
  for (const name of ['press', 'release', 'toggle', 'layout', 'enter', 'exit']) {
    const { duration, easing } = spring(name);
    root.style.setProperty(`--${name}-duration`, `${duration}ms`);
    root.style.setProperty(`--${name}-easing`, easing);
  }
}

// Brief visual press for keyboard activation, which does not trigger :active.
export function pulse(el) {
  el.classList.add('is-pressed');
  setTimeout(() => el.classList.remove('is-pressed'), 90);
}
