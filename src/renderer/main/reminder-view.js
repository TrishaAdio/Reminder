import { h, setText, setValue } from './dom.js';
import { toggle, segmented, stepper, dayPicker, timeField } from './controls.js';
import { flip } from './flip.js';
import { minutesBetween } from './format.js';
import { animate, reducedMotion, FADE } from '../shared/spring.js';
import { icon } from '../shared/icons.js';

const blurOnEnter = (e) => e.key === 'Enter' && e.target.blur();

function section(title, key, rows) {
  const labelId = `label-${key}`;
  return [
    h('h2', { class: 'group-label t-callout', id: labelId, 'data-key': `${key}-label` }, title),
    h('div', { class: 'group', role: 'group', 'aria-labelledby': labelId, 'data-key': `${key}-group` }, ...rows),
  ];
}

function row(label, control) {
  return h('div', { class: 'row' }, h('span', { class: 'row-label' }, label), h('div', { class: 'row-value' }, control));
}

function textRow(label, input) {
  return h('label', { class: 'row text-row' }, h('span', { class: 'row-label' }, label), input);
}

function noteLine(key) {
  const text = h('span');
  const el = h('p', { class: 'group-note t-callout', 'data-key': key, hidden: true, role: 'status' }, h('span', { html: icon('alert') }), text);
  return { el, text };
}

