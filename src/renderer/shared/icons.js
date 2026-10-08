// One set, drawn on a 24px grid with a 1.75 stroke, round caps and joins. Shown at 20px.
const PATHS = {
  moon: '<path d="M19.5 14.6A7.75 7.75 0 0 1 9.4 4.5a7.75 7.75 0 1 0 10.1 10.1Z"/>',
  drop: '<path d="M12 3.75c3.4 4 6.25 7.3 6.25 10.5a6.25 6.25 0 0 1-12.5 0c0-3.2 2.85-6.5 6.25-10.5Z"/><path d="M9.25 14.75a2.9 2.9 0 0 0 2.25 2.5"/>',
  eye: '<path d="M2.75 12S6.1 5.75 12 5.75 21.25 12 21.25 12 17.9 18.25 12 18.25 2.75 12 2.75 12Z"/><circle cx="12" cy="12" r="2.75"/>',
  stretch: '<circle cx="12" cy="4.75" r="1.75"/><path d="M5.5 7.25 12 9.5l6.5-2.25"/><path d="M12 9.5v5"/><path d="m8.75 20.25 3.25-5.75 3.25 5.75"/>',
  pill: '<path d="M10.6 19.4a4.6 4.6 0 0 1-6.5-6.5l8.8-8.8a4.6 4.6 0 0 1 6.5 6.5Z"/><path d="m8.5 8.5 7 7"/>',
  flag: '<path d="M5.75 20.5V4.25"/><path d="M5.75 4.75h11.5l-2.5 4.25 2.5 4.25H5.75"/>',
  plus: '<path d="M12 5.25v13.5M5.25 12h13.5"/>',
  minus: '<path d="M5.25 12h13.5"/>',
  check: '<path d="m5.5 12.5 4.25 4.25 8.75-9.5"/>',
  close: '<path d="m7 7 10 10M17 7 7 17"/>',
  chevron: '<path d="m9.5 6 6 6-6 6"/>',
  play: '<path d="M8.25 6.1v11.8a.6.6 0 0 0 .9.5l9.4-5.9a.6.6 0 0 0 0-1L9.15 5.6a.6.6 0 0 0-.9.5Z"/>',
  sliders: '<path d="M4.75 7.5h8.5M17.25 7.5h2M4.75 16.5h2M10.75 16.5h8.5"/><circle cx="15.25" cy="7.5" r="2"/><circle cx="8.75" cy="16.5" r="2"/>',
  file: '<path d="M13.25 3.75H7.5a1.75 1.75 0 0 0-1.75 1.75v13a1.75 1.75 0 0 0 1.75 1.75h9a1.75 1.75 0 0 0 1.75-1.75V8.75Z"/><path d="M13.25 3.75v5h5"/>',
  alert: '<circle cx="12" cy="12" r="8.25"/><path d="M12 7.75v4.75"/><path d="M12 16.1v.15"/>',
};

export function icon(name, className = 'icon') {
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`;
}
