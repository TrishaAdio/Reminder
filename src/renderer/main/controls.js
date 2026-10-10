import { h } from './dom.js';
import { icon } from '../shared/icons.js';
import { glider } from '../shared/spring.js';

const pad = (n) => String(n).padStart(2, '0');

export function toggle({ checked, label, onChange }) {
  const el = h(
    'button',
    { class: 'toggle', type: 'button', role: 'switch', 'aria-label': label },
    h('span', { class: 'toggle-on' }),
    h('span', { class: 'toggle-knob' }),
  );
  const set = (value) => {
    checked = value;
    el.setAttribute('aria-checked', String(value));
  };
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    set(!checked);
    onChange(checked);
  });
  set(checked);
  return { el, set };
}

export function segmented({ options, value, label, onChange }) {
  const thumb = h('span', { class: 'seg-thumb', 'aria-hidden': 'true' });
  const glide = glider(thumb);
  const buttons = options.map((o) =>
    h('button', { class: 'seg-option', type: 'button', role: 'radio', onclick: () => select(o.value, true) }, o.label),
  );
  const el = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label }, thumb, ...buttons);
  el.style.setProperty('--count', options.length);

  function select(next, byUser) {
    if (byUser && next === value) return;
    value = next;
    const index = options.findIndex((o) => o.value === value);
    buttons.forEach((b, i) => {
      b.setAttribute('aria-checked', String(i === index));
      b.tabIndex = i === index ? 0 : -1;
    });
    // Glides only once it's on screen; the first paint just places it.
    glide.set(index, el.isConnected);
    if (byUser) onChange(value);
  }

  el.addEventListener('keydown', (e) => {
    const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!delta) return;
    e.preventDefault();
    const index = (options.findIndex((o) => o.value === value) + delta + options.length) % options.length;
    select(options[index].value, true);
    buttons[index].focus();
  });

  select(value, false);
  return { el, set: (v) => select(v, false) };
}

const STEPS = [5, 10, 15, 20, 25, 30, 40, 45, 50, 60, 75, 90, 120, 180, 240];

export function stepper({ value, format, label, onChange }) {
  let index = 0;
  const nearest = (v) => STEPS.reduce((best, s, i) => (Math.abs(s - v) < Math.abs(STEPS[best] - v) ? i : best), 0);
  const move = (delta) => {
    const next = Math.min(STEPS.length - 1, Math.max(0, index + delta));
    if (next === index) return;
    index = next;
    render();
    onChange(STEPS[index]);
  };
  const button = (name, text, delta) =>
    h('button', {
      class: 'stepper-button pressable',
      type: 'button',
      tabIndex: -1,
      'aria-label': text,
      html: icon(name),
      onclick: () => move(delta),
    });
  const less = button('minus', 'Shorter interval', -1);
  const more = button('plus', 'Longer interval', 1);
  const output = h('span', {
    class: 'stepper-value tnum',
    role: 'spinbutton',
    tabIndex: 0,
    'aria-label': label,
    'aria-valuemin': STEPS[0],
    'aria-valuemax': STEPS.at(-1),
  });
  output.addEventListener('keydown', (e) => {
    const delta = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, Home: -99, End: 99 }[e.key];
    if (!delta) return;
    e.preventDefault();
    move(delta);
  });

  function render() {
    output.textContent = format(STEPS[index]);
    output.setAttribute('aria-valuenow', STEPS[index]);
    output.setAttribute('aria-valuetext', format(STEPS[index]));
    less.disabled = index === 0;
    more.disabled = index === STEPS.length - 1;
  }

  const set = (v) => {
    index = nearest(v);
    render();
  };
  set(value);
  return { el: h('div', { class: 'stepper' }, less, output, more), set };
}

export function dayPicker({ days, fmt, onChange }) {
  let selected = new Set(days);
  const buttons = new Map();
  const el = h('div', { class: 'days', role: 'group', 'aria-label': 'Days' });
  for (const d of fmt.weekOrder) {
    const b = h(
      'button',
      { class: 'day', type: 'button', 'aria-label': fmt.dayName(d) },
      h('span', { class: 'day-fill', 'aria-hidden': 'true' }),
      h('span', { class: 'day-label', 'aria-hidden': 'true' }, fmt.dayLetter(d)),
    );
    b.addEventListener('click', () => {
      if (selected.has(d)) selected.delete(d);
      else selected.add(d);
      render();
      onChange([...selected]);
    });
    buttons.set(d, b);
    el.append(b);
  }
  function render() {
    for (const [d, b] of buttons) b.setAttribute('aria-pressed', String(selected.has(d)));
  }
  render();
  return {
    el,
    set(list) {
      selected = new Set(list);
      render();
    },
  };
}

