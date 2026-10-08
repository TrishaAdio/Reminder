import { h, setText } from './dom.js';
import { flip, enterItem, leaveItem } from './flip.js';
import { icon } from '../shared/icons.js';

export function createSidebar({ api, onSelect, onNew, onSettings }) {
  const list = h('div', { class: 'list', role: 'listbox', 'aria-label': 'Reminders' });
  const empty = h('p', { class: 'list-empty t-callout', hidden: true }, 'No reminders yet.');
  const settings = h(
    'button',
    { class: 'side-item pressable', type: 'button', title: 'Settings (Ctrl+,)', onclick: onSettings },
    h('span', { html: icon('sliders') }),
    'Settings',
  );
  const el = h(
    'aside',
    { class: 'sidebar' },
    h(
      'div',
      { class: 'titlebar' },
      h('span', { class: 'app-name t-caption' }, 'RemindAni'),
      h('button', {
        class: 'icon-button pressable',
        type: 'button',
        'aria-label': 'New reminder',
        title: 'New reminder (Ctrl+N)',
        html: icon('plus'),
        onclick: onNew,
      }),
    ),
    h('div', { class: 'list-scroll scroll' }, list, empty),
    h('div', { class: 'sidebar-foot' }, settings),
  );

  const rows = new Map();
  let order = [];
  let mounted = false;

  function makeRow(r) {
    const badge = h('span', { class: 'item-icon', 'aria-hidden': 'true' });
    const title = h('span', { class: 'item-title' });
    const sub = h('span', { class: 'item-sub t-caption' });
    const row = h(
      'div',
      { class: 'item', role: 'option', 'data-key': r.id, tabIndex: -1, onclick: () => onSelect(r.id) },
      badge,
      h('span', { class: 'item-text' }, title, sub),
    );
    return { el: row, badge, title, sub, icon: null, enabled: r.enabled };
  }

  function fill(row, r, fmt) {
    const name = r.name.trim() || 'Reminder';
    const summary = r.enabled ? fmt.brief(r.schedule) : 'Off';
    setText(row.title, name);
    setText(row.sub, summary);
    if (row.icon !== r.icon) {
      row.badge.innerHTML = icon(r.icon);
      row.icon = r.icon;
    }
    row.enabled = r.enabled;
    row.el.classList.toggle('off', !r.enabled);
    row.el.setAttribute('aria-label', `${name}, ${summary}`);
  }

  function update(state, fmt, view) {
    order = state.reminders.map((r) => r.id);
    flip(list, () => {
      for (const [id, row] of rows) {
        if (order.includes(id)) continue;
        leaveItem(row.el);
        rows.delete(id);
      }
      let prev = null;
      for (const r of state.reminders) {
        let row = rows.get(r.id);
        const fresh = !row;
        if (fresh) {
          row = makeRow(r);
          rows.set(r.id, row);
        }
        const want = prev ? prev.nextSibling : list.firstChild;
        if (want !== row.el) list.insertBefore(row.el, want);
        fill(row, r, fmt);
        if (fresh && mounted) enterItem(row.el);
        prev = row.el;
      }
    });
    mounted = true;

    const selectedId = view.kind === 'reminder' ? view.id : null;
    for (const [id, row] of rows) {
      const on = id === selectedId;
      row.el.setAttribute('aria-selected', String(on));
      row.el.tabIndex = on || (!selectedId && id === order[0]) ? 0 : -1;
    }
    empty.hidden = order.length > 0;
    settings.classList.toggle('selected', view.kind === 'settings');
    settings.setAttribute('aria-current', view.kind === 'settings' ? 'page' : 'false');
  }

  list.addEventListener('keydown', (e) => {
    const id = e.target.dataset?.key;
    if (!id) return;
    const i = order.indexOf(id);
    const target = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: order.length - 1 }[e.key];
    if (target != null) {
      e.preventDefault();
      const next = order[Math.min(order.length - 1, Math.max(0, target))];
      onSelect(next);
      rows.get(next).el.focus();
    } else if (e.key === ' ') {
      e.preventDefault();
      api.updateReminder(id, { enabled: !rows.get(id).enabled });
    }
  });

  return {
    el,
    update,
    focusSelected: () => list.querySelector('[aria-selected="true"]')?.focus(),
  };
}
