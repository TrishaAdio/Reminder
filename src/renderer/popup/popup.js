import { animate, spring, reducedMotion, FADE, installSpringProperties, pulse } from '../shared/spring.js';
import { icon, tintClass } from '../shared/icons.js';
import { measureFrames } from './frames.js';
import { celebrate, breakStreak } from './celebrate.js';

installSpringProperties();

const api = window.popup;
const $ = (id) => document.getElementById(id);
const card = document.querySelector('.card');
const content = document.querySelector('.content');
const dim = document.querySelector('.dim');
const buddy = document.querySelector('.buddy');
const buddyImg = document.getElementById('buddy');
const doneButton = document.querySelector('[data-action="done"]');
const doneLabel = doneButton.querySelector('.label');
const tick = doneButton.querySelector('.tick');
const tickCover = doneButton.querySelector('.tick-cover');
const TRAVEL = 64;

doneButton.querySelector('.tick-mark').insertAdjacentHTML('afterbegin', icon('check'));
$('close').innerHTML = icon('close');

let current = null;
let toward = { x: 0.7, y: 0.7 };
let busy = false;
const sound = createSound();
const calm = () => reducedMotion() || current?.solid;

function render(p) {
  current = p;
  // A button clicked on an earlier card keeps focus; Enter must mean Done on every new card.
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  document.documentElement.classList.toggle('solid', p.solid);
  const showing = document.body.classList.contains('showing');
  document.body.className = `pos-${p.position}${p.companion ? ' has-buddy' : ''}${showing ? ' showing' : ''}`;
  buddy.hidden = !p.companion;
  if (p.companion) buddyImg.src = p.companion;
  card.className = `card ${tintClass(p.icon)}`;
  $('tile').className = 'tile';
  $('tile').innerHTML = icon(p.icon);
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
  card.classList.remove('queued-1', 'queued-2');
  if (count) card.classList.add(`queued-${Math.min(2, count)}`);
}

const rect = () => {
  const r = card.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
};

// The solid fallback window is exactly card-sized, so it has to follow height changes.
function queueChanged(count) {
  setQueue(count);
  if (current?.solid) api.ready(rect());
}

function buttonFor(action) {
  return document.querySelector(`[data-action="${action}"]`);
}

// The companion pops up from behind the card once the card has landed: one springy rise.
function buddyUp(delay = 160) {
  if (buddy.hidden) return;
  if (reducedMotion()) return animate(buddy, [{ opacity: 0 }, { opacity: 1 }], FADE);
  return animate(buddy, [{ opacity: 0, transform: 'translateY(55%) scale(0.92)' }, { opacity: 1, transform: 'none' }], 'release', { delay });
}

function buddyDown() {
  if (buddy.hidden) return Promise.resolve();
  if (reducedMotion()) return animate(buddy, [{ opacity: 1 }, { opacity: 0 }], FADE);
  return animate(buddy, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(45%) scale(0.96)' }], 'exit');
}

function enter() {
  document.body.classList.add('showing');
  buddyUp(current.solid ? 0 : 200);
  if (current.dim) animate(dim, [{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: spring('exit').easing });
  if (calm()) return animate(card, [{ opacity: 0, transform: 'none' }, { opacity: 1, transform: 'none' }], FADE);
  if (current.perf) measureFrames(700).then(api.reportFrames);
  const from = current.position.startsWith('bottom') ? 'translateY(16px) scale(0.96)' : 'translateY(-16px) scale(0.96)';
  animate(content, [{ filter: 'blur(6px)' }, { filter: 'none' }], { duration: 160, easing: spring('exit').easing });
  return animate(card, [{ opacity: 0, transform: from }, { opacity: 1, transform: 'none' }], 'enter');
}

async function confirmDone() {
  tick.style.opacity = '1';
  if (calm()) {
    doneLabel.style.opacity = '0';
    tickCover.style.transform = 'translateX(101%)';
    return wait(260);
  }
  // A springy pop on the button itself. No fill, so it never pins a transform over :active.
  doneButton.animate(
    [{ transform: 'scale(0.97)' }, { transform: 'scale(1.06)', offset: 0.35 }, { transform: 'scale(0.99)', offset: 0.7 }, { transform: 'none' }],
    { duration: 420, easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)' },
  );
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
  // The window can stay up a few seconds more for the celebration; the faded card must not
  // catch the pointer meanwhile, or clicks there would land on nothing.
  card.style.pointerEvents = 'none';
  api.setInteractive(false);
  document.body.classList.remove('showing');
  buddyDown();
  if (current?.dim) animate(dim, [{ opacity: 1 }, { opacity: 0 }], 'exit');
  if (calm()) return animate(card, [{ opacity: 1 }, { opacity: 0 }], FADE);
  // Done settles in place; Wait shrinks away toward the tray, where it will come back from.
  const to = action === 'done' ? 'scale(0.98)' : `translate(${toward.x * TRAVEL}px, ${toward.y * TRAVEL}px) scale(0.88)`;
  return animate(card, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: to }], 'exit');
}

// The card stays; only its content changes, nudged in the direction the last one went.
async function swap(next, action) {
  const away = action === 'done' ? 'translateY(-6px)' : `translate(${toward.x * 16}px, ${toward.y * 16}px)`;
  await Promise.all([
    animate(content, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: calm() ? 'none' : away }], calm() ? FADE : 'exit'),
    buddyDown(),
  ]);
  render(next);
  buddyUp(60);
  ({ toward } = await api.ready(rect()));
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
  let party = null;
  if (action === 'done') {
    party = celebrate({
      button: doneButton,
      card,
      buddy: buddy.hidden ? null : buddyImg,
      calm: calm(),
      volume: current.volume,
      counts: !current.preview,
      check: icon('check'),
      next: reply,
    });
    await Promise.all([confirmDone(), party.reacted]);
  } else if (!current.preview) {
    breakStreak();
  }
  const next = await reply;
  if (next) {
    await swap(next, action);
  } else {
    await leave(action);
    // The window hides once the last piece has landed, not mid-flight.
    await party?.landed;
    finish();
  }
  busy = false;
}

function finish() {
  current = null;
  resetDone();
  api.setInteractive(false);
  api.exited();
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
          audio.addEventListener('ended', () => (timer = setTimeout(() => start(p.volume * 0.45), 9000)), { once: true });
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
  card.style.pointerEvents = '';
  resetDone();
  render(p);
  ({ toward } = await api.ready(rect()));
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
    finish();
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

// Clicks pass through the dim layer; only the card itself captures the mouse.
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