// Segmented hour/minute entry like the system clocks: arrows step, digits type, Tab moves on.
export function timeField({ value, fmt, label, onChange }) {
  const twelve = fmt.hourCycle === 'h12' || fmt.hourCycle === 'h11';
  let hours = 0;
  let minutes = 0;
  let typed = '';

  const segment = (name) => h('span', { class: 'time-seg', role: 'spinbutton', tabIndex: 0, 'aria-label': `${label}, ${name}` });
  const hourSeg = segment('hour');
  const minuteSeg = segment('minutes');
  const periodSeg = twelve ? segment('AM or PM') : null;
  const segments = [hourSeg, minuteSeg, periodSeg].filter(Boolean);
  const el = h(
    'div',
    { class: 'time-field tnum', role: 'group', 'aria-label': label },
    hourSeg,
    h('span', { class: 'time-sep', 'aria-hidden': 'true' }, ':'),
    minuteSeg,
    periodSeg,
  );

  function render() {
    const spoken = fmt.clock(`${pad(hours)}:${pad(minutes)}`);
    hourSeg.textContent = twelve ? String(((hours + 11) % 12) + 1) : pad(hours);
    minuteSeg.textContent = pad(minutes);
    if (periodSeg) periodSeg.textContent = fmt.periods[hours < 12 ? 0 : 1];
    hourSeg.setAttribute('aria-valuenow', hours);
    minuteSeg.setAttribute('aria-valuenow', minutes);
    for (const s of segments) s.setAttribute('aria-valuetext', spoken);
  }

  function commit() {
    render();
    onChange(`${pad(hours)}:${pad(minutes)}`);
  }

  const setTwelveHour = (n) => {
    hours = (n % 12) + (hours >= 12 ? 12 : 0);
  };

  function typeDigit(seg, digit) {
    typed += digit;
    const n = Number(typed);
    let complete = typed.length === 2;
    if (seg === hourSeg) {
      if (twelve) {
        complete ||= n > 1;
        setTwelveHour(Math.min(12, Math.max(1, n || 12)));
      } else {
        complete ||= n > 2;
        hours = Math.min(23, n);
      }
    } else {
      complete ||= n > 5;
      minutes = Math.min(59, n);
    }
    commit();
    if (complete) {
      typed = '';
      if (seg === hourSeg) minuteSeg.focus();
    }
  }

  const step = (seg, delta) => {
    if (seg === hourSeg) hours = (hours + delta + 24) % 24;
    else if (seg === minuteSeg) minutes = (minutes + delta + 60) % 60;
    else hours = (hours + 12) % 24;
    typed = '';
    commit();
  };

  el.addEventListener('focusin', () => (typed = ''));
  // Mouse users get the wheel, and the AM/PM segment flips on click.
  el.addEventListener('wheel', (e) => {
    if (!segments.includes(e.target)) return;
    e.preventDefault();
    e.target.focus();
    step(e.target, e.deltaY < 0 ? 1 : -1);
  });
  periodSeg?.addEventListener('click', () => step(periodSeg, 1));
  el.addEventListener('keydown', (e) => {
    const seg = e.target;
    const i = segments.indexOf(seg);
    if (i < 0) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      step(seg, e.key === 'ArrowUp' ? 1 : -1);
    } else if (e.key === 'ArrowRight' && segments[i + 1]) {
      segments[i + 1].focus();
    } else if (e.key === 'ArrowLeft' && segments[i - 1]) {
      segments[i - 1].focus();
    } else if (/^\d$/.test(e.key) && seg !== periodSeg) {
      typeDigit(seg, e.key);
    } else if (seg === periodSeg && /^[ap]$/i.test(e.key)) {
      const pm = e.key.toLowerCase() === 'p';
      if (pm !== hours >= 12) hours = (hours + 12) % 24;
      commit();
    } else {
      return;
    }
    e.preventDefault();
  });

  const set = (v) => {
    if (el.contains(document.activeElement)) return;
    hours = Number(v.slice(0, 2));
    minutes = Number(v.slice(3));
    render();
  };
  set(value);
  return {
    el,
    set,
    invalid: (on) => el.setAttribute('aria-invalid', String(on)),
  };
}
