import { h } from '../dom.js';
import { reducedMotion } from '../../shared/spring.js';

// "Created with ♥ by Anirban", at the foot of every page. The heart is drawn (not an emoji,
// so it looks the same everywhere), beats, and sends out a little burst of hearts when clicked.

const HEART = 'M12 21s-8.5-5.4-8.5-11.4C3.5 6.6 5.8 4.5 8.4 4.5c1.6 0 2.9.8 3.6 2 .7-1.2 2-2 3.6-2 2.6 0 4.9 2.1 4.9 5.1C20.5 15.6 12 21 12 21z';
const COLORS = ['#ff375f', '#ff6b9a', '#ff9f43', '#b46bff', '#5aa9ff'];

function heartSvg(id, colors = ['#ff6b9a', '#ff375f']) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${colors[0]}"/><stop offset="1" stop-color="${colors[1]}"/></linearGradient></defs><path d="${HEART}" fill="url(#${id})"/><path d="M8 7.6c-1.3.2-2.2 1.2-2.3 2.5" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.4" stroke-linecap="round"/></svg>`;
}

export function creditFooter() {
  const heart = h('button', { class: 'credit-heart pressable', type: 'button', 'aria-label': 'Send love', title: 'Send love', html: heartSvg('credit-heart-fill') });
  const pill = h('span', { class: 'credit-pill' }, h('span', {}, 'Created with'), heart, h('span', {}, 'by'), h('span', { class: 'credit-name' }, 'Anirban'));
  let bursts = 0;

  heart.addEventListener('click', () => {
    const svg = heart.querySelector('svg');
    svg.animate([{ scale: 1 }, { scale: 0.7, offset: 0.25 }, { scale: 1.35, offset: 0.6 }, { scale: 1 }], { duration: 520, easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)' });
    if (reducedMotion()) return;
    const n = 9;
    for (let i = 0; i < n; i++) {
      const c = COLORS[i % COLORS.length];
      const bit = h('span', { class: 'credit-burst', html: heartSvg(`credit-burst-${bursts}-${i}`, [c, c]) });
      heart.append(bit);
      const a = (-90 + (i - (n - 1) / 2) * 22 + (Math.random() * 10 - 5)) * (Math.PI / 180);
      const d = 34 + Math.random() * 22;
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      const spin = Math.random() * 60 - 30;
      bit
        .animate(
          [
            { translate: '0 0', scale: 0.3, rotate: '0deg', opacity: 1 },
            { translate: `${x}px ${y}px`, scale: 1, rotate: `${spin}deg`, opacity: 1, offset: 0.55 },
            { translate: `${x * 1.15}px ${y * 1.15 - 14}px`, scale: 0.8, rotate: `${spin * 1.5}deg`, opacity: 0 },
          ],
          { duration: 820 + Math.random() * 200, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)', fill: 'forwards' },
        )
        .finished.then(() => bit.remove(), () => bit.remove());
    }
    bursts++;
  });

  return h('footer', { class: 'credit' }, pill);
}
