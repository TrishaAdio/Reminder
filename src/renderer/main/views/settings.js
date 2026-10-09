import { h, setText } from '../dom.js';
import { toggle, segmented, timeField } from '../controls.js';
import { flip } from '../flip.js';
import { icon, appMark } from '../../shared/icons.js';
import { updatePanel } from './update-panel.js';

const field = (label, control, sub) =>
  h(
    'div',
    { class: 'field' },
    h('span', { class: 'field-label grow stack' }, label, sub ? h('span', { class: 'field-sub t-small' }, sub) : null),
    control,
  );

function group(title, key, ...children) {
  const id = `label-${key}`;
  return h(
    'section',
    { class: 'group', 'data-key': key, 'aria-labelledby': id },
    h('h2', { class: 'section-label t-small', id }, title),
    h('div', { class: 'card rows-card' }, ...children),
  );
}

// A small screen with the card drawn where it will appear; the card glides between spots.
function positionPreview() {
  const card = h('span', { class: 'mini-card' });
  const el = h('span', { class: 'mini-screen', 'aria-hidden': 'true' }, card);
  return { el, set: (pos) => (el.dataset.pos = pos) };
}

export function settingsView({ api, state, fmt, player, actions }) {
  let s = state;

  const login = toggle({ checked: s.settings.openAtLogin, label: 'Open at sign-in', onChange: (on) => api.setSetting('openAtLogin', on) });
  const theme = segmented({
    options: [
      { value: 'system', label: 'System' },
      { value: 'light', label: 'Light' },
      { value: 'dark', label: 'Dark' },
    ],
    value: s.settings.theme,
    label: 'Appearance',
    onChange: (v) => api.setSetting('theme', v),
  });

  const preview = positionPreview();
  const position = segmented({
    options: [
      { value: 'top', label: 'Top' },
      { value: 'top-right', label: 'Top right' },
      { value: 'bottom-right', label: 'Bottom right' },
      { value: 'center', label: 'Center' },
    ],
    value: s.settings.position,
    label: 'Card position',
    onChange: (v) => {
      preview.set(v);
      api.setSetting('position', v);
    },
  });
  const dim = toggle({ checked: s.settings.dim, label: 'Dim the screen behind the card', onChange: (on) => api.setSetting('dim', on) });
  const defaultWait = segmented({
    options: [
      { value: 2, label: '2 min' },
      { value: 3, label: '3 min' },
    ],
    value: s.settings.defaultWait,
    label: 'Closing a card waits',
    onChange: (v) => api.setSetting('defaultWait', v),
  });
  // Pictures that peek over the top of the card, one per card in turn.
  const companionToggle = toggle({ checked: s.settings.companionOn, label: 'Pictures on the card', onChange: (on) => api.setSetting('companionOn', on) });
  const strip = h('div', { class: 'buddies', role: 'list', 'aria-label': 'Pictures' });
  const addPictures = h('button', { class: 'button small pressable', type: 'button', onclick: () => addCompanions() }, h('span', { html: icon('plus') }), 'Add pictures…');
  const restorePictures = h('button', { class: 'button small quiet pressable', type: 'button', onclick: () => api.restoreCompanions() }, 'Bring back the built-in pictures');
  const companionNote = h('p', { class: 'field-sub t-small buddy-note', role: 'status' });
  const companionRow = h(
    'div',
    { class: 'field buddy-field', 'data-key': 'buddies' },
    h('div', { class: 'buddy-head' }, h('span', { class: 'field-label grow stack' }, 'Pictures on the card', h('span', { class: 'field-sub t-small' }, 'They peek over the top of each card, taking turns.')), companionToggle.el),
    strip,
    h('div', { class: 'buddy-foot' }, addPictures, restorePictures, companionNote),
  );
  let shownBuddies = null;

  async function addCompanions() {
    const r = await api.addCompanions();
    setText(companionNote, r?.failed ? `${r.failed} file${r.failed === 1 ? '' : 's'} couldn’t be added. Use png, webp, gif or jpg.` : '');
  }

  function paintCompanions() {
    const list = s.settings.companions;
    const key = list.map((c) => c.file).join();
    if (key !== shownBuddies) {
      shownBuddies = key;
      strip.replaceChildren(
        ...list.map((c) =>
          h(
            'div',
            { class: 'buddy-thumb', role: 'listitem' },
            h('img', { src: `../companion/${c.builtin ? 'builtin' : 'user'}/${encodeURIComponent(c.file)}`, alt: c.name, draggable: 'false' }),
            h('button', { class: 'buddy-remove pressable', type: 'button', 'aria-label': `Remove ${c.name}`, title: 'Remove', html: icon('close'), onclick: () => api.removeCompanion(c.file) }),
          ),
        ),
      );
    }
    strip.hidden = !list.length;
    companionToggle.set(s.settings.companionOn);
    addPictures.disabled = list.length >= 24;
    restorePictures.hidden = list.filter((c) => c.builtin).length >= 6;
    if (!list.length && !companionNote.textContent) setText(companionNote, 'Transparent PNGs look best.');
    else if (list.length && companionNote.textContent === 'Transparent PNGs look best.') setText(companionNote, '');
  }

  const sample = h('button', { class: 'button small pressable', type: 'button', onclick: () => actions.sample() }, h('span', { html: icon('play') }), 'Show a sample card');
  const sampleRow = field('See it on screen', sample);

  // Do not disturb
  const pauseButtons = h(
    'div',
    { class: 'button-row' },
    ...[
      ['30m', '30 min'],
      ['1h', '1 hour'],
      ['tomorrow', 'Until tomorrow'],
    ].map(([kind, label]) => h('button', { class: 'button small pressable', type: 'button', onclick: () => api.pause(kind) }, label)),
  );
  const resume = h('button', { class: 'button small primary pressable', type: 'button', onclick: () => api.pause('resume') }, 'Resume');
  const pauseSub = h('span', { class: 'field-sub t-small' });
  const pauseRow = h('div', { class: 'field' }, h('span', { class: 'field-label grow stack' }, 'Pause reminders', pauseSub), pauseButtons, resume);

  const sendQuiet = (patch) => api.setSetting('quiet', { ...s.settings.quiet, ...patch });
  const quietToggle = toggle({
    checked: s.settings.quiet.enabled,
    label: 'Quiet hours',
    onChange: (on) => {
      s = { ...s, settings: { ...s.settings, quiet: { ...s.settings.quiet, enabled: on } } };
      sendQuiet({ enabled: on });
      paintQuiet();
    },
  });
  const quietFrom = timeField({ value: s.settings.quiet.from, fmt, label: 'Quiet from', onChange: (t) => sendQuiet({ from: t }) });
  const quietTo = timeField({ value: s.settings.quiet.to, fmt, label: 'Quiet until', onChange: (t) => sendQuiet({ to: t }) });
  const quietRange = h('div', { class: 'field', 'data-key': 'quiet-range' }, h('span', { class: 'field-label grow' }, 'From'), h('div', { class: 'range' }, quietFrom.el, h('span', { class: 'muted t-small' }, 'to'), quietTo.el));

  // Sound
  const volumeValue = h('span', { class: 'volume-value t-small tnum', 'aria-hidden': 'true' });
  const volume = h('input', {
    class: 'slider',
    type: 'range',
    min: 0,
    max: 100,
    step: 1,
    'aria-label': 'Volume',
    oninput: (e) => {
      paintVolume(Number(e.target.value));
      api.setSetting('volume', Number(e.target.value) / 100);
    },
    onchange: (e) => player.play('volume', { kind: 'builtin', id: 'chime' }, Number(e.target.value) / 100),
  });
  const paintVolume = (pct) => {
    volume.style.setProperty('--level', `${pct}%`);
    setText(volumeValue, `${pct}%`);
  };

  const updates = updatePanel({ api, fmt });
  const shortcut = (label, keys) => h('div', { class: 'field' }, h('span', { class: 'field-label grow' }, label), h('kbd', { class: 'keys t-small' }, keys));

  const about = group(
    'About',
    'about',
    h(
      'div',
      { class: 'field about' },
      h('span', { html: appMark('about-mark') }),
      h('span', { class: 'field-label grow stack' }, h('span', { class: 'about-name' }, 'RemindAni'), h('span', { class: 'field-sub t-small' }, `Version ${s.env.version}`)),
    ),
    updates.el,
    field(
      'Reminders and imported sounds',
      h('button', { class: 'button small pressable', type: 'button', onclick: () => api.showDataFolder() }, h('span', { html: icon('folder') }), 'Show folder'),
      s.env.dataPath,
    ),
  );

  const el = h(
    'div',
    { class: 'view settings' },
    h('header', { class: 'page-head' }, h('h1', { class: 't-title' }, 'Settings')),
    group('General', 'general', field('Open at sign-in', login.el, 'Starts quietly in the tray.'), field('Appearance', h('div', { class: 'seg-fixed' }, theme.el))),
    group(
      'Reminder card',
      'card',
      h('div', { class: 'field position' }, preview.el, h('span', { class: 'field-label grow stack' }, 'Position', h('span', { class: 'field-sub t-small' }, 'On the screen your pointer is on.')), h('div', { class: 'seg-wide' }, position.el)),
      field('Dim the screen behind the card', dim.el, 'Clicks still go through to what’s underneath.'),
      companionRow,
      field('Closing a card waits', h('div', { class: 'seg-fixed' }, defaultWait.el), 'Used by reminders set to the app default.'),
      sampleRow,
    ),
    group('Do not disturb', 'dnd', pauseRow, field('Quiet hours', quietToggle.el, 'Reminders that come up in this window are skipped.'), quietRange),
    group(
      'Sound',
      'sound',
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Volume'), h('span', { class: 'muted', html: icon('speaker-low') }), volume, h('span', { class: 'muted', html: icon('speaker') }), volumeValue),
    ),
    group('Keyboard', 'keys', shortcut('New reminder', 'Ctrl+N'), shortcut('Today, Reminders, Settings', 'Ctrl+1, 2, 3'), shortcut('Back', 'Esc'), shortcut('Close this window', 'Ctrl+W'), shortcut('On a reminder card', 'Enter = Done, Esc, 2 or 3 = wait')),
    about,
  );

  function paintQuiet() {
    const on = s.settings.quiet.enabled;
    if (quietRange.hidden === !on) return;
    flip(el, () => (quietRange.hidden = !on));
  }

  function paint() {
    const st = s.settings;
    login.set(st.openAtLogin);
    theme.set(st.theme);
    position.set(st.position);
    preview.set(st.position);
    dim.set(st.dim);
    defaultWait.set(st.defaultWait);
    sampleRow.hidden = !s.reminders.length;
    paintCompanions();
    const paused = st.pausedUntil != null && st.pausedUntil > Date.now();
    pauseButtons.hidden = paused;
    resume.hidden = !paused;
    setText(pauseSub, paused ? `Paused until ${fmt.time(st.pausedUntil)}` : 'Nothing comes up until the pause ends.');
    quietToggle.set(st.quiet.enabled);
    quietFrom.set(st.quiet.from);
    quietTo.set(st.quiet.to);
    paintQuiet();
    if (document.activeElement !== volume) {
      volume.value = Math.round(st.volume * 100);
      paintVolume(Math.round(st.volume * 100));
    }
    updates.set(s.update);
  }

  paint();
  return {
    el,
    update(next) {
      s = next;
      paint();
    },
    updateState(u) {
      s = { ...s, update: u };
      updates.set(u);
    },
    showAbout() {
      about.scrollIntoView({ block: 'start' });
    },
  };
}
