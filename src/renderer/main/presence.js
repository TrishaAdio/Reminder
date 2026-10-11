import { spring, reducedMotion, fadeParts, FROSTED, FADE } from '../shared/spring.js';

// Things that come and go. Showing pops in (fade on the smooth spring, scale and rise on the
// release spring); hiding fades out first and only then takes the element out of the layout.
// Frosted surfaces are faded themselves, never through a parent (see spring.js fadeParts).

// The element itself, unless it holds a frosted surface: then its pieces.
const parts = (el) => (el.matches(FROSTED) || !el.querySelector(FROSTED) ? [el] : fadeParts(el));

export function appear(el, { rise = 6, scale = 0.94, delay = 0 } = {}) {
  if (!el.isConnected || !el.getClientRects().length) return;
  if (reducedMotion()) {
    for (const p of parts(el)) p.animate([{ opacity: 0 }, { opacity: 1 }], FADE);
    return;
  }
  el.animate([{ translate: `0 ${rise}px`, scale }, { translate: '0 0', scale: 1 }], { ...spring('release'), delay, fill: 'backwards', composite: 'add' });
  for (const p of parts(el)) p.animate([{ opacity: 0 }, { opacity: 1 }], { ...spring('smooth'), delay, fill: 'backwards' });
}

// Sets `hidden`, animating the change. Returns whether anything changed.
export function setShown(el, show) {
  const leaving = el.dataset.presence === 'leaving';
  if (show) {
    if (!el.hidden && !leaving) return false;
    delete el.dataset.presence;
    el.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    el.hidden = false;
    appear(el);
    return true;
  }
  if (el.hidden || leaving) return false;
  if (!el.isConnected || !el.getClientRects().length) {
    el.hidden = true;
    return true;
  }
  el.dataset.presence = 'leaving';
  const timing = reducedMotion() ? FADE : spring('exit');
  const fades = parts(el).map((p) => p.animate([{ opacity: 1 }, { opacity: 0 }], { ...timing, fill: 'forwards' }).finished);
  if (!reducedMotion()) el.animate([{ scale: 1 }, { scale: 0.96 }], { ...timing, fill: 'forwards', composite: 'add' });
  Promise.all(fades)
    .catch(() => {})
    .then(() => {
      if (el.dataset.presence !== 'leaving') return;
      delete el.dataset.presence;
      el.hidden = true;
      el.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    });
  return true;
}

// Animates an element's height from what it was to what it is now (after a content change),
// so everything below it glides instead of jumping. One element, short spring: cheap.
export function settleHeight(el, from) {
  if (reducedMotion() || from == null || !el.isConnected) return;
  const to = el.offsetHeight;
  if (Math.abs(to - from) < 1) return;
  el.animate([{ height: `${from}px` }, { height: `${to}px` }], spring('layout'));
}
