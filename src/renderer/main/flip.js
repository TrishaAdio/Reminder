import { animate, stop, reducedMotion, FADE } from '../shared/spring.js';

const keyed = (container) => [...container.querySelectorAll(':scope > [data-key]:not(.leaving)')];

// FLIP: measure, mutate, then spring every moved child from its old place to its new one.
export function flip(container, mutate) {
  const before = new Map(keyed(container).map((el) => [el.dataset.key, el.getBoundingClientRect().top]));
  for (const el of keyed(container)) {
    stop(el);
    el.style.transform = '';
  }
  mutate();
  if (reducedMotion()) return;
  for (const el of keyed(container)) {
    const top = before.get(el.dataset.key);
    if (top == null || el.hidden) continue;
    const dy = top - el.getBoundingClientRect().top;
    if (Math.abs(dy) > 0.5) animate(el, [{ transform: `translateY(${dy}px)` }, { transform: 'none' }], 'layout');
  }
}

export function enterItem(el) {
  if (reducedMotion()) return animate(el, [{ opacity: 0 }, { opacity: 1 }], FADE);
  return animate(el, [{ opacity: 0, transform: 'translateY(-4px) scale(0.98)' }, { opacity: 1, transform: 'none' }], 'enter');
}

// The leaving element is lifted out of flow first so its neighbours can close the gap.
export function leaveItem(el) {
  const { offsetTop, offsetLeft, offsetWidth } = el;
  el.classList.add('leaving');
  el.inert = true;
  Object.assign(el.style, { position: 'absolute', top: `${offsetTop}px`, left: `${offsetLeft}px`, width: `${offsetWidth}px` });
  const keyframes = reducedMotion()
    ? [{ opacity: 1 }, { opacity: 0 }]
    : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.98)' }];
  animate(el, keyframes, reducedMotion() ? FADE : 'exit').then(() => el.remove());
}
