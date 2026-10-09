import { h, setText } from '../dom.js';
import { icon, tintClass } from '../../shared/icons.js';
import { animate, reducedMotion } from '../../shared/spring.js';

const R = 60;
const C = 2 * Math.PI * R;
const LANES = 6;

const tile = (name, size = '') => h('span', { class: `tile ${size} ${tintClass(name)}`, 'aria-hidden': 'true', html: icon(name) });

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

export function todayView({ api, state, fmt, go }) {
  let s = state;
  const r = ring();
  const eyebrow = h('p', { class: 'hero-eyebrow t-small' });
  const name = h('h1', { class: 'hero-name t-heading' });
  const big = h('p', { class: 'hero-big t-display tnum', 'aria-live': 'polite' });
  const sub = h('p', { class: 'hero-sub t-body' });
  const actions = h('div', { class: 'hero-actions' });
  const open = h('button', { class: 'stretched', type: 'button' });
  const tryIt = h('button', { class: 'button small hero-try pressable', type: 'button' }, h('span', { html: icon('play') }), 'Test now');
  const hero = h('section', { class: 'hero card' }, r.el, h('div', { class: 'hero-text' }, eyebrow, name, big, sub, actions), open, tryIt);

  const lanes = h('div', { class: 'lanes', 'aria-hidden': 'true' });
  const past = h('span', { class: 'past' });
  const nowLine = h('span', { class: 'now' }, h('span', { class: 'now-line' }));
  const quiet = h('span', { class: 'quiet-band' });
  const track = h('div', { class: 'track' }, quiet, past, lanes, nowLine);
  const axis = h('div', { class: 'axis t-micro', 'aria-hidden': 'true' });
  for (const hr of [0, 6, 12, 18]) axis.append(h('span', { style: `left:${(hr / 24) * 100}%` }, fmt.hourLabel(hr)));
  axis.append(h('span', { style: 'left:100%' }, 'Midnight'));
  const count = h('span', { class: 't-small muted' });
  const timeline = h(
    'section',
    { class: 'timeline card' },
    h('header', { class: 'card-head' }, h('h2', { class: 'card-title' }, 'Today'), count),
    track,
    axis,
  );

  const comingList = h('ol', { class: 'coming' });
  const coming = h('section', { class: 'coming-card' }, h('h2', { class: 'section-label t-small' }, 'Then'), h('div', { class: 'card' }, comingList));

  const el = h('div', { class: 'view today' }, hero, timeline, coming);
  let heroKey = null;

  const byId = (id) => s.reminders.find((x) => x.id === id);

  function nextUp(now) {
    let best = null;
    for (const rem of s.reminders) {
      const st = s.runtime[rem.id];
      if (!rem.enabled || !st || st.nextAt == null) continue;
      if (!best || st.nextAt < best.st.nextAt) best = { rem, st };
    }
    return best ?? null;
  }

  function paintHero(now) {
    const { pausedUntil, quiet: q } = s.settings;
    const paused = pausedUntil != null && pausedUntil > now;
    const up = nextUp(now);
    const key = paused ? 'paused' : s.muted ? 'quiet' : up ? `up:${up.rem.id}:${up.st.nextAt}` : 'empty';
    const changed = key !== heroKey;
    heroKey = key;
    hero.dataset.state = key.split(':')[0];

    if (changed) {
      actions.replaceChildren();
      open.hidden = true;
      tryIt.hidden = true;
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
      hero.className = `hero card ${tintClass(rem.icon)}`;
      r.center.append(tile(rem.icon, 'big'));
      open.hidden = false;
      open.setAttribute('aria-label', `Edit ${rem.name}`);
      open.onclick = () => go({ tab: 'reminders', page: { kind: 'editor', id: rem.id } });
      tryIt.hidden = false;
      tryIt.onclick = () => api.testReminder(rem.id);
      tryIt.setAttribute('aria-label', `Test ${rem.name} now`);
    }
    setText(eyebrow, st.status === 'snoozed' ? 'Back after a wait' : 'Up next');
    setText(name, rem.name.trim() || 'Reminder');
    setText(big, capitalize(fmt.relative(st.nextAt, now)));
    const sch = rem.schedule;
    setText(sub, `${fmt.time(st.nextAt)} · ${sch.type === 'daily' ? capitalize(fmt.days(sch.days)) : fmt.schedule(sch)}`);
    const start = ringStart(rem, st);
    r.set((now - start) / Math.max(1, st.nextAt - start), changed);
  }

  function paintTimeline(now) {
    const d = new Date(now);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const frac = (t) => Math.min(1, Math.max(0, (t - dayStart) / 86_400_000));
    const items = s.today.filter((o) => o.at >= now && byId(o.id)?.enabled);
    past.style.transform = `scaleX(${frac(now)})`;
    nowLine.style.transform = `translateX(${frac(now) * 100}%)`;
    setText(count, items.length ? `${items.length} more today` : 'Nothing else today');
    timeline.setAttribute('aria-label', `Today: ${items.length ? `${items.length} more reminders` : 'nothing else scheduled'}`);

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
    lanes.replaceChildren(
      ...order.slice(0, LANES).map((id) => {
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
    paintHero(now);
    paintTimeline(now);
  }

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
      paintTimeline(now);
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
