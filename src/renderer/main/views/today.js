import { h, setText } from '../dom.js';
import { icon, tintClass } from '../../shared/icons.js';
import { animate, reducedMotion } from '../../shared/spring.js';
import { livePicture } from '../live-picture.js';

const R = 60;
const C = 2 * Math.PI * R;
const LANES = 6;
// Written by the reminder card (popup/celebrate.js) each time Done is answered; same origin,
// so this page reads it and hears about changes through the `storage` event.
const TALLY = 'remindani.celebrate';
const PICTURE_TURN = 'remindani.todayPicture';

const tile = (name, size = '') => h('span', { class: `tile ${size} ${tintClass(name)}`, 'aria-hidden': 'true', html: icon(name) });
const pictureUrl = (c) => `../companion/${c.builtin ? 'builtin' : 'user'}/${encodeURIComponent(c.file)}`;

function readTally() {
  try {
    const data = JSON.parse(localStorage.getItem(TALLY)) ?? {};
    return data.day === new Date().toDateString() ? { done: data.done ?? 0, streak: data.streak ?? 0 } : { done: 0, streak: 0 };
  } catch {
    return { done: 0, streak: 0 };
  }
}

function nextPictureTurn() {
  try {
    const n = (Number(localStorage.getItem(PICTURE_TURN)) || 0) + 1;
    localStorage.setItem(PICTURE_TURN, String(n));
    return n;
  } catch {
    return Math.floor(Math.random() * 1000);
  }
}

function greeting(hour) {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 22) return 'Good evening';
  return 'Hello, night owl';
}

function ring() {
  const svg = `<svg class="ring-svg" viewBox="0 0 136 136" aria-hidden="true">
    <circle class="ring-track" cx="68" cy="68" r="${R}"/>
    <circle class="ring-progress" cx="68" cy="68" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${C}" transform="rotate(-90 68 68)"/>
  </svg>`;
  const el = h('div', { class: 'ring', html: svg });
  const head = h('span', { class: 'ring-head', 'aria-hidden': 'true' }, h('span', { class: 'ring-dot' }));
  const center = h('span', { class: 'ring-center' });
  el.append(head, center);
  const arc = el.querySelector('.ring-progress');
  let shown = 0;
  return {
    el,
    center,
    set(p, animated) {
      const target = Math.min(1, Math.max(0, p));
      if (animated && !reducedMotion()) {
        // Paint-only on a 136px SVG: the one non-transform animation, done once on arrival.
        animate(arc, [{ strokeDashoffset: C * (1 - shown) }, { strokeDashoffset: C * (1 - target) }], 'enter');
        animate(head, [{ transform: `rotate(${shown * 360}deg)` }, { transform: `rotate(${target * 360}deg)` }], 'enter');
      } else {
        arc.setAttribute('stroke-dashoffset', String(C * (1 - target)));
        head.style.transform = `rotate(${target * 360}deg)`;
      }
      shown = target;
    },
  };
}

