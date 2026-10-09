import { h, setText, setValue } from '../dom.js';
import { toggle, segmented, stepper, dayPicker, timeField } from '../controls.js';
import { flip } from '../flip.js';
import { minutesBetween } from '../format.js';
import { animate, reducedMotion, FADE } from '../../shared/spring.js';
import { icon, tintClass, ICON_LABEL } from '../../shared/icons.js';
import { iconPicker } from '../popover.js';
import { soundPicker } from './sound-picker.js';

const blurOnEnter = (e) => e.key === 'Enter' && e.target.blur();

function group(title, key, ...children) {
  const id = `label-${key}`;
  return h(
    'section',
    { class: 'group', 'data-key': key, 'aria-labelledby': id },
    h('h2', { class: 'section-label t-small', id }, title),
    h('div', { class: 'card rows-card' }, ...children),
  );
}

const row = (label, control) =>
  h('div', { class: 'field' }, h('span', { class: 'field-label' }, label), h('div', { class: 'field-value' }, control));

function note(key) {
  const text = h('span');
  return { el: h('p', { class: 'note t-small', 'data-key': key, role: 'status', hidden: true }, h('span', { html: icon('alert') }), text), text };
}

export function editorView({ api, id, state, fmt, player, back, actions, autofocus }) {
  let r = state.reminders.find((x) => x.id === id);
  let s = state;
  const memo = { time: '09:00', every: 30, from: '09:00', to: '18:00' };
  const remember = (sch) => {
    if (sch.type === 'daily') memo.time = sch.time;
    else Object.assign(memo, { every: sch.every, from: sch.from, to: sch.to });
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

  // Header
  const enabled = toggle({ checked: r.enabled, label: 'Reminder on', onChange: (on) => send({ enabled: on }) });
  const onLabel = h('span', { class: 't-small muted' });
  const tileButton = h('button', { class: 'tile huge pressable', type: 'button', 'aria-haspopup': 'true' });
  tileButton.addEventListener('click', () =>
    iconPicker({ anchor: tileButton, icons: s.icons, value: r.icon, onPick: (name) => ((r = { ...r, icon: name }), send({ icon: name }), paintHead()) }),
  );
  const title = h('input', {
    class: 'title-input t-title',
    type: 'text',
    maxLength: 60,
    'aria-label': 'Name',
    spellcheck: 'false',
    oninput: (e) => send({ name: e.target.value }),
    onkeydown: blurOnEnter,
  });
  const status = h('p', { class: 'status t-body', 'aria-live': 'polite' });
  const head = h(
    'header',
    { class: 'editor-head', 'data-key': 'head' },
    tileButton,
    h('div', { class: 'editor-title' }, title, status),
    h('label', { class: 'on-switch' }, onLabel, enabled.el),
  );

  // Card text
  const input = (placeholder, max, key) =>
    h('input', {
      class: 'field-input',
      type: 'text',
      maxLength: max,
      placeholder,
      spellcheck: 'false',
      oninput: (e) => send({ [key]: e.target.value }),
      onkeydown: blurOnEnter,
    });
  const message = input('What the card says, in large type', 80, 'message');
  const details = input('Optional second line', 160, 'note');
  const textRow = (label, el) => h('label', { class: 'field text' }, h('span', { class: 'field-label' }, label), el);

  // Schedule
  const mode = segmented({
    options: [
      { value: 'daily', label: 'At a set time' },
      { value: 'interval', label: 'Every few minutes' },
    ],
    value: r.schedule.type,
    label: 'Schedule',
    onChange: (type) =>
      setSchedule(
        type === 'daily'
          ? { type, time: memo.time, days: r.schedule.days }
          : { type, every: memo.every, from: memo.from, to: memo.to, days: r.schedule.days },
      ),
  });
  const time = timeField({ value: memo.time, fmt, label: 'Time', onChange: (t) => sendSchedule({ time: t }) });
  const every = stepper({ value: memo.every, format: fmt.duration, label: 'Interval', onChange: (m) => sendSchedule({ every: m }) });
  const from = timeField({ value: memo.from, fmt, label: 'From', onChange: (t) => sendSchedule({ from: t }) });
  const to = timeField({ value: memo.to, fmt, label: 'Until', onChange: (t) => sendSchedule({ to: t }) });
  const days = dayPicker({ days: r.schedule.days, fmt, onChange: (d) => sendSchedule({ days: d }) });
  const timeRow = row('Time', time.el);
  const everyRow = row('Every', every.el);
  const betweenRow = row('Between', h('div', { class: 'range' }, from.el, h('span', { class: 'muted t-small' }, 'and'), to.el));
  const scheduleNote = note('schedule-note');

  // Sound
  const soundNote = note('sound-note');
  const sounds = soundPicker({
    sounds: s.sounds,
    value: r.sound,
    player,
    volume: s.settings.volume,
    onSelect: (sound) => ((r = { ...r, sound }), send({ sound })),
    onChoose: chooseFile,
    onError: (text) => setNote(soundNote, text),
  });
  const repeat = toggle({ checked: r.repeatSound, label: 'Repeat softly until answered', onChange: (on) => send({ repeatSound: on }) });

  // Closing
  const waitLabel = () => `App default (${s.settings.defaultWait} min)`;
  const wait = segmented({
    options: [
      { value: null, label: waitLabel() },
      { value: 2, label: '2 min' },
      { value: 3, label: '3 min' },
    ],
    value: r.wait,
    label: 'Closing the card waits',
    onChange: (v) => send({ wait: v }),
  });

  // Footer
  const testButton = h('button', { class: 'button primary pressable', type: 'button', onclick: () => actions.test(id) }, h('span', { html: icon('play') }), 'Test now');
  const dupButton = h('button', { class: 'button pressable', type: 'button', onclick: () => actions.duplicate(id) }, h('span', { html: icon('copy') }), 'Duplicate');
  const delButton = h('button', { class: 'button quiet pressable', type: 'button', onclick: () => actions.remove(id) }, h('span', { html: icon('trash') }), 'Delete');

  const el = h(
    'div',
    { class: 'view editor' },
    back,
    head,
    group('On the card', 'card', textRow('Message', message), textRow('Details', details)),
    group('Schedule', 'schedule', h('div', { class: 'field seg' }, mode.el), timeRow, everyRow, betweenRow, row('Days', days.el)),
    scheduleNote.el,
    group(
      'Sound',
      'sound',
      sounds.el,
      h('div', { class: 'field' }, h('span', { class: 'field-label grow' }, 'Repeat softly until answered'), repeat.el),
    ),
    soundNote.el,
    group(
      'Closing the card',
      'closing',
      h('div', { class: 'field seg' }, wait.el),
    ),
    h('p', { class: 'hint t-small', 'data-key': 'closing-hint' }, 'Closing a card without answering brings it back after this wait.'),
    h('footer', { class: 'editor-foot', 'data-key': 'foot' }, testButton, dupButton, h('span', { class: 'spacer' }), delButton),
  );

  async function chooseFile() {
    const result = await api.chooseSound(id);
    if (result?.error) return setNote(soundNote, 'That file couldn’t be copied. Try an mp3, wav, m4a or ogg file.');
    if (!result?.reminder) return;
    r = result.reminder;
    sounds.set(r.sound, s.settings.volume);
    const ok = await player.play(`file:${r.sound.file}`, r.sound, s.settings.volume);
    setNote(soundNote, ok ? '' : 'This file can’t be played. Try an mp3, wav, m4a or ogg file.');
  }

  // Notes change the height of the page, so their appearance is part of the layout motion.
  function setNote(n, text) {
    if (n.el.hidden === !text && n.text.textContent === text) return;
    flip(el, () => {
      n.el.hidden = !text;
      setText(n.text, text);
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
    for (const x of appearing) animate(x, [{ opacity: 0 }, { opacity: 1 }], reducedMotion() ? FADE : 'enter');
  }

  function paintSchedule() {
    const sch = r.schedule;
    mode.set(sch.type);
    showRows(sch.type);
    if (sch.type === 'daily') time.set(sch.time);
    else {
      every.set(sch.every);
      from.set(sch.from);
      to.set(sch.to);
    }
    days.set(sch.days);
    const noDays = !sch.days.length;
    const tooShort = sch.type === 'interval' && sch.every > minutesBetween(sch.from, sch.to);
    from.invalid(tooShort);
    to.invalid(tooShort);
    days.el.setAttribute('aria-invalid', String(noDays));
    setNote(
      scheduleNote,
      noDays
        ? 'Pick at least one day, or this reminder never comes up.'
        : tooShort
          ? `${fmt.clock(sch.from)} to ${fmt.clock(sch.to)} is shorter than ${fmt.duration(sch.every)}, so this never comes up.`
          : '',
    );
  }

  let shownIcon = null;
  function paintHead(now = Date.now()) {
    if (shownIcon !== r.icon) {
      tileButton.className = `tile huge pressable ${tintClass(r.icon)}`;
      tileButton.innerHTML = icon(r.icon);
      tileButton.setAttribute('aria-label', `Icon: ${ICON_LABEL[r.icon]}. Change icon`);
      shownIcon = r.icon;
    }
    setValue(title, r.name);
    setText(status, fmt.status(r, s.runtime[id], now));
    enabled.set(r.enabled);
    setText(onLabel, r.enabled ? 'On' : 'Off');
    el.classList.toggle('is-off', !r.enabled);
  }

  function paint() {
    paintHead();
    setValue(message, r.message);
    setValue(details, r.note);
    repeat.set(r.repeatSound);
    sounds.set(r.sound, s.settings.volume);
    wait.set(r.wait);
    wait.el.querySelector('.seg-option').textContent = waitLabel();
    paintSchedule();
  }

  paint();
  if (autofocus) requestAnimationFrame(() => title.select());

  return {
    el,
    update(next) {
      const found = next.reminders.find((x) => x.id === id);
      s = next;
      if (!found) return;
      r = found;
      paint();
    },
    slowTick(now) {
      paintHead(now);
    },
    destroy() {
      sounds.destroy();
      player.stop();
    },
  };
}
