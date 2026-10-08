import { h, setText } from './dom.js';
import { toggle, segmented } from './controls.js';
import { icon } from '../shared/icons.js';

function shortcut(label, keys) {
  return h('div', { class: 'row' }, h('span', { class: 'row-label grow' }, label), h('span', { class: 'keys t-callout' }, keys));
}

export function settingsView({ api, state, player }) {
  let settings = state.settings;

  const login = toggle({
    checked: settings.openAtLogin,
    label: 'Open at sign-in',
    onChange: (on) => api.setSetting('openAtLogin', on),
  });
  const wait = segmented({
    options: [
      { value: 2, label: 'Wait 2 min' },
      { value: 3, label: 'Wait 3 min' },
    ],
    value: settings.defaultWait,
    label: 'Closing a reminder means',
    onChange: (v) => api.setSetting('defaultWait', v),
  });
  const volumeValue = h('span', { class: 'volume-value t-callout tnum', 'aria-hidden': 'true' });
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
    onchange: (e) => player.play({ kind: 'builtin', id: 'chime' }, Number(e.target.value) / 100),
  });

  const paintVolume = (pct) => {
    volume.style.setProperty('--level', `${pct}%`);
    setText(volumeValue, `${pct}%`);
  };

  const el = h(
    'section',
    { class: 'view', 'aria-labelledby': 'settings-title' },
    h('h1', { class: 'view-title t-title', id: 'settings-title' }, 'Settings'),
    h('h2', { class: 'group-label t-callout' }, 'General'),
    h(
      'div',
      { class: 'group' },
      h('div', { class: 'row' }, h('span', { class: 'row-label grow' }, 'Open at sign-in'), login.el),
      h('div', { class: 'row' }, h('span', { class: 'row-label grow' }, 'Closing a reminder means'), h('div', { class: 'seg-compact' }, wait.el)),
    ),
    h('h2', { class: 'group-label t-callout' }, 'Sound'),
    h('div', { class: 'group' }, h('div', { class: 'row' }, h('span', { class: 'row-label' }, 'Volume'), volume, volumeValue)),
    h('h2', { class: 'group-label t-callout' }, 'Keyboard'),
    h(
      'div',
      { class: 'group' },
      shortcut('New reminder', 'Ctrl+N'),
      shortcut('Close this window', 'Ctrl+W'),
      shortcut('On a reminder card: Done', 'Enter'),
      shortcut('On a reminder card: wait', 'Esc, 2 or 3'),
    ),
    h('h2', { class: 'group-label t-callout' }, 'Storage'),
    h(
      'div',
      { class: 'group' },
      h(
        'div',
        { class: 'row' },
        h(
          'span',
          { class: 'row-label grow stack' },
          'Reminders and imported sounds',
          h('span', { class: 'path t-caption' }, state.env.dataPath),
        ),
        h(
          'button',
          { class: 'button small pressable', type: 'button', onclick: () => api.showDataFolder() },
          h('span', { html: icon('file') }),
          'Show folder',
        ),
      ),
    ),
    h('p', { class: 'about t-caption' }, `RemindAni ${state.env.version}`),
  );

  function paint() {
    login.set(settings.openAtLogin);
    wait.set(settings.defaultWait);
    if (document.activeElement !== volume) {
      volume.value = Math.round(settings.volume * 100);
      paintVolume(Math.round(settings.volume * 100));
    }
  }
  paint();

  return {
    el,
    update(next) {
      settings = next.settings;
      paint();
    },
  };
}
