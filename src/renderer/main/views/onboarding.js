import { h, setText } from '../dom.js';
import { segmented } from '../controls.js';
import { icon, tintClass, appMark } from '../../shared/icons.js';
import { animate, reducedMotion } from '../../shared/spring.js';
import { livePicture } from '../live-picture.js';

// First-time setup: welcome, your name, your look, a first reminder or two, done. The live
// picture stands on the left the whole way and reacts to each step; the steps slide on the
// right. Everything is saved as it's chosen, so closing the window halfway loses nothing.

const STARTERS = ['water', 'eyes', 'stretch', 'bedtime', 'medicine'];

function greetingFor(hour) {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17) return 'Good evening';
  return 'Hello';
}

export function onboardingView({ api, state, fmt, done }) {
  let s = state;
  let name = (s.settings.userName ?? '').trim();
  const picked = new Set(s.reminders.length ? [] : ['water']);
  const steps = ['welcome', 'name', 'look', ...(s.reminders.length ? [] : ['first']), 'ready'];
  let index = 0;

  // ── The picture ──
  const live = livePicture({ className: 'setup-figure' });
  const list = s.settings.companionOn ? s.settings.companions : [];
  const companion = list.length ? list[Math.floor(Math.random() * list.length)] : null;
  if (companion) live.setSource(`../companion/${companion.builtin ? 'builtin' : 'user'}/${encodeURIComponent(companion.file)}`, companion.name ?? '');
  const stage = h('div', { class: 'setup-stage', 'aria-hidden': companion ? null : 'true' }, companion ? live.el : h('span', { class: 'setup-mark', html: appMark('setup-app-mark') }));
  live.img.addEventListener('load', () => setTimeout(() => {
    live.wave();
    live.say('Hi! I’m so glad you’re here.');
  }, 500), { once: true });

  // ── Progress dots and the step area ──
  const dots = h('div', { class: 'setup-dots', 'aria-hidden': 'true' }, ...steps.map(() => h('span', { class: 'setup-dot' })));
  const body = h('div', { class: 'setup-body' });
  const el = h('div', { class: 'view setup' }, h('div', { class: 'setup-grid' }, stage, h('div', { class: 'setup-side' }, dots, body)));

  const nameFace = (text) => h('span', { class: 'today-name' }, text);
  const primary = (label, onclick, extra = {}) => h('button', { class: 'button primary setup-next pressable', type: 'button', onclick, ...extra }, label);
  const quiet = (label, onclick) => h('button', { class: 'button quiet pressable', type: 'button', onclick }, label);

  function welcome() {
    return h(
      'section',
      { class: 'setup-step' },
      h('p', { class: 'setup-eyebrow t-small' }, 'Welcome to RemindAni'),
      h('h1', { class: 'setup-title' }, 'Reminders that are a pleasure to answer'),
      h('p', { class: 'setup-sub' }, 'A friendly card pops up when it’s time for water, a stretch or bed. Answer Done and there’s a little celebration.'),
      h('div', { class: 'setup-actions' }, primary('Let’s get started', () => step(1))),
    );
  }

  function nameStep() {
    const preview = h('p', { class: 'setup-preview t-title' });
    const input = h('input', {
      class: 'setup-input',
      type: 'text',
      maxLength: 32,
      value: name,
      placeholder: 'Your name',
      spellcheck: 'false',
      autocomplete: 'off',
      'aria-label': 'Your name',
    });
    const next = primary('Continue', () => submit());
    let typing = 0;
    const paint = () => {
      const n = input.value.trim();
      preview.replaceChildren(`${greetingFor(new Date().getHours())}${n ? ', ' : ''}`, n ? nameFace(n) : '');
      next.disabled = !n;
    };
    input.addEventListener('input', () => {
      paint();
      clearTimeout(typing);
      const n = input.value.trim();
      if (n) typing = setTimeout(() => live.say(`Nice to meet you, ${n}!`), 700);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) submit();
    });
    function submit() {
      name = input.value.trim();
      if (!name) return;
      api.setSetting('userName', name);
      live.hop();
      step(2);
    }
    paint();
    const section = h(
      'section',
      { class: 'setup-step' },
      h('p', { class: 'setup-eyebrow t-small' }, 'Step 1'),
      h('h1', { class: 'setup-title' }, 'What should I call you?'),
      h('p', { class: 'setup-sub' }, 'It’s only kept on this PC, and you can change it in Settings.'),
      h('label', { class: 'setup-field' }, input),
      h('div', { class: 'setup-preview-box', 'aria-live': 'polite' }, h('span', { class: 'setup-preview-label t-micro' }, 'Your home page will say'), preview),
      h('div', { class: 'setup-actions' }, quiet('Back', () => step(0, true)), next, quiet('Skip', () => step(2))),
    );
    section.focusFirst = () => input.focus();
    return section;
  }

  function lookStep() {
    const option = (value, title, sub) =>
      h(
        'button',
        { class: `setup-look pressable`, type: 'button', role: 'radio', 'data-look': value, onclick: () => choose(value) },
        h('span', { class: 'setup-look-art', 'aria-hidden': 'true' }, h('span', { class: 'art-card' }), h('span', { class: 'art-card small' }), h('span', { class: 'art-bar' })),
        h('span', { class: 'setup-look-name' }, title),
        h('span', { class: 'setup-look-sub t-small' }, sub),
        h('span', { class: 'setup-look-check', html: icon('check') }),
      );
    const options = [option('classic', 'Classic', 'Warm, calm and solid'), option('glass', 'Glass', 'Frosted and see-through, like iOS')];
    const group = h('div', { class: 'setup-looks', role: 'radiogroup', 'aria-label': 'Style' }, ...options);
    const theme = segmented({
      options: [
        { value: 'system', label: 'System' },
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ],
      value: s.settings.theme,
      label: 'Appearance',
      onChange: (v) => api.setSetting('theme', v),
    });
    function choose(v) {
      api.setSetting('look', v);
      paint(v);
      live.say(v === 'glass' ? 'Ooh, shiny!' : 'Cosy. Good choice.', 2600);
    }
    function paint(v = s.settings.look) {
      for (const o of options) o.setAttribute('aria-checked', String(o.dataset.look === v));
    }
    paint();
    const section = h(
      'section',
      { class: 'setup-step' },
      h('p', { class: 'setup-eyebrow t-small' }, 'Step 2'),
      h('h1', { class: 'setup-title' }, name ? h('span', {}, 'Pick your look, ', nameFace(name)) : 'Pick your look'),
      h('p', { class: 'setup-sub' }, 'Both are in Settings later, too.'),
      group,
      h('div', { class: 'setup-theme' }, h('span', { class: 'field-label' }, 'Appearance'), h('div', { class: 'seg-fixed' }, theme.el)),
      h('div', { class: 'setup-actions' }, quiet('Back', () => step(1, true)), primary('Continue', () => step(3))),
    );
    section.update = () => {
      paint();
      theme.set(s.settings.theme);
    };
    return section;
  }

  function firstStep() {
    const presets = s.presets.filter((p) => STARTERS.includes(p.id));
    const add = primary('', () => finish());
    const chips = presets.map((p) => {
      const chip = h(
        'button',
        { class: `setup-chip ${tintClass(p.icon)} pressable`, type: 'button', 'aria-pressed': String(picked.has(p.id)), onclick: () => flip(p.id, chip) },
        h('span', { class: 'tile small', 'aria-hidden': 'true', html: icon(p.icon) }),
        h('span', { class: 'setup-chip-text' }, h('span', { class: 'setup-chip-name' }, p.name), h('span', { class: 'setup-chip-when t-small' }, fmt.schedule(p.schedule))),
        h('span', { class: 'setup-chip-check', html: icon('check') }),
      );
      return chip;
    });
    const paint = () => {
      setText(add, picked.size ? `Add ${picked.size} reminder${picked.size === 1 ? '' : 's'}` : 'Continue');
    };
    function flip(id, chip) {
      if (picked.has(id)) picked.delete(id);
      else picked.add(id);
      chip.setAttribute('aria-pressed', String(picked.has(id)));
      paint();
    }
    async function finish() {
      add.disabled = true;
      for (const id of picked) await api.createReminder(id);
      if (picked.size) live.say(picked.size === 1 ? 'Got it! I’ll remind you.' : `Got all ${picked.size}! Leave it to me.`);
      step(steps.indexOf('ready'));
    }
    paint();
    return h(
      'section',
      { class: 'setup-step' },
      h('p', { class: 'setup-eyebrow t-small' }, 'Step 3'),
      h('h1', { class: 'setup-title' }, 'What should I remind you about?'),
      h('p', { class: 'setup-sub' }, 'Pick a few to start. Times, words and sounds can all be changed later.'),
      h('div', { class: 'setup-chips' }, ...chips),
      h('div', { class: 'setup-actions' }, quiet('Back', () => step(2, true)), add),
    );
  }

  function ready() {
    const n = name;
    setTimeout(() => {
      live.hop();
      live.say(n ? `Yay! See you soon, ${n}!` : 'Yay! See you soon!');
    }, 260);
    const go = primary('Go to my home page', () => {
      api.setSetting('onboarded', true);
      done();
    });
    const section = h(
      'section',
      { class: 'setup-step' },
      h('p', { class: 'setup-eyebrow t-small' }, 'All done'),
      h('h1', { class: 'setup-title' }, n ? h('span', {}, 'You’re all set, ', nameFace(n), '!') : 'You’re all set!'),
      h('p', { class: 'setup-sub' }, 'RemindAni lives in the tray by the clock. Closing this window keeps it running; reminders still come up on time.'),
      // No way back from here: reminders picked a step ago are already added.
      h('div', { class: 'setup-actions' }, go),
    );
    section.focusFirst = () => go.focus();
    hearts(section);
    return section;
  }

  // A small shower of hearts behind the last step.
  function hearts(section) {
    if (reducedMotion()) return;
    const layer = h('span', { class: 'setup-hearts', 'aria-hidden': 'true' });
    section.prepend(layer);
    for (let i = 0; i < 14; i++) {
      const bit = h('i', { style: `left:${4 + Math.random() * 92}%; --hue:${[350, 12, 300, 240, 155][i % 5]}` });
      layer.append(bit);
      bit.animate(
        [
          { translate: '0 20px', scale: 0.4, opacity: 0, rotate: '0deg' },
          { opacity: 1, offset: 0.2 },
          { translate: `${Math.random() * 40 - 20}px -${140 + Math.random() * 120}px`, scale: 1, opacity: 0, rotate: `${Math.random() * 60 - 30}deg` },
        ],
        { duration: 1800 + Math.random() * 1200, delay: 200 + i * 90, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)', fill: 'both' },
      );
    }
  }

  const BUILD = { welcome, name: nameStep, look: lookStep, first: firstStep, ready };
  let current = null;

  function step(next, back = false) {
    index = Math.max(0, Math.min(steps.length - 1, next));
    const old = current;
    current = BUILD[steps[index]]();
    [...dots.children].forEach((d, i) => d.classList.toggle('on', i <= index));
    body.append(current);
    if (old) {
      old.inert = true;
      old.classList.add('leaving');
      const dx = back ? 28 : -28;
      animate(old, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${dx}px)` }], 'exit').then(() => old.remove());
      animate(current, [{ opacity: 0, transform: `translateX(${-dx}px)` }, { opacity: 1, transform: 'none' }], 'layout');
    }
    requestAnimationFrame(() => (current.focusFirst ? current.focusFirst() : current.querySelector('.setup-next')?.focus()));
  }

  step(0);
  return {
    el,
    update(next) {
      s = next;
      current?.update?.();
    },
    focus() {},
    destroy() {
      live.destroy();
    },
  };
}
