import { h } from '../dom.js';
import { icon, tintClass } from '../../shared/icons.js';

export function galleryView({ state, fmt, back, actions }) {
  const cards = state.presets.map((p) => {
    const custom = p.id === 'custom';
    return h(
      'button',
      {
        class: `preset ${tintClass(p.icon)} pressable`,
        type: 'button',
        'aria-label': custom ? 'Start from scratch' : `Add ${p.name}, ${fmt.schedule(p.schedule)}`,
        onclick: () => actions.create(p.id),
      },
      h('span', { class: 'preset-lift', 'aria-hidden': 'true' }),
      h('span', { class: 'tile big', 'aria-hidden': 'true', html: icon(p.icon) }),
      h('span', { class: 'preset-name' }, custom ? 'Start from scratch' : p.name),
      h('span', { class: 'preset-when t-small' }, custom ? 'You choose the words and the time' : fmt.schedule(p.schedule)),
      h('span', { class: 'preset-blurb t-small' }, p.blurb),
      h('span', { class: 'preset-add', 'aria-hidden': 'true', html: icon(custom ? 'chevron' : 'plus') }),
    );
  });
  const el = h(
    'div',
    { class: 'view' },
    back,
    h(
      'header',
      { class: 'page-head' },
      h(
        'div',
        {},
        h('h1', { class: 't-title' }, 'New reminder'),
        h('p', { class: 'page-sub t-small' }, 'One click adds it. Wording, time and sound can all be changed afterwards.'),
      ),
    ),
    h('div', { class: 'gallery' }, ...cards),
  );
  return {
    el,
    update() {},
    focus: () => cards[0]?.focus(),
  };
}
