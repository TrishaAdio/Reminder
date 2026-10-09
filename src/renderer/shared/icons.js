// One set, drawn on a 24px grid with a 1.75 stroke, round caps and joins.
const PATHS = {
  moon: '<path d="M19.5 14.6A7.75 7.75 0 0 1 9.4 4.5a7.75 7.75 0 1 0 10.1 10.1Z"/>',
  book: '<path d="M12 6.6C10.1 5.2 7.4 4.6 4.75 4.75v12.5c2.65-.15 5.35.45 7.25 1.85 1.9-1.4 4.6-2 7.25-1.85V4.75C16.6 4.6 13.9 5.2 12 6.6Z"/><path d="M12 6.6v12.5"/>',
  drop: '<path d="M12 3.75c3.4 4 6.25 7.3 6.25 10.5a6.25 6.25 0 0 1-12.5 0c0-3.2 2.85-6.5 6.25-10.5Z"/><path d="M9.25 14.75a2.9 2.9 0 0 0 2.25 2.5"/>',
  eye: '<path d="M2.75 12S6.1 5.75 12 5.75 21.25 12 21.25 12 17.9 18.25 12 18.25 2.75 12 2.75 12Z"/><circle cx="12" cy="12" r="2.75"/>',
  stretch: '<circle cx="12" cy="4.75" r="1.75"/><path d="M5.5 7.25 12 9.5l6.5-2.25"/><path d="M12 9.5v5"/><path d="m8.75 20.25 3.25-5.75 3.25 5.75"/>',
  sun: '<circle cx="12" cy="12" r="3.75"/><path d="M12 3.25V5M12 19v1.75M3.25 12H5M19 12h1.75M5.8 5.8l1.25 1.25M16.95 16.95l1.25 1.25M5.8 18.2l1.25-1.25M16.95 7.05l1.25-1.25"/>',
  pill: '<path d="M10.6 19.4a4.6 4.6 0 0 1-6.5-6.5l8.8-8.8a4.6 4.6 0 0 1 6.5 6.5Z"/><path d="m8.5 8.5 7 7"/>',
  cup: '<path d="M5.25 9.75h11v3.75a5.5 5.5 0 0 1-11 0Z"/><path d="M16.25 11h.75a2.5 2.5 0 0 1 0 5h-1.25"/><path d="M8.75 3.75c-.55.75-.55 1.5 0 2.25M12.25 3.75c-.55.75-.55 1.5 0 2.25"/>',
  flag: '<path d="M5.75 20.5V4.25"/><path d="M5.75 4.75h11.5l-2.5 4.25 2.5 4.25H5.75"/>',
  plus: '<path d="M12 5.25v13.5M5.25 12h13.5"/>',
  minus: '<path d="M5.25 12h13.5"/>',
  check: '<path d="m5.5 12.5 4.25 4.25 8.75-9.5"/>',
  'check-circle': '<circle cx="12" cy="12" r="8.25"/><path d="m8.5 12.25 2.4 2.4 4.6-4.9"/>',
  close: '<path d="m7 7 10 10M17 7 7 17"/>',
  back: '<path d="m14.5 6-6 6 6 6"/>',
  chevron: '<path d="m9.5 6 6 6-6 6"/>',
  play: '<path d="M8.5 6.6v10.8a.75.75 0 0 0 1.13.65l8.6-5.4a.75.75 0 0 0 0-1.3l-8.6-5.4a.75.75 0 0 0-1.13.65Z"/>',
  stop: '<rect x="7.25" y="7.25" width="9.5" height="9.5" rx="2"/>',
  pause: '<path d="M9 6.5v11M15 6.5v11"/>',
  copy: '<rect x="8.75" y="8.75" width="10.5" height="10.5" rx="2.25"/><path d="M15.25 8.75V6.75a2 2 0 0 0-2-2h-6.5a2 2 0 0 0-2 2v6.5a2 2 0 0 0 2 2h2"/>',
  trash: '<path d="M4.75 6.75h14.5"/><path d="M9.25 6.75V5.25c0-.83.67-1.5 1.5-1.5h2.5c.83 0 1.5.67 1.5 1.5v1.5"/><path d="m6.5 6.75.8 11.55a1.75 1.75 0 0 0 1.75 1.7h5.9a1.75 1.75 0 0 0 1.75-1.7l.8-11.55"/>',
  music: '<path d="M9.25 17.25V6.25l10-2v11"/><circle cx="6.75" cy="17.25" r="2.5"/><circle cx="16.75" cy="15.25" r="2.5"/>',
  speaker: '<path d="M4.75 9.75h3l4.5-3.75v12l-4.5-3.75h-3Z"/><path d="M15.5 9.5a3.5 3.5 0 0 1 0 5"/><path d="M17.9 7.1a6.9 6.9 0 0 1 0 9.8"/>',
  'speaker-low': '<path d="M4.75 9.75h3l4.5-3.75v12l-4.5-3.75h-3Z"/><path d="M15.5 9.5a3.5 3.5 0 0 1 0 5"/>',
  download: '<path d="M12 4.75v10"/><path d="m7.75 10.75 4.25 4.25 4.25-4.25"/><path d="M5.25 19.25h13.5"/>',
  retry: '<path d="M19.25 12a7.25 7.25 0 1 1-2.12-5.13"/><path d="M19.25 4.75v4.5h-4.5"/>',
  alert: '<circle cx="12" cy="12" r="8.25"/><path d="M12 7.75v4.75"/><path d="M12 16.1v.15"/>',
  folder: '<path d="M3.75 7.25c0-.83.67-1.5 1.5-1.5h4l2 2h7.5c.83 0 1.5.67 1.5 1.5v8.5c0 .83-.67 1.5-1.5 1.5H5.25c-.83 0-1.5-.67-1.5-1.5Z"/>',
};

export function icon(name, className = 'icon') {
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`;
}

// Each reminder icon carries a tint, so a reminder looks the same everywhere it appears.
export const TINT = {
  moon: 'indigo',
  book: 'indigo',
  drop: 'blue',
  eye: 'green',
  stretch: 'orange',
  sun: 'orange',
  pill: 'rose',
  cup: 'sand',
  flag: 'sand',
};

export const tintClass = (iconName) => `tint-${TINT[iconName] ?? 'sand'}`;

export const ICON_LABEL = {
  moon: 'Moon',
  book: 'Book',
  drop: 'Water drop',
  eye: 'Eye',
  stretch: 'Person stretching',
  sun: 'Sun',
  pill: 'Pill',
  cup: 'Cup',
  flag: 'Flag',
};

// The app icon itself, matching build/icon.ico: an open ring with a bead resting in the gap.
export function appMark(className = 'app-mark') {
  return `<svg class="${className}" viewBox="0 0 1024 1024" aria-hidden="true" focusable="false">
    <rect x="64" y="64" width="896" height="896" rx="200" fill="#D2731C"/>
    <path d="M 712.92 396.00 A 232 232 0 1 1 512.00 280.00" fill="none" stroke="#FFF6EA" stroke-width="92" stroke-linecap="round"/>
    <circle cx="628.00" cy="311.08" r="54" fill="#FFF6EA"/>
  </svg>`;
}
