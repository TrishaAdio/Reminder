'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { AUDIO_EXT } = require('./reminders');

const DEFAULTS = {
  version: 1,
  settings: { defaultWait: 2, volume: 0.8 },
  reminders: [],
  runtime: {},
};

class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'reminders.json');
    this.soundsDir = path.join(dir, 'sounds');
    this.data = structuredClone(DEFAULTS);
    this.timer = null;
  }

  async load() {
    await fsp.mkdir(this.soundsDir, { recursive: true });
    try {
      const parsed = JSON.parse(await fsp.readFile(this.file, 'utf8'));
      this.data = {
        ...structuredClone(DEFAULTS),
        ...parsed,
        settings: { ...DEFAULTS.settings, ...parsed.settings },
      };
    } catch (err) {
      // Keep an unreadable file for inspection instead of silently overwriting it.
      if (err.code !== 'ENOENT') await fsp.rename(this.file, `${this.file}.unreadable-${Date.now()}`).catch(() => {});
    }
  }

  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 250);
  }

  flush() {
    clearTimeout(this.timer);
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    try {
      fs.renameSync(tmp, this.file);
    } catch {
      // Antivirus or indexers on Windows can briefly lock the target; fall back to a direct write.
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
      fs.rmSync(tmp, { force: true });
    }
  }

  soundExists(file) {
    return path.basename(file) === file && fs.existsSync(path.join(this.soundsDir, file));
  }

  async importSound(source) {
    const ext = path.extname(source).toLowerCase();
    if (!AUDIO_EXT.has(ext)) throw new Error('unsupported');
    const file = `${randomUUID()}${ext}`;
    await fsp.copyFile(source, path.join(this.soundsDir, file));
    return { kind: 'file', file, name: path.basename(source) };
  }

  async pruneSounds() {
    const used = new Set(this.data.reminders.filter((r) => r.sound.kind === 'file').map((r) => r.sound.file));
    for (const file of await fsp.readdir(this.soundsDir)) {
      if (!used.has(file)) await fsp.rm(path.join(this.soundsDir, file), { force: true });
    }
  }
}

module.exports = Store;
