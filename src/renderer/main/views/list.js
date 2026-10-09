import { h, setText } from '../dom.js';
import { toggle } from '../controls.js';
import { flip, enterItem, leaveItem } from '../flip.js';
import { icon, tintClass } from '../../shared/icons.js';

// Soonest first; switched-off reminders sink to the bottom.
function sorted(state) {
  const at = (r) => {
    const st = state.runtime[r.id];
    if (!r.enabled) return Infinity;
    if (st?.status === 'due') return -Infinity;
    return st?.nextAt ?? Number.MAX_SAFE_INTEGER;
  };
  return [...state.reminders].sort((a, b) => at(a) - at(b) || a.name.localeCompare(b.name));
}

export function listView({ state, fmt, go, actions, highlight }) {
  let s = state;
  const rows = new Map();
  const list = h('div', { class: 'rows', role: 'list', 'aria-label': 'Reminders' });
  const summary = h('p', { class: 'page-sub t-small' });
  const add = h(
    'button',
    { class: 'button primary pressable', type: 'button', onclick: () => go({ tab: 'reminders', page: { kind: 'gallery' } }) },
    h('span', { html: icon('plus') }),
    'New reminder',
  );
  const empty = h(
    'div',
    { class: 'empty' },
    h(
      'div',
      { class: 'empty-tiles', 'aria-hidden': 'true' },
      ...['moon', 'drop', 'eye'].map((n) => h('span', { class: `tile ${tintClass(n)}`, html: icon(n) })),
    ),
    h('p', { class: 'empty-title' }, 'No reminders yet'),
    h('p', { class: 'empty-sub t-small' }, 'Start from a preset. It takes one click, and you can change it afterwards.'),
    h('button', { class: 'button pressable', type: 'button', onclick: () => go({ tab: 'reminders', page: { kind: 'gallery' } }) }, 'Choose a preset'),
  );
  const card = h('div', { class: 'card list-card' }, list, empty);
  const el = h(
    'div',
    { class: 'view' },
    h('header', { class: 'page-head' }, h('div', {}, h('h1', { class: 't-title' }, 'Reminders'), summary), add),
    card,
  );
  let mounted = false;

  function makeRow(r) {
    const tileEl = h('span', { class: 'tile', 'aria-hidden': 'true' });
    const title = h('span', { class: 'row-title' });
    const sched = h('span', { class: 'row-sub t-small' });
    const when = h('span', { class: 'row-when t-small tnum' });
    const main = h('button', { class: 'stretched row-open', type: 'button', onclick: () => go({ tab: 'reminders', page: { kind: 'editor', id: r.id } }) });
    const act = (name, label, fn) =>
      h('button', { class: 'icon-button pressable', type: 'button', 'aria-label': label, title: label, html: icon(name), onclick: fn });
    const tools = h(
      'div',
      { class: 'row-tools' },
      act('play', 'Test now', () => actions.test(r.id)),
      act('copy', 'Duplicate', () => actions.duplicate(r.id)),
      act('trash', 'Delete', () => actions.remove(r.id)),
    );
    const sw = toggle({ checked: r.enabled, label: 'On', onChange: (on) => actions.setEnabled(r.id, on) });
    const el = h(
      'div',
      { class: 'row', role: 'listitem', 'data-key': r.id },
      tileEl,
      h('span', { class: 'row-text' }, title, sched),
      h('span', { class: 'row-end' }, when, tools),
      sw.el,
      main,
    );
    el.addEventListener('keydown', (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && e.target === main) actions.remove(r.id);
    });
    return { el, tileEl, title, sched, when, main, sw, icon: null };
  }

  function fill(row, r, now) {
    const st = s.runtime[r.id];
    const name = r.name.trim() || 'Reminder';
    setText(row.title, name);
    setText(row.sched, fmt.schedule(r.schedule));
    const when = !r.enabled
      ? 'Off'
      : st?.status === 'due'
        ? 'On screen'
        : st?.nextAt == null
          ? 'Never'
          : s.muted
            ? 'Paused'
            : fmt.soon(st.nextAt, now);
    setText(row.when, when);
    row.when.title = r.enabled && st?.nextAt ? fmt.status(r, st, now) : '';
    if (row.icon !== r.icon) {
      row.tileEl.className = `tile ${tintClass(r.icon)}`;
      row.tileEl.innerHTML = icon(r.icon);
      row.icon = r.icon;
    }
    row.sw.set(r.enabled);
    row.sw.el.setAttribute('aria-label', `${name} on`);
    row.main.setAttribute('aria-label', `${name}, ${fmt.schedule(r.schedule)}, ${r.enabled ? fmt.status(r, st, now) : 'off'}`);
    row.el.classList.toggle('off', !r.enabled);
  }

  function paint(now = Date.now()) {
    const order = sorted(s);
    const ids = order.map((r) => r.id);
    flip(list, () => {
      for (const [id, row] of rows) {
        if (ids.includes(id)) continue;
        leaveItem(row.el);
        rows.delete(id);
      }
      let prev = null;
      for (const r of order) {
        let row = rows.get(r.id);
        const fresh = !row;
        if (fresh) {
          row = makeRow(r);
          rows.set(r.id, row);
        }
        const want = prev ? prev.nextSibling : list.firstChild;
        if (want !== row.el) list.insertBefore(row.el, want);
        fill(row, r, now);
        if (fresh && mounted) enterItem(row.el);
        prev = row.el;
      }
    });
    const on = s.reminders.filter((r) => r.enabled).length;
    setText(summary, s.reminders.length ? `${s.reminders.length} reminder${s.reminders.length === 1 ? '' : 's'}, ${on} on` : 'Nothing set up yet');
    empty.hidden = s.reminders.length > 0;
    list.hidden = s.reminders.length === 0;
    if (highlight && rows.has(highlight) && !mounted) rows.get(highlight).el.classList.add('flash');
    mounted = true;
  }

  paint();
  return {
    el,
    update(next) {
      s = next;
      paint();
    },
    slowTick(now) {
      for (const r of s.reminders) {
        const row = rows.get(r.id);
        if (row) fill(row, r, now);
      }
    },
    focusRow(id) {
      rows.get(id)?.main.focus();
    },
  };
}
