'use strict';

const { execFile } = require('node:child_process');
const { app } = require('electron');

// Windows lets people pick 24-hour time independently of their region; Intl does not see it.
function readHourCycle() {
  if (process.platform !== 'win32') return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile(
      'reg',
      ['query', 'HKCU\\Control Panel\\International', '/v', 'sShortTime'],
      { windowsHide: true, timeout: 3000 },
      (err, stdout) => {
        const match = !err && /sShortTime\s+REG_SZ\s+(.+)/.exec(stdout);
        resolve(match ? (match[1].includes('H') ? 'h23' : 'h12') : null);
      },
    );
  });
}

async function loadLocale() {
  const locale = app.getSystemLocale() || 'en-US';
  const hourCycle =
    (await readHourCycle()) ?? new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hourCycle;
  const timeFormat = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', hourCycle });
  return { locale, hourCycle, formatTime: (ms) => timeFormat.format(ms) };
}

module.exports = { loadLocale };
