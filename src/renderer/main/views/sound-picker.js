import { h, setText } from '../dom.js';
import { icon } from '../../shared/icons.js';

const meter = () => h('span', { class: 'meter', 'aria-hidden': 'true' }, ...Array.from({ length: 4 }, () => h('span', { class: 'bar' })));

// Rows: play/stop, name, live level bars, selected check. Clicking a row selects and previews;
// the round button only previews.
export function soundPicker({ sounds, value, player, volume, onSelect, onChoose, onError }) {
  let current = value;
  let vol = volume;
  const rows = [];
  player.warm();

  const playKey = (sound) => (sound.kind === 'file' ? `file:${sound.file}` : sound.id);

  function playButton(getSound, label) {
    const b = h(
      'button',
      { class: 'play pressable', type: 'button', 'aria-label': label, 'aria-pressed': 'false' },
      h('span', { class: 'play-icon', html: icon('play', 'icon solid') }),
      h('span', { class: 'stop-icon', html: icon('stop', 'icon solid') }),
    );
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const sound = getSound();
      if (!sound) return;
      if (player.playing === playKey(sound)) player.stop();
      else preview(sound);
    });
    return b;
  }

  async function preview(sound) {
    const ok = await player.play(playKey(sound), sound, vol);
    onError(ok ? '' : 'This file can’t be played. Try an mp3, wav, m4a or ogg file.');
  }

  for (const s of sounds) {
    const sound = { kind: 'builtin', id: s.id };
    const bars = meter();
    const play = playButton(() => sound, `Play ${s.name}`);
    const row = h(
      'div',
      {
        class: 'sound',
        role: 'radio',
        tabIndex: -1,
        'data-sound': s.id,
        onclick: () => select(sound),
        onkeydown: (e) => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), select(sound)),
      },
      play,
      h('span', { class: 'sound-name' }, s.name),
      bars,
      h('span', { class: 'check', html: icon('check') }),
    );
    rows.push({ row, play, bars, key: s.id, isSelected: () => current.kind === 'builtin' && current.id === s.id });
  }

  const fileName = h('span', { class: 'sound-file t-small' });
  const fileBars = meter();
  const filePlay = playButton(() => (current.kind === 'file' ? current : null), 'Play your sound');
  const choose = h(
    'button',
    {
      class: 'button small pressable',
      type: 'button',
      onclick: (e) => {
        e.stopPropagation();
        onChoose();
      },
    },
    'Choose file…',
  );
  const fileRow = h(
    'div',
    {
      class: 'sound file',
      role: 'radio',
      tabIndex: -1,
      onclick: () => (current.kind === 'file' ? preview(current) : onChoose()),
      onkeydown: (e) => (e.key === ' ' || e.key === 'Enter') && e.target === fileRow && (e.preventDefault(), current.kind === 'file' ? preview(current) : onChoose()),
    },
    filePlay,
    h('span', { class: 'sound-name stack' }, 'Your own sound', fileName),
    fileBars,
    choose,
    h('span', { class: 'check', html: icon('check') }),
  );
  rows.push({ row: fileRow, play: filePlay, bars: fileBars, key: null, isSelected: () => current.kind === 'file' });

  const el = h('div', { class: 'sounds', role: 'radiogroup', 'aria-label': 'Sound' }, ...rows.map((r) => r.row));
  el.addEventListener('keydown', (e) => {
    const i = rows.findIndex((r) => r.row === e.target);
    const delta = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (i < 0 || !delta) return;
    e.preventDefault();
    rows[(i + delta + rows.length) % rows.length].row.focus();
  });

  function select(sound) {
    current = sound;
    paint();
    onSelect(sound);
    preview(sound);
  }

  function paint() {
    for (const r of rows) {
      const on = r.isSelected();
      r.row.setAttribute('aria-checked', String(on));
      r.row.tabIndex = on ? 0 : -1;
    }
    filePlay.disabled = current.kind !== 'file';
    setText(fileName, current.kind === 'file' ? current.name : 'No file chosen');
    paintPlaying(player.playing);
  }

  function rowKey(r) {
    return r.key ?? (current.kind === 'file' ? `file:${current.file}` : null);
  }

  function paintPlaying(key) {
    for (const r of rows) {
      const on = key != null && rowKey(r) === key;
      r.row.classList.toggle('playing', on);
      r.play.setAttribute('aria-pressed', String(on));
      r.play.setAttribute('aria-label', `${on ? 'Stop' : 'Play'} ${r.key ? sounds.find((x) => x.id === r.key).name : 'your sound'}`);
    }
  }

  const offChange = player.onChange(paintPlaying);
  const offLevels = player.onLevels((levels) => {
    const r = rows.find((x) => x.row.classList.contains('playing'));
    if (!r) return;
    [...r.bars.children].forEach((bar, i) => (bar.style.transform = `scaleY(${0.2 + levels[i] * 0.8})`));
  });

  paint();
  return {
    el,
    set(sound, volume) {
      current = sound;
      vol = volume;
      paint();
    },
    destroy() {
      offChange();
      offLevels();
    },
  };
}
