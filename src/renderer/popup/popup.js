import { animate, spring, reducedMotion, FADE, installSpringProperties, pulse } from '../shared/spring.js';
import { icon } from '../shared/icons.js';
import { measureFrames } from './frames.js';

installSpringProperties();

const api = window.popup;
const $ = (id) => document.getElementById(id);
const card = document.querySelector('.card');
const content = document.querySelector('.content');
const doneButton = document.querySelector('[data-action="done"]');
const doneLabel = doneButton.querySelector('.label');
const tick = doneButton.querySelector('.tick');
const tickCover = doneButton.querySelector('.tick-cover');
const TRAVEL = 48;

doneButton.querySelector('.tick-mark').insertAdjacentHTML('afterbegin', icon('check'));
$('close').innerHTML = icon('close');

let current = null;
let toward = { x: 0.7, y: 0.7 };
let busy = false;
const sound = createSound();
const calm = () => reducedMotion() || current?.solid;

function render(p) {
  current = p;
  document.documentElement.classList.toggle('solid', p.solid);
  $('badge').innerHTML = icon(p.icon);
  $('name').textContent = p.name;
  $('time').textContent = p.time;
  $('title').textContent = p.message;
  $('note').textContent = p.note;
  $('note').hidden = !p.note;
  $('close').setAttribute('aria-label', `Close and wait ${p.defaultWait} minutes`);
  setQueue(p.remaining);
}

function setQueue(count) {
  $('queue').hidden = !count;
  $('queue').textContent = count === 1 ? '1 more waiting' : `${count} more waiting`;
}

// The solid fallback window is exactly card-sized, so it has to follow height changes.
function queueChanged(count) {
  setQueue(count);
  if (current?.solid) api.ready(card.offsetHeight);
}

function buttonFor(action) {
  return document.querySelector(`[data-action="${action}"]`);
}

function enter() {
  if (calm()) return animate(card, [{ opacity: 0, transform: 'none' }, { opacity: 1, transform: 'none' }], FADE);
  if (current.perf) measureFrames(700).then(api.reportFrames);
  animate(content, [{ filter: 'blur(6px)' }, { filter: 'none' }], { duration: 160, easing: spring('exit').easing });
  return animate(
    card,
    [
      { opacity: 0, transform: 'translateY(-14px) scale(0.96)' },
      { opacity: 1, transform: 'none' },
    ],
    'enter',
  );
}

async function confirmDone() {
  tick.style.opacity = '1';
  if (calm()) {
    doneLabel.style.opacity = '0';
    tickCover.style.transform = 'translateX(101%)';
    return wait(260);
  }
  animate(doneLabel, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.9)' }], 'exit');
  await animate(tickCover, [{ transform: 'translateX(0)' }, { transform: 'translateX(101%)' }], 'exit');
  await wait(80);
}

function restoreDone() {
  if (tick.style.opacity !== '1') return;
  animate(tick, [{ opacity: 1 }, { opacity: 0 }], calm() ? FADE : 'exit').then(() => {
    tick.style.opacity = '';
    tick.getAnimations().forEach((a) => a.cancel());
    tickCover.style.transform = '';
  });
  animate(doneLabel, [{ opacity: 0, transform: 'scale(0.9)' }, { opacity: 1, transform: 'none' }], calm() ? FADE : 'enter');
}

function leave(action) {
  if (calm()) return animate(card, [{ opacity: 1 }, { opacity: 0 }], FADE);
  const to =
    action === 'done'
      ? 'scale(0.98)'
      : `translate(${toward.x * TRAVEL}px, ${toward.y * TRAVEL}px) scale(0.9)`;
  return animate(card, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: to }], 'exit');
}

// The card stays; only its content changes, nudged in the direction the last one went.
async function swap(next, action) {
  const away = action === 'done' ? 'translateY(-6px)' : `translate(${toward.x * 16}px, ${toward.y * 16}px)`;
  await animate(content, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: calm() ? 'none' : away }], calm() ? FADE : 'exit');
  render(next);
  ({ toward } = await api.ready(card.offsetHeight));
  sound.play(next);
  restoreDone();
  await animate(
    content,
    [{ opacity: 0, transform: calm() ? 'none' : 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
    calm() ? FADE : 'enter',
  );
}

async function respond(action) {
  if (busy || !current) return;
  busy = true;
  pulse(buttonFor(action));
  sound.stop();
  const reply = api.answer(current.id, action);
  if (action === 'done') await confirmDone();
  const next = await reply;
  if (next) {
    await swap(next, action);
  } else {
    await leave(action);
    current = null;
    resetDone();
    api.exited();
  }
  busy = false;
}

function resetDone() {
  for (const el of [tick, doneLabel, tickCover]) {
    el.getAnimations().forEach((a) => a.cancel());
    el.style.opacity = '';
    el.style.transform = '';
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createSound() {
  let audio = null;
  let timer = null;
  let token = 0;
  return {
    play(p) {
      this.stop();
      const mine = ++token;
      const start = (volume) => {
        if (mine !== token) return;
        audio = new Audio(p.sound);
        audio.volume = volume;
        if (p.repeat) {
          // Repeats are softer and spaced out: a reminder, not an alarm.
          audio.addEventListener('ended', () => (timer = setTimeout(() => start(p.volume * 0.45), 9000)), {
            once: true,
          });
        }
        audio.play().catch(() => {});
      };
      start(p.volume);
    },
    stop() {
      token++;
      clearTimeout(timer);
      const fading = audio;
      audio = null;
      if (!fading) return;
      const from = fading.volume;
      const t0 = performance.now();
      const step = (t) => {
        const k = Math.min(1, (t - t0) / 180);
        fading.volume = from * (1 - k);
        if (k < 1) requestAnimationFrame(step);
        else fading.pause();
      };
      requestAnimationFrame(step);
    },
  };
}

api.onShow(async (p) => {
  resetDone();
  render(p);
  ({ toward } = await api.ready(card.offsetHeight));
  enter();
  sound.play(p);
});

api.onReplace(async (next) => {
  if (busy) return;
  busy = true;
  sound.stop();
  if (next) {
    await swap(next, 'done');
  } else {
    await leave('done');
    current = null;
    api.exited();
  }
  busy = false;
});

api.onQueue(queueChanged);
api.onClose(() => current && respond(current.defaultWait));

for (const button of document.querySelectorAll('[data-action]')) {
  const { action } = button.dataset;
  button.addEventListener('click', () => respond(action === 'done' ? 'done' : Number(action)));
}
$('close').addEventListener('click', () => current && respond(current.defaultWait));

// Clicks pass through the transparent margin; only the card itself captures the mouse.
card.addEventListener('pointerenter', () => api.setInteractive(true));
card.addEventListener('pointerleave', () => api.setInteractive(false));

document.addEventListener('keydown', (e) => {
  if (!current || e.repeat) return;
  const onOtherButton = e.target instanceof HTMLButtonElement && e.target !== doneButton;
  if (e.key === 'Enter' && !onOtherButton) {
    e.preventDefault();
    respond('done');
  } else if (e.key === 'Escape') {
    e.preventDefault();
    respond(current.defaultWait);
  } else if (e.key === '2' || e.key === '3') {
    respond(Number(e.key));
  }
});
