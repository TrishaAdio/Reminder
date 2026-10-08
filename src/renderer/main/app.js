import { installSpringProperties } from '../shared/spring.js';
import { h } from './dom.js';
import { createFormat } from './format.js';
import { createPlayer } from './player.js';
import { createSidebar } from './sidebar.js';
import { fadeIn } from './flip.js';
import { reminderView } from './reminder-view.js';
import { newView } from './new-view.js';
import { settingsView } from './settings-view.js';

installSpringProperties();

const api = window.remindani;
const player = createPlayer();
let state = await api.getState();
const fmt = createFormat(state.env);
let view = state.reminders.length ? { kind: 'reminder', id: state.reminders[0].id } : { kind: 'new' };
let lastReminder = view.id ?? null;
let screen = null;

const sidebar = createSidebar({
  api,
  onSelect: (id) => go({ kind: 'reminder', id }),
  onNew: () => go({ kind: 'new' }),
  onSettings: () => go({ kind: 'settings' }),
});
const scroll = h('div', { class: 'detail-scroll scroll' });
document.body.append(
  h('div', { class: 'app' }, sidebar.el, h('main', { class: 'detail' }, h('div', { class: 'titlebar' }), scroll)),
);

function build(options) {
  if (view.kind === 'new') {
    return newView({
      api,
      state,
      fmt,
      onCreated: (id, isCustom) => go({ kind: 'reminder', id }, { autofocus: isCustom }),
    });
  }
  if (view.kind === 'settings') return settingsView({ api, state, player });
  return reminderView({ api, id: view.id, state, fmt, player, autofocus: options.autofocus });
}

function go(next, options = {}) {
  if (screen && next.kind === view.kind && next.id === view.id) return;
  view = next;
  if (view.kind === 'reminder') lastReminder = view.id;
  screen?.el.remove();
  screen = build(options);
  scroll.scrollTop = 0;
  scroll.append(screen.el);
  fadeIn(screen.el);
  sidebar.update(state, fmt, view);
  if (options.focus) screen.focus?.();
}

api.onStateChanged((next) => {
  const before = state.reminders.map((r) => r.id);
  state = next;
  if (view.kind === 'reminder' && !state.reminders.some((r) => r.id === view.id)) {
    // Select the neighbour of a deleted reminder, like a list in Finder or Explorer would.
    const i = Math.min(before.indexOf(view.id), state.reminders.length - 1);
    const neighbour = state.reminders[Math.max(0, i)];
    go(neighbour ? { kind: 'reminder', id: neighbour.id } : { kind: 'new' });
    return;
  }
  screen.update(state);
  sidebar.update(state, fmt, view);
});

// Relative phrases ("today", "tomorrow") go stale without any state change.
setInterval(() => screen.update(state), 30_000);

document.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (e.ctrlKey && key === 'n') {
    e.preventDefault();
    go({ kind: 'new' }, { focus: true });
  } else if (e.ctrlKey && key === 'w') {
    e.preventDefault();
    api.closeWindow();
  } else if (e.ctrlKey && key === ',') {
    e.preventDefault();
    go({ kind: 'settings' });
  } else if (key === 'escape' && view.kind !== 'reminder' && lastReminder && state.reminders.some((r) => r.id === lastReminder)) {
    go({ kind: 'reminder', id: lastReminder });
    sidebar.focusSelected();
  }
});

go(view);
