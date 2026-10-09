'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const MAX_BYTES = 512 * 1024;

// %APPDATA%\RemindAni\logs\updater.log: what the updater did, so a failed update can be explained.
function createUpdateLog() {
  const dir = path.join(app.getPath('userData'), 'logs');
  const file = path.join(dir, 'updater.log');
  fs.mkdirSync(dir, { recursive: true });
  try {
    if (fs.statSync(file).size > MAX_BYTES) fs.renameSync(file, `${file}.old`);
  } catch {
    // No log yet.
  }
  const write = (level) => (...parts) => {
    const text = parts.map((p) => (p instanceof Error ? p.stack ?? p.message : typeof p === 'string' ? p : JSON.stringify(p))).join(' ');
    try {
      fs.appendFileSync(file, `${new Date().toISOString()} ${level} ${text}\n`);
    } catch {
      // Logging must never break updating.
    }
  };
  return { file, info: write('info'), warn: write('warn'), error: write('error'), debug: write('debug') };
}

module.exports = { createUpdateLog };
