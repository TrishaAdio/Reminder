'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { AUDIO_EXT, upgrade } = require('./reminders');

const DEFAULT_SETTINGS = {
  defaultWait: 2,
  volume: 0.8,
  theme: 'system',
  position: 'top',
  dim: true,
  quiet: { enabled: false, from: '22:00', to: '07:00' },
  pausedUntil: null,
  companionOn: true,
  companions: [],
};

const IMAGE_EXT = new Set(['.png', '.webp', '.gif', '.jpg', '.jpeg']);
const MAX_COMPANIONS = 24;

class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'reminders.json');
    this.soundsDir = path.join(dir, 'sounds');
    this.companionsDir = path.join(dir, 'companions');
    this.data = { version: 2, settings: structuredClone(DEFAULT_SETTINGS), reminders: [], runtime: {} };
    this.timer = null;
  }

  async load() {
    await fsp.mkdir(this.soundsDir, { recursive: true });
    await fsp.mkdir(this.companionsDir, { recursive: true });
    try {
      const parsed = JSON.parse(await fsp.readFile(this.file, 'utf8'));
      const settings = { ...DEFAULT_SETTINGS, ...parsed.settings };
      settings.quiet = { ...DEFAULT_SETTINGS.quiet, ...parsed.settings?.quiet };
      this.data = {
        version: 2,
        settings,
        reminders: (parsed.reminders ?? []).map(upgrade),
        runtime: parsed.runtime ?? {},
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
    const json = JSON.stringify(this.data, null, 2);
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, json);
    try {
      fs.renameSync(tmp, this.file);
    } catch {
      // Antivirus or indexers on Windows can briefly lock the target; fall back to a direct write.
      fs.writeFileSync(this.file, json);
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

  // Copied in, so the picture keeps working after the original is moved or deleted.
  async importCompanion(source) {
    const ext = path.extname(source).toLowerCase();
    if (!IMAGE_EXT.has(ext)) throw new Error('unsupported');
    const list = this.data.settings.companions;
    if (list.length >= MAX_COMPANIONS) throw new Error('full');
    const file = `${randomUUID()}${ext}`;
    await fsp.copyFile(source, path.join(this.companionsDir, file));
    list.push({ file, name: path.basename(source) });
  }

  async removeCompanion(file) {
    const list = this.data.settings.companions;
    const i = list.findIndex((c) => c.file === file);
    if (i < 0) return;
    list.splice(i, 1);
    await fsp.rm(path.join(this.companionsDir, file), { force: true });
  }

  // Runs at startup only, so a deleted reminder's sound survives until its undo window is long gone.
  async pruneSounds() {
    const used = new Set(this.data.reminders.filter((r) => r.sound.kind === 'file').map((r) => r.sound.file));
    for (const file of await fsp.readdir(this.soundsDir)) {
      if (!used.has(file)) await fsp.rm(path.join(this.soundsDir, file), { force: true });
    }
  }
}

module.exports = Store;
