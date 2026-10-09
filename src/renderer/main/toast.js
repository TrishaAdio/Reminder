import { h } from './dom.js';
import { animate, reducedMotion, FADE } from '../shared/spring.js';

const LIFETIME = 6000;

// One toast at a time at the bottom of the window. A new one replaces the old.
export function createToaster() {
  const host = h('div', { class: 'toast-host', role: 'status', 'aria-live': 'polite' });
  let current = null;

  function dismiss(t = current) {
    if (!t || t.gone) return;
    t.gone = true;
    clearTimeout(t.timer);
    if (current === t) current = null;
    const out = reducedMotion()
      ? [{ opacity: 1 }, { opacity: 0 }]
      : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(12px) scale(0.96)' }];
    animate(t.el, out, reducedMotion() ? FADE : 'exit').then(() => t.el.remove());
  }

  function show(message, action) {
    dismiss();
    const t = { gone: false, timer: null, el: null };
    const button = action
      ? h('button', {
          class: 'toast-action pressable',
          type: 'button',
          onclick: () => {
            dismiss(t);
            action.run();
          },
        }, action.label)
      : null;
    t.el = h('div', { class: 'toast' }, h('span', { class: 'toast-text' }, message), button);
    // Hovering or focusing the toast holds it, so Undo never disappears under the pointer.
    const hold = () => clearTimeout(t.timer);
    const release = () => {
      clearTimeout(t.timer);
      t.timer = setTimeout(() => dismiss(t), LIFETIME / 2);
    };
    t.el.addEventListener('pointerenter', hold);
    t.el.addEventListener('pointerleave', release);
    t.el.addEventListener('focusin', hold);
    t.el.addEventListener('focusout', release);
    host.append(t.el);
    current = t;
    const into = reducedMotion()
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ opacity: 0, transform: 'translateY(16px) scale(0.96)' }, { opacity: 1, transform: 'none' }];
    animate(t.el, into, reducedMotion() ? FADE : 'enter');
    t.timer = setTimeout(() => dismiss(t), LIFETIME);
  }

  return { el: host, show, dismiss: () => dismiss() };
}
