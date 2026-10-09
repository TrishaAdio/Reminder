import { h } from './dom.js';
import { animate, reducedMotion, FADE } from '../shared/spring.js';
import { icon, tintClass, ICON_LABEL } from '../shared/icons.js';

let open = null;

export function closePopover() {
  open?.close(true);
}

// Grid of icon tiles anchored under `anchor`. Arrow keys move, Enter picks, Esc closes.
export function iconPicker({ anchor, icons, value, onPick }) {
  closePopover();
  const columns = 3;
  const buttons = icons.map((name) =>
    h(
      'button',
      {
        class: `pick ${tintClass(name)} pressable`,
        type: 'button',
        role: 'radio',
        'aria-checked': String(name === value),
        'aria-label': ICON_LABEL[name] ?? name,
        tabIndex: name === value ? 0 : -1,
        html: icon(name),
        onclick: () => {
          onPick(name);
          close(true);
        },
      },
    ),
  );
  const el = h('div', { class: 'popover', role: 'radiogroup', 'aria-label': 'Icon' }, ...buttons);
  const rect = anchor.getBoundingClientRect();
  el.style.left = `${rect.left}px`;
  el.style.top = `${rect.bottom + 8}px`;
  document.body.append(el);
  (buttons[icons.indexOf(value)] ?? buttons[0]).focus();
  animate(
    el,
    reducedMotion() ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'scale(0.94)' }, { opacity: 1, transform: 'none' }],
    reducedMotion() ? FADE : 'enter',
  );

  const onKey = (e) => {
    const i = buttons.indexOf(document.activeElement);
    const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }[e.key];
    if (e.key === 'Escape') {
      e.stopPropagation();
      close(true);
    } else if (delta && i >= 0) {
      e.preventDefault();
      buttons[(i + delta + buttons.length) % buttons.length].focus();
    }
  };
  const onDown = (e) => {
    if (!el.contains(e.target) && !anchor.contains(e.target)) close(false);
  };
  el.addEventListener('keydown', onKey);
  setTimeout(() => document.addEventListener('pointerdown', onDown, true));

  function close(refocus) {
    if (open !== api) return;
    open = null;
    document.removeEventListener('pointerdown', onDown, true);
    animate(el, [{ opacity: 1 }, { opacity: 0 }], FADE).then(() => el.remove());
    if (refocus) anchor.focus();
  }
  const api = { close };
  open = api;
  return api;
}
