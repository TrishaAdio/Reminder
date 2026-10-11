import { spring, reducedMotion } from '../shared/spring.js';

// Text that changes the way iOS numbers do: only the part that changed rolls. "In 9 min" →
// "In 8 min" rolls the 9 up and out (with a touch of blur) while the 8 rises in, and " min"
// slides over if the width changed. When most of the text changes, the whole line rolls.
// Transform, opacity and a small filter only; reduced motion just swaps the text.

const OUT = (dy) => [
  { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' },
  { opacity: 0, transform: `translateY(${-dy}%)`, filter: 'blur(3px)' },
];
const IN = (dy) => [
  { opacity: 0, transform: `translateY(${dy}%)`, filter: 'blur(3px)' },
  { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' },
];

const span = (cls, text) => {
  const el = document.createElement('span');
  el.className = cls;
  el.textContent = text;
  return el;
};

export function morphText(el, next, { direction = 1 } = {}) {
  const prev = el.dataset.text ?? el.textContent;
  if (prev === next && el.dataset.text != null) return;
  el.dataset.text = next;
  el.setAttribute('aria-label', next);
  if (!prev || reducedMotion() || !el.isConnected || !el.getClientRects().length) {
    el.replaceChildren(span('m-all', next));
    return;
  }

  let a = 0;
  while (a < prev.length && a < next.length && prev[a] === next[a]) a++;
  let b = 0;
  while (b < prev.length - a && b < next.length - a && prev[prev.length - 1 - b] === next[next.length - 1 - b]) b++;
  const oldMid = prev.slice(a, prev.length - b);
  const newMid = next.slice(a, next.length - b);
  const smooth = spring('smooth');
  const dy = 55 * direction;

  // Small change inside a line (digits, a word): roll just that part.
  if (Math.max(oldMid.length, newMid.length) <= 6 && (a > 0 || b > 0)) {
    const oldTail = el.querySelector(':scope > .m-tail');
    const tailBefore = oldTail?.getBoundingClientRect().left;
    // The new part and the old one (a ghost on top of it) roll separately inside one slot.
    const fresh = span('m-new', newMid);
    const ghost = span('m-ghost', oldMid);
    ghost.setAttribute('aria-hidden', 'true');
    const mid = document.createElement('span');
    mid.className = 'm-mid';
    mid.append(fresh, ghost);
    const tail = span('m-tail', next.slice(next.length - b));
    el.replaceChildren(span('m-head', next.slice(0, a)), mid, tail);
    ghost.animate(OUT(dy), { ...smooth, fill: 'forwards' }).finished.then(() => ghost.remove(), () => ghost.remove());
    if (newMid) fresh.animate(IN(dy), smooth);
    if (tailBefore != null) {
      const dx = tailBefore - tail.getBoundingClientRect().left;
      if (Math.abs(dx) > 0.5) tail.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], spring('layout'));
    }
    return;
  }

  // Most of it changed: the whole line rolls.
  const ghost = span('m-ghost m-ghost-all', prev);
  ghost.setAttribute('aria-hidden', 'true');
  const all = span('m-all', next);
  el.replaceChildren(all, ghost);
  ghost.animate(OUT(dy * 0.6), { ...smooth, fill: 'forwards' }).finished.then(() => ghost.remove(), () => ghost.remove());
  all.animate(IN(dy * 0.6), smooth);
}
