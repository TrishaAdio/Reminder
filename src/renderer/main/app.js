import { installSpringProperties, animate, reducedMotion, FADE } from '../shared/spring.js';
import { icon, appMark } from '../shared/icons.js';
import { h } from './dom.js';
import { createFormat } from './format.js';
import { createPlayer } from './player.js';
import { createToaster } from './toast.js';
import { closePopover } from './popover.js';
import { todayView } from './views/today.js';
import { listView } from './views/list.js';
import { galleryView } from './views/gallery.js';
import { editorView } from './views/editor.js';
import { settingsView } from './views/settings.js';

installSpringProperties();

const api = window.remindani;
const player = createPlayer();
const toaster = createToaster();
let state = await api.getState();
const fmt = createFormat(state.env);

// Glass look: iOS-style frosted surfaces; `material` when Windows draws acrylic behind the window.
function paintLook() {
  const root = document.documentElement;
  root.classList.toggle('glass', state.settings.look === 'glass');
  root.classList.toggle('material', state.settings.look === 'glass' && state.env.material);
}
paintLook();

const TABS = [
  { id: 'today', label: 'Today' },
  { id: 'reminders', label: 'Reminders' },
  { id: 'settings', label: 'Settings' },
];

let route = { tab: state.reminders.length ? 'today' : 'reminders', page: state.reminders.length ? null : { kind: 'gallery' } };
let view = null;
let highlight = null;

// Title bar: draggable, with the tabs in the middle. Windows draws the caption buttons.
const thumb = h('span', { class: 'tab-thumb', 'aria-hidden': 'true' });
const badge = h('span', { class: 'badge-dot', hidden: true });
const tabButtons = TABS.map((t, i) =>
  h(
    'button',
    {
      class: 'tab',
      type: 'button',
      role: 'tab',
      id: `tab-${t.id}`,
      'aria-controls': 'page',
      onclick: () => go({ tab: t.id, page: null }),
      onkeydown: (e) => {
        const delta = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (!delta) return;
        const next = TABS[(i + delta + TABS.length) % TABS.length];
        go({ tab: next.id, page: null });
        tabButtons[TABS.indexOf(next)].focus();
      },
    },
    t.label,
    t.id === 'settings' ? badge : null,
  ),
);
const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Sections' }, thumb, ...tabButtons);
const titlebar = h(
  'header',
  { class: 'titlebar' },
  h('span', { class: 'brand' }, h('span', { html: appMark('brand-mark') }), 'RemindAni'),
  tabs,
);
const page = h('main', { class: 'page scroll', id: 'page', role: 'tabpanel' });
document.body.append(h('div', { class: 'shell' }, titlebar, page), toaster.el);

function backButton(label = 'Reminders') {
  return h('button', { class: 'back pressable', type: 'button', onclick: () => go({ tab: route.tab, page: null }, { back: true }) }, h('span', { html: icon('back') }), label);
}

const actions = {
  async create(presetId) {
    const id = await api.createReminder(presetId);
    if (presetId === 'custom') return go({ tab: 'reminders', page: { kind: 'editor', id, autofocus: true } });
    const r = (await api.getState()).reminders.find((x) => x.id === id);
    highlight = id;
    go({ tab: 'reminders', page: null }, { back: true });
    toaster.show(`Added ${r.name}`, { label: 'Undo', run: () => api.deleteReminder(id) });
  },
  async duplicate(id) {
    const copy = await api.duplicateReminder(id);
    if (!copy) return;
    if (route.page?.kind === 'editor') go({ tab: 'reminders', page: { kind: 'editor', id: copy } });
    toaster.show('Duplicated', { label: 'Undo', run: () => api.deleteReminder(copy) });
  },
  async remove(id) {
    const name = state.reminders.find((x) => x.id === id)?.name.trim() || 'Reminder';
    if (route.page?.kind === 'editor') go({ tab: 'reminders', page: null }, { back: true });
    const deleted = await api.deleteReminder(id);
    if (deleted) toaster.show(`Deleted ${name}`, { label: 'Undo', run: () => api.restoreReminder(deleted) });
  },
  test: (id) => api.testReminder(id),
  setEnabled: (id, on) => api.updateReminder(id, { enabled: on }),
  sample: () => {
    const first = state.reminders.find((r) => r.enabled) ?? state.reminders[0];
    if (first) api.testReminder(first.id);
  },
};