export function reminderView({ api, id, state, fmt, player, autofocus }) {
  let r = state.reminders.find((x) => x.id === id);
  let runtime = state.runtime[id];
  let volume = state.settings.volume;
  let shownIcon = null;
  const memo = { time: '09:00', every: 30, from: '09:00', to: '18:00' };

  const remember = (s) => {
    if (s.type === 'daily') memo.time = s.time;
    else Object.assign(memo, { every: s.every, from: s.from, to: s.to });
  };
  remember(r.schedule);

  const send = (patch) => api.updateReminder(id, patch);
  // Local copy first so several quick edits compose before the main process answers.
  const setSchedule = (schedule) => {
    remember(schedule);
    r = { ...r, schedule };
    send({ schedule });
    paintSchedule();
  };
  const sendSchedule = (changes) => setSchedule({ ...r.schedule, ...changes });

  const textInput = (label, placeholder, max, key) =>
    h('input', {
      class: 'row-input',
      type: 'text',
      maxLength: max,
      placeholder,
      spellcheck: 'false',
      oninput: (e) => send({ [key]: e.target.value }),
      onkeydown: blurOnEnter,
    });

  const badge = h('span', { class: 'head-icon', 'aria-hidden': 'true' });
  const enabled = toggle({ checked: r.enabled, label: 'Reminder on', onChange: (on) => send({ enabled: on }) });
  const name = h('input', {
    class: 'title-input t-title',
    type: 'text',
    maxLength: 60,
    'aria-label': 'Name',
    spellcheck: 'false',
    oninput: (e) => send({ name: e.target.value }),
    onkeydown: blurOnEnter,
  });
  const status = h('p', { class: 'status t-callout', 'aria-live': 'polite' });
  const head = h('header', { class: 'detail-head', 'data-key': 'head' }, badge, h('div', { class: 'head-text' }, name, status), enabled.el);

  const message = textInput('Message', 'Shown in large type', 80, 'message');
  const details = textInput('Details', 'Optional', 160, 'note');

  const mode = segmented({
    options: [
      { value: 'daily', label: 'At a set time' },
      { value: 'interval', label: 'Every few minutes' },
    ],
    value: r.schedule.type,
    label: 'Schedule',
    onChange: (type) => {
      const days = r.schedule.days;
      setSchedule(
        type === 'daily'
          ? { type, time: memo.time, days }
          : { type, every: memo.every, from: memo.from, to: memo.to, days },
      );
    },
  });
  const time = timeField({ value: memo.time, fmt, label: 'Time', onChange: (t) => sendSchedule({ time: t }) });
  const every = stepper({ value: memo.every, format: fmt.duration, label: 'Interval', onChange: (m) => sendSchedule({ every: m }) });
  const from = timeField({ value: memo.from, fmt, label: 'From', onChange: (t) => sendSchedule({ from: t }) });
  const to = timeField({ value: memo.to, fmt, label: 'Until', onChange: (t) => sendSchedule({ to: t }) });
  const days = dayPicker({ days: r.schedule.days, fmt, onChange: (d) => sendSchedule({ days: d }) });

  const timeRow = row('Time', time.el);
  const everyRow = row('Every', every.el);
  const betweenRow = row('Between', h('div', { class: 'range' }, from.el, h('span', { class: 'range-word t-callout' }, 'and'), to.el));
  const scheduleNote = noteLine('schedule-note');

  const soundButtons = state.sounds.map((s) =>
    h(
      'button',
      { class: 'row row-button', type: 'button', role: 'radio', 'data-sound': s.id, onclick: () => pick({ kind: 'builtin', id: s.id }) },
      h('span', { class: 'row-label grow' }, s.name),
      h('span', { class: 'row-check', html: icon('check') }),
    ),
  );
  const fileName = h('span', { class: 'file-name t-callout' });
  const fileRadio = h(
    'button',
    { class: 'row-button file-radio', type: 'button', role: 'radio', onclick: () => (r.sound.kind === 'file' ? preview(r.sound) : chooseFile()) },
    h('span', { class: 'row-label' }, 'Your own sound'),
    fileName,
    h('span', { class: 'row-check', html: icon('check') }),
  );
  const chooseButton = h('button', { class: 'button small pressable', type: 'button', onclick: chooseFile }, 'Choose file…');
  const fileRow = h('div', { class: 'row file-row' }, fileRadio, chooseButton);
  const repeat = toggle({ checked: r.repeatSound, label: 'Repeat softly until answered', onChange: (on) => send({ repeatSound: on }) });
  const repeatRow = h('div', { class: 'row' }, h('span', { class: 'row-label grow' }, 'Repeat softly until answered'), repeat.el);
  const soundNote = noteLine('sound-note');
  const radios = [...soundButtons, fileRadio];

  const showNow = h(
    'button',
    { class: 'button pressable', type: 'button', onclick: () => api.previewReminder(id) },
    h('span', { html: icon('play') }),
    'Show now',
  );
  const remove = h('button', { class: 'button quiet pressable', type: 'button', onclick: onDelete }, 'Delete reminder');
  let armed = null;

  const el = h(
    'section',
    { class: 'view', 'aria-label': 'Reminder' },
    head,
    ...section('Wording', 'card', [textRow('Message', message), textRow('Details', details)]),
    ...section('Schedule', 'schedule', [h('div', { class: 'row seg-row' }, mode.el), timeRow, everyRow, betweenRow, row('Days', days.el)]),
    scheduleNote.el,
    ...section('Sound', 'sound', [...soundButtons, fileRow, repeatRow]),
    soundNote.el,
    h('div', { class: 'detail-actions', 'data-key': 'actions' }, showNow, remove),
  );
  el.querySelector('[data-key="sound-group"]').setAttribute('role', 'radiogroup');
  el.querySelector('[data-key="sound-group"]').addEventListener('keydown', moveRadioFocus);

  function moveRadioFocus(e) {
    const i = radios.indexOf(e.target);
    const delta = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (i < 0 || !delta) return;
    e.preventDefault();
    radios[(i + delta + radios.length) % radios.length].focus();
  }

  function onDelete() {
    if (armed) {
      clearTimeout(armed);
      api.deleteReminder(id);
      return;
    }
    remove.classList.add('confirm');
    remove.textContent = 'Click again to delete';
    armed = setTimeout(disarm, 3000);
  }
  function disarm() {
    clearTimeout(armed);
    armed = null;
    remove.classList.remove('confirm');
    remove.textContent = 'Delete reminder';
  }
  remove.addEventListener('blur', () => armed && disarm());

  async function preview(sound) {
    const ok = await player.play(sound, volume);
    setNote(soundNote, ok ? '' : 'This file can’t be played. Try an mp3, wav, m4a or ogg file.');
  }

  function pick(sound) {
    r = { ...r, sound };
    send({ sound });
    paintSound();
    preview(sound);
  }

  async function chooseFile() {
    const result = await api.chooseSound(id);
    if (result?.error) return setNote(soundNote, 'That file couldn’t be copied. Try an mp3, wav, m4a or ogg file.');
    if (!result?.reminder) return;
    r = result.reminder;
    paintSound();
    preview(r.sound);
  }

  // Notes change the height of the page, so their appearance is part of the layout motion.
  function setNote(note, text) {
    if (note.el.hidden === !text && note.text.textContent === text) return;
    flip(el, () => {
      note.el.hidden = !text;
      setText(note.text, text);
    });
  }

  function showRows(type) {
    const daily = type === 'daily';
    if (timeRow.hidden === !daily && everyRow.hidden === daily) return;
    const appearing = daily ? [timeRow] : [everyRow, betweenRow];
    flip(el, () => {
      timeRow.hidden = !daily;
      everyRow.hidden = daily;
      betweenRow.hidden = daily;
    });
    for (const rowEl of appearing) animate(rowEl, [{ opacity: 0 }, { opacity: 1 }], reducedMotion() ? FADE : 'enter');
  }

  function paintSchedule() {
    const s = r.schedule;
    mode.set(s.type);
    showRows(s.type);
    if (s.type === 'daily') time.set(s.time);
    else {
      every.set(s.every);
      from.set(s.from);
      to.set(s.to);
    }
    days.set(s.days);
    const noDays = !s.days.length;
    const tooShort = s.type === 'interval' && s.every > minutesBetween(s.from, s.to);
    from.invalid(tooShort);
    to.invalid(tooShort);
    days.el.setAttribute('aria-invalid', String(noDays));
    setNote(
      scheduleNote,
      noDays
        ? 'Pick at least one day, or this reminder never comes up.'
        : tooShort
          ? `${fmt.clock(s.from)} to ${fmt.clock(s.to)} is shorter than ${fmt.duration(s.every)}, so this never comes up.`
          : '',
    );
  }

  function paintSound() {
    const current = r.sound;
    for (const b of soundButtons) {
      const on = current.kind === 'builtin' && b.dataset.sound === current.id;
      b.setAttribute('aria-checked', String(on));
    }
    fileRadio.setAttribute('aria-checked', String(current.kind === 'file'));
    setText(fileName, current.kind === 'file' ? current.name : 'None chosen');
    for (const b of radios) b.tabIndex = b.getAttribute('aria-checked') === 'true' ? 0 : -1;
  }

  function paint() {
    if (shownIcon !== r.icon) {
      badge.innerHTML = icon(r.icon);
      shownIcon = r.icon;
    }
    setValue(name, r.name);
    setValue(message, r.message);
    setValue(details, r.note);
    setText(status, fmt.status(r, runtime));
    repeat.set(r.repeatSound);
    enabled.set(r.enabled);
    paintSchedule();
    paintSound();
  }

  paint();
  if (autofocus) requestAnimationFrame(() => message.focus());

  return {
    el,
    update(next) {
      const found = next.reminders.find((x) => x.id === id);
      if (!found) return;
      r = found;
      runtime = next.runtime[id];
      volume = next.settings.volume;
      paint();
    },
  };
}