// One of the three numbers under the hero. The number gives a little bump when it changes.
function stat({ iconName, tint, label }) {
  const value = h('span', { class: 'stat-value t-heading tnum' });
  const sub = h('span', { class: 'stat-sub t-small' });
  const el = h(
    'div',
    { class: `stat card tint-${tint}` },
    h('span', { class: 'tile', 'aria-hidden': 'true', html: icon(iconName) }),
    h('span', { class: 'stat-text' }, value, h('span', { class: 'stat-label t-small' }, label), sub),
  );
  return {
    el,
    set(v, subText = '') {
      const text = String(v);
      if (value.textContent && value.textContent !== text && !reducedMotion()) {
        value.animate([{ scale: 1 }, { scale: 1.18, offset: 0.35 }, { scale: 1 }], { duration: 420, easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)' });
      }
      setText(value, text);
      setText(sub, subText);
      sub.hidden = !subText;
    },
  };
}

export function todayView({ api, state, fmt, go }) {
  let s = state;
  const dateFmt = new Intl.DateTimeFormat(s.env.locale, { weekday: 'long', month: 'long', day: 'numeric' });

  // ── Greeting, date, and the two things people reach for most ──
  // "Good evening, Anirban": the name in a script face, so the page feels like it's theirs.
  const helloWord = h('span', {});
  const helloName = h('span', { class: 'today-name' });
  const hello = h('h1', { class: 't-title today-hello' }, helloWord, helloName);
  const date = h('span', { class: 'today-date' });
  const chip = h('span', { class: 'today-chip t-micro' });
  const pauseButton = h('button', { class: 'button small pressable', type: 'button', onclick: () => api.pause('1h') }, h('span', { html: icon('pause') }), 'Pause 1 hour');
  const resumeButton = h('button', { class: 'button small pressable', type: 'button', onclick: () => api.pause('resume') }, h('span', { html: icon('play') }), 'Resume');
  const newButton = h('button', { class: 'button small primary pressable', type: 'button', onclick: () => go({ tab: 'reminders', page: { kind: 'gallery' } }) }, h('span', { html: icon('plus') }), 'New reminder');
  const head = h(
    'header',
    { class: 'today-head' },
    h('div', { class: 'stack' }, hello, h('p', { class: 'today-sub t-small' }, date, chip)),
    h('div', { class: 'today-tools' }, pauseButton, resumeButton, newButton),
  );

  // ── Hero: what's next, in a live ring, with a picture peeking in ──
  const r = ring();
  const eyebrow = h('p', { class: 'hero-eyebrow t-small' });
  const name = h('h1', { class: 'hero-name t-heading' });
  const big = h('p', { class: 'hero-big t-display tnum', 'aria-live': 'polite' });
  const sub = h('p', { class: 'hero-sub t-body' });
  const actions = h('div', { class: 'hero-actions' });
  const open = h('button', { class: 'stretched', type: 'button' });
  const tryIt = h('button', { class: 'button small hero-try pressable', type: 'button' }, h('span', { html: icon('play') }), 'Test now');
  const live = livePicture({ className: 'hero-buddy-figure' });
  const buddy = h('button', { class: 'hero-buddy', type: 'button', title: 'Another picture', 'aria-label': 'Show another picture', onclick: () => turnPicture(1) }, live.el);
  const hero = h('section', { class: 'hero card' }, r.el, h('div', { class: 'hero-text' }, eyebrow, name, big, sub, actions), open, buddy);

  // ── Numbers for today ──
  const doneStat = stat({ iconName: 'check-circle', tint: 'green', label: 'Done today' });
  const leftStat = stat({ iconName: 'clock', tint: 'blue', label: 'Still to come' });
  const onStat = stat({ iconName: 'bell', tint: 'indigo', label: 'Reminders on' });
  const stats = h('section', { class: 'stats', 'aria-label': 'Today in numbers' }, doneStat.el, leftStat.el, onStat.el);

  // ── Timeline ──
  const lanes = h('div', { class: 'lanes', 'aria-hidden': 'true' });
  const past = h('span', { class: 'past' });
  const nowLine = h('span', { class: 'now' }, h('span', { class: 'now-line' }));
  const quiet = h('span', { class: 'quiet-band' });
  const ticks = h('span', { class: 'hour-ticks', 'aria-hidden': 'true' });
  for (let hr = 3; hr < 24; hr += 3) ticks.append(h('span', { class: hr % 6 ? 'hour-tick' : 'hour-tick major', style: `left:${(hr / 24) * 100}%` }));
  const track = h('div', { class: 'track' }, quiet, past, ticks, lanes, nowLine);
  const axis = h('div', { class: 'axis t-micro', 'aria-hidden': 'true' });
  const axisLabels = [0, 6, 12, 18, 24].map((hr) => {
    const edge = hr === 0 ? 'axis-start' : hr === 24 ? 'axis-end' : '';
    const label = h('span', { class: `axis-label ${edge}`, style: `left:${(hr / 24) * 100}%` }, hr === 24 ? 'Midnight' : fmt.hourLabel(hr));
    label.dataset.at = String(hr / 24);
    return label;
  });
  const nowTag = h('span', { class: 'now-tag tnum' });
  axis.append(...axisLabels, nowTag);
  const count = h('span', { class: 't-small muted' });
  const legend = h('ul', { class: 'legend', 'aria-label': 'Still to come, by reminder' });
  const timeline = h(
    'section',
    { class: 'timeline card' },
    h('header', { class: 'card-head' }, h('h2', { class: 'card-title' }, 'Your day'), count),
    track,
    axis,
    legend,
  );

  const comingList = h('ol', { class: 'coming' });
  const coming = h('section', { class: 'coming-card' }, h('h2', { class: 'section-label t-small' }, 'Coming up'), h('div', { class: 'card' }, comingList));

  const el = h('div', { class: 'view today' }, head, hero, stats, timeline, coming);
  let heroKey = null;
  let pictureTurn = nextPictureTurn();
  let pictureFile = null;
  let lastLine = '';
  const userName = () => (s.settings.userName ?? '').trim();

  const byId = (id) => s.reminders.find((x) => x.id === id);

  function nextUp() {
    let best = null;
    for (const rem of s.reminders) {
      const st = s.runtime[rem.id];
      if (!rem.enabled || !st || st.nextAt == null) continue;
      if (!best || st.nextAt < best.st.nextAt) best = { rem, st };
    }
    return best ?? null;
  }

  // The picture comes from Settings › Pictures on the card; a new one each visit, and clicking
  // it shows the next.
  function paintPicture() {
    const list = s.settings.companionOn ? s.settings.companions : [];
    hero.classList.toggle('has-buddy', list.length > 0);
    buddy.hidden = !list.length;
    if (!list.length) return (pictureFile = null);
    const c = list[((pictureTurn % list.length) + list.length) % list.length];
    if (c.file === pictureFile) return;
    pictureFile = c.file;
    live.setSource(pictureUrl(c), c.name ?? '');
  }

  // Things the picture says when it pops up: mostly kind words, sometimes what's next.
  function line() {
    const n = userName();
    const up = nextUp();
    const list = [
      n ? `Hi, ${n}!` : 'Hi there!',
      n ? `You’re doing great, ${n}!` : 'You’re doing great!',
      'Had some water yet?',
      'Don’t forget to stretch!',
      'I’ll remind you, promise.',
      n ? `Proud of you, ${n}.` : 'Proud of you.',
    ];
    if (up) list.push(`${up.rem.name.trim() || 'Reminder'} ${fmt.relative(up.st.nextAt, Date.now())}!`);
    const pick = list.filter((l) => l !== lastLine);
    lastLine = pick[Math.floor(Math.random() * pick.length)];
    return lastLine;
  }

  function turnPicture(step) {
    const list = s.settings.companionOn ? s.settings.companions : [];
    if (list.length < 2) return;
    pictureTurn += step;
    if (reducedMotion()) return paintPicture();
    // She ducks down behind the card's edge, and the next one pops up once it has loaded,
    // with something to say.
    const out = live.el.animate([{ translate: '0 0', opacity: 1 }, { translate: '0 24px', opacity: 0 }], { duration: 160, easing: 'ease-in', fill: 'forwards' });
    out.finished.then(
      () => {
        paintPicture();
        const show = () => {
          out.cancel();
          live.el.animate([{ translate: '0 28px', scale: 0.92, opacity: 0 }, { translate: '0 -6px', scale: 1.02, opacity: 1, offset: 0.6 }, { translate: '0 0', scale: 1, opacity: 1 }], {
            duration: 520,
            easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)',
          });
          live.say(line());
        };
        if (live.loaded) show();
        else {
          live.img.addEventListener('load', show, { once: true });
          live.img.addEventListener('error', () => out.cancel(), { once: true });
        }
      },
      () => {},
    );
  }

  // On arrival she waves hello, by name.
  live.img.addEventListener(
    'load',
    () =>
      setTimeout(() => {
        if (!el.isConnected) return;
        live.wave();
        const n = userName();
        lastLine = n ? `Hi, ${n}!` : 'Hi there!';
        live.say(lastLine);
      }, 420),
    { once: true },
  );

  // She leans a little toward the pointer, anywhere on the page.
  let leanFrame = 0;
  el.addEventListener('pointermove', (e) => {
    if (leanFrame) return;
    leanFrame = requestAnimationFrame(() => {
      leanFrame = 0;
      live.lean(e.clientX, e.clientY);
    });
  });
  el.addEventListener('pointerleave', () => live.lean(null));

  function paintHead(now) {
    const d = new Date(now);
    const who = userName();
    setText(helloWord, who ? `${greeting(d.getHours())}, ` : greeting(d.getHours()));
    setText(helloName, who);
    helloName.hidden = !who;
    setText(date, dateFmt.format(d));
    const { pausedUntil, quiet: q } = s.settings;
    const paused = pausedUntil != null && pausedUntil > now;
    let text = '';
    if (paused) text = `Paused until ${fmt.time(pausedUntil)}`;
    else if (s.muted) text = 'Quiet hours';
    else if (q.enabled) text = `Quiet from ${fmt.clock(q.from)}`;
    setText(chip, text);
    chip.hidden = !text;
    chip.dataset.kind = paused ? 'paused' : s.muted ? 'quiet' : 'info';
    pauseButton.hidden = paused || !s.reminders.some((x) => x.enabled);
    resumeButton.hidden = !paused;
  }

  function paintHero(now) {
    const { pausedUntil, quiet: q } = s.settings;
    const paused = pausedUntil != null && pausedUntil > now;
    const up = nextUp();
    const key = paused ? 'paused' : s.muted ? 'quiet' : up ? `up:${up.rem.id}:${up.st.nextAt}` : 'empty';
    const changed = key !== heroKey;
    heroKey = key;

    if (changed) {
      hero.className = `hero card${buddy.hidden ? '' : ' has-buddy'}`;
      hero.dataset.state = key.split(':')[0];
      actions.replaceChildren();
      open.hidden = true;
      r.center.replaceChildren();
    }

    if (paused || s.muted) {
      if (changed) {
        r.center.append(h('span', { class: 'tile big neutral', 'aria-hidden': 'true', html: icon('pause') }));
        if (paused) {
          actions.append(h('button', { class: 'button primary pressable', type: 'button', onclick: () => api.pause('resume') }, 'Resume now'));
        }
      }
      setText(eyebrow, paused ? 'Do not disturb' : 'Quiet hours');
      setText(name, '');
      setText(big, paused ? 'Paused' : 'Quiet');
      setText(sub, `Until ${fmt.time(paused ? pausedUntil : quietEnd(now, q))}. Reminders that come up meanwhile are skipped.`);
      r.set(0, false);
      return;
    }

    if (!up) {
      if (changed) {
        r.center.append(tile('flag', 'big'));
        actions.append(h('button', { class: 'button primary pressable', type: 'button', onclick: () => go({ tab: 'reminders', page: { kind: 'gallery' } }) }, 'Choose a preset'));
      }
      setText(eyebrow, 'Up next');
      setText(name, '');
      setText(big, s.reminders.length ? 'Nothing on' : 'Nothing yet');
      setText(sub, s.reminders.length ? 'Every reminder is switched off.' : 'Pick a preset and your first reminder is set in one click.');
      r.set(0, false);
      return;
    }

    const { rem, st } = up;
    if (changed) {
      hero.classList.add(tintClass(rem.icon));
      r.center.append(tile(rem.icon, 'big'));
      open.hidden = false;
      open.setAttribute('aria-label', `Edit ${rem.name}`);
      open.onclick = () => go({ tab: 'reminders', page: { kind: 'editor', id: rem.id } });
      tryIt.onclick = () => api.testReminder(rem.id);
      tryIt.setAttribute('aria-label', `Test ${rem.name} now`);
      actions.append(tryIt);
    }
    setText(eyebrow, st.status === 'snoozed' ? 'Back after a wait' : 'Up next');
    setText(name, rem.name.trim() || 'Reminder');
    setText(big, capitalize(fmt.relative(st.nextAt, now)));
    const sch = rem.schedule;
    setText(sub, `${fmt.time(st.nextAt)} · ${sch.type === 'daily' ? capitalize(fmt.days(sch.days)) : fmt.schedule(sch)}`);
    const start = ringStart(rem, st);
    r.set((now - start) / Math.max(1, st.nextAt - start), changed);
  }

  function paintStats(now) {
    const tally = readTally();
    doneStat.set(tally.done, tally.streak >= 2 ? `${tally.streak} in a row` : tally.done ? 'Nicely done' : 'Answer Done to count one');
    const left = s.today.filter((o) => o.at >= now && byId(o.id)?.enabled).length;
    leftStat.set(left, left ? `Until midnight` : 'All clear for today');
    const on = s.reminders.filter((x) => x.enabled).length;
    onStat.set(on, `of ${s.reminders.length}`);
    stats.hidden = s.reminders.length === 0;
  }

  function paintTimeline(now) {
    const d = new Date(now);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const frac = (t) => Math.min(1, Math.max(0, (t - dayStart) / 86_400_000));
    const items = s.today.filter((o) => o.at >= now && byId(o.id)?.enabled);
    const f = frac(now);
    past.style.transform = `scaleX(${f})`;
    nowLine.style.transform = `translateX(${f * 100}%)`;
    setText(count, items.length ? `${items.length} more today` : 'Nothing else today');
    timeline.setAttribute('aria-label', `Your day: ${items.length ? `${items.length} more reminders` : 'nothing else scheduled'}`);

    // "Now" sits on the axis under the line; hour labels it would cover step aside.
    setText(nowTag, fmt.time(now));
    nowTag.style.left = `${f * 100}%`;
    nowTag.dataset.edge = f < 0.05 ? 'start' : f > 0.95 ? 'end' : '';
    for (const label of axisLabels) label.classList.toggle('covered', Math.abs(Number(label.dataset.at) - f) < 0.075);

    const q = s.settings.quiet;
    quiet.hidden = !q.enabled;
    if (q.enabled) {
      const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
      const a = toMin(q.from) / 1440;
      const b = toMin(q.to) / 1440;
      // Overnight quiet hours show as the evening part; the morning part is already past.
      const [left, right] = a < b ? [a, b] : [a, 1];
      quiet.style.left = `${left * 100}%`;
      quiet.style.width = `${(right - left) * 100}%`;
    }

    const order = [];
    for (const o of items) if (!order.includes(o.id)) order.push(o.id);
    const shown = order.slice(0, LANES);
    lanes.replaceChildren(
      ...shown.map((id) => {
        const rem = byId(id);
        const lane = h('div', { class: `lane ${tintClass(rem.icon)}` });
        for (const o of items) {
          if (o.id !== id) continue;
          lane.append(h('span', { class: 'dot', style: `left:${frac(o.at) * 100}%`, title: `${rem.name} · ${fmt.time(o.at)}` }));
        }
        return lane;
      }),
    );
    track.style.setProperty('--lanes', Math.max(1, Math.min(LANES, order.length)));

    // A key under the timeline: which colour is which, and how many of each are left.
    legend.replaceChildren(
      ...shown.map((id) => {
        const rem = byId(id);
        const n = items.filter((o) => o.id === id).length;
        return h(
          'li',
          { class: tintClass(rem.icon) },
          h('button', { class: 'legend-item', type: 'button', onclick: () => go({ tab: 'reminders', page: { kind: 'editor', id } }) }, h('span', { class: 'legend-dot', 'aria-hidden': 'true' }), h('span', { class: 'legend-name' }, rem.name.trim() || 'Reminder'), h('span', { class: 'legend-count tnum' }, `×${n}`)),
        );
      }),
    );
    legend.hidden = shown.length === 0;

    // Each reminder once, at its next time; the hero already shows the first.
    const heroId = heroKey?.startsWith('up') ? heroKey.split(':')[1] : null;
    const next = order.filter((id) => id !== heroId).map((id) => items.find((o) => o.id === id)).slice(0, 5);
    comingList.replaceChildren(
      ...next.map((o) => {
        const rem = byId(o.id);
        return h(
          'li',
          {},
          h(
            'button',
            { class: 'coming-row', type: 'button', onclick: () => go({ tab: 'reminders', page: { kind: 'editor', id: rem.id } }) },
            h('span', { class: 'coming-time t-small tnum' }, fmt.time(o.at)),
            tile(rem.icon, 'small'),
            h('span', { class: 'coming-name' }, rem.name.trim() || 'Reminder'),
            h('span', { class: 'coming-rel t-small tnum' }, fmt.relative(o.at, now)),
          ),
        );
      }),
    );
    coming.hidden = next.length === 0;
  }

  function paint(now = Date.now()) {
    paintPicture();
    paintHead(now);
    paintHero(now);
    paintStats(now);
    paintTimeline(now);
  }

  const onStorage = (e) => {
    if (e.key === TALLY) paintStats(Date.now());
  };
  window.addEventListener('storage', onStorage);

  paint();
  return {
    el,
    update(next) {
      s = next;
      paint();
    },
    tick(now) {
      paintHero(now);
    },
    slowTick(now) {
      paintHead(now);
      paintStats(now);
      paintTimeline(now);
    },
    destroy() {
      window.removeEventListener('storage', onStorage);
      live.destroy();
    },
  };
}

// The ring spans one period: a wait since it started, an interval, or a day for daily reminders.
function ringStart(rem, st) {
  if (st.status === 'snoozed' && st.since) return st.since;
  if (rem.schedule.type === 'interval') return st.nextAt - rem.schedule.every * 60_000;
  return st.nextAt - 86_400_000;
}

function capitalize(t) {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function quietEnd(now, q) {
  const d = new Date(now);
  const [h, m] = q.to.split(':').map(Number);
  let end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
  if (end <= now) end += 86_400_000;
  return end;
}