function build() {
  const p = route.page;
  if (p?.kind === 'gallery') return galleryView({ state, fmt, back: backButton(), actions });
  if (p?.kind === 'editor') return editorView({ api, id: p.id, state, fmt, player, back: backButton(), actions, autofocus: p.autofocus });
  if (route.tab === 'today') return todayView({ api, state, fmt, go });
  if (route.tab === 'settings') return settingsView({ api, state, fmt, player, actions });
  const v = listView({ state, fmt, go, actions, highlight });
  highlight = null;
  return v;
}

function paintTabs() {
  const i = TABS.findIndex((t) => t.id === route.tab);
  thumb.style.transform = `translateX(${i * 100}%)`;
  tabButtons.forEach((b, j) => {
    b.setAttribute('aria-selected', String(i === j));
    b.tabIndex = i === j ? 0 : -1;
  });
  page.setAttribute('aria-labelledby', `tab-${route.tab}`);
  const u = state.update.status;
  badge.hidden = !['available', 'downloading', 'ready'].includes(u);
  tabButtons[2].setAttribute('aria-label', badge.hidden ? 'Settings' : 'Settings, update available');
}

// Tabs cross-fade; pages pushed onto a tab slide in from the side they belong to.
function go(next, { back = false, section = null } = {}) {
  const same = view && next.tab === route.tab && next.page?.kind === route.page?.kind && next.page?.id === route.page?.id;
  if (same) return;
  closePopover();
  if (route.page?.kind === 'editor' && next.page?.kind === 'editor') back = false;
  const pushed = next.tab === route.tab && (next.page != null || back);
  route = next;
  const old = view;
  view = build();
  old?.destroy?.();
  if (old) {
    old.el.classList.add('leaving');
    old.el.inert = true;
    const dx = back ? 24 : -24;
    const out = reducedMotion() || !pushed ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${dx}px)` }];
    animate(old.el, out, reducedMotion() ? FADE : 'exit').then(() => old.el.remove());
  }
  page.scrollTop = 0;
  page.append(view.el);
  if (old) {
    const dx = back ? -32 : 32;
    const into = reducedMotion()
      ? [{ opacity: 0 }, { opacity: 1 }]
      : pushed
        ? [{ opacity: 0, transform: `translateX(${dx}px)` }, { opacity: 1, transform: 'none' }]
        : [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }];
    animate(view.el, into, reducedMotion() ? FADE : pushed ? 'layout' : 'exit');
  }
  paintTabs();
  if (section === 'about') requestAnimationFrame(() => view.showAbout?.());
  view.focus?.();
}

api.onStateChanged((next) => {
  state = next;
  paintLook();
  const p = route.page;
  if (p?.kind === 'editor' && !state.reminders.some((r) => r.id === p.id)) {
    go({ tab: 'reminders', page: null }, { back: true });
  } else {
    view.update(state);
  }
  paintTabs();
});

api.onUpdateState((u) => {
  state = { ...state, update: u };
  view.updateState?.(u);
  paintTabs();
});

api.onNavigate((to) => go({ tab: to.tab, page: null }, { section: to.section }));

// Countdowns: the hero every second, everything else every 15 seconds.
setInterval(() => view.tick?.(Date.now()), 1000);
setInterval(() => view.slowTick?.(Date.now()), 15_000);

document.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (e.ctrlKey && key === 'n') {
    e.preventDefault();
    go({ tab: 'reminders', page: { kind: 'gallery' } });
  } else if (e.ctrlKey && key === 'w') {
    e.preventDefault();
    api.closeWindow();
  } else if (e.ctrlKey && key === ',') {
    e.preventDefault();
    go({ tab: 'settings', page: null });
  } else if (e.ctrlKey && ['1', '2', '3'].includes(key)) {
    e.preventDefault();
    go({ tab: TABS[Number(key) - 1].id, page: null });
  } else if (key === 'escape' && route.page && !e.defaultPrevented) {
    const from = route.page;
    go({ tab: route.tab, page: null }, { back: true });
    if (from.kind === 'editor') requestAnimationFrame(() => view.focusRow?.(from.id));
  }
});

go(route);
