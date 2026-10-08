import { h } from './dom.js';
import { icon } from '../shared/icons.js';

export function newView({ api, state, fmt, onCreated }) {
  const first = state.reminders.length === 0;
  const options = state.presets.map((p) =>
    h(
      'li',
      {},
      h(
        'button',
        {
          class: 'row row-button preset pressable',
          type: 'button',
          onclick: async () => onCreated(await api.createReminder(p.id), p.id === 'custom'),
        },
        h('span', { class: 'badge', 'aria-hidden': 'true', html: icon(p.icon) }),
        h(
          'span',
          { class: 'preset-text' },
          h('span', { class: 'preset-name' }, p.id === 'custom' ? 'Something else' : p.name),
          h('span', { class: 'preset-sub t-caption' }, p.id === 'custom' ? 'Your words, your schedule' : fmt.summary(p.schedule)),
        ),
        h('span', { class: 'chevron', html: icon('chevron') }),
      ),
    ),
  );

  const el = h(
    'section',
    { class: 'view', 'aria-labelledby': 'new-title' },
    h('h1', { class: 'view-title t-title', id: 'new-title' }, first ? 'Set up your first reminder' : 'New reminder'),
    h('p', { class: 'view-sub' }, 'Pick a starting point. Wording, schedule and sound can all be changed after.'),
    h('ul', { class: 'group presets', 'aria-label': 'Starting points' }, ...options),
  );

  return {
    el,
    update() {},
    focus: () => el.querySelector('.preset')?.focus(),
  };
}
