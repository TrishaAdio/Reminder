'use strict';

const { EventEmitter } = require('node:events');
const { app, Notification } = require('electron');
const FakeUpdater = require('./fake-updater');
const { createUpdateLog } = require('./update-log');
const { startRelaunchGuard } = require('./relaunch-guard');

const SIX_HOURS = 6 * 60 * 60 * 1000;
const FIRST_CHECK = 15_000;

function describe(err) {
  const text = `${err?.code ?? ''} ${err?.message ?? ''}`;
  if (/ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ERR_INTERNET|ERR_NAME|ERR_CONNECTION|ERR_NETWORK/i.test(text)) {
    return 'Couldn’t reach GitHub. Check your connection and try again.';
  }
  if (/\b404\b|No published versions|latest\.yml/i.test(text)) return 'No published release was found on GitHub.';
  if (/sha512|checksum/i.test(text)) return 'The download was damaged. Try again.';
  return 'Something went wrong while updating. Try again.';
}

// State machine behind Settings › About, the Settings badge and the tray entry.
//   unsupported | idle | checking | none | available | downloading | ready | error
class Updates extends EventEmitter {
  constructor({ fake, beforeInstall }) {
    super();
    this.beforeInstall = beforeInstall;
    this.client = fake ? new FakeUpdater(fake) : app.isPackaged ? require('electron-updater').autoUpdater : null;
    this.state = { status: this.client ? 'idle' : 'unsupported', version: null, percent: 0, error: null, checkedAt: null };
    this.manual = false;
    this.lastAction = null;
    if (!this.client) return;

    this.log = createUpdateLog();
    this.log.info(`RemindAni ${app.getVersion()} started${fake ? ` with --fake-update=${fake}` : ''}`);
    if (!fake) {
      this.client.autoDownload = false;
      this.client.autoInstallOnAppQuit = true;
      this.client.logger = this.log;
    }
    this.client.on('checking-for-update', () => this.manual && this.set({ status: 'checking', error: null }));
    this.client.on('update-available', (info) => this.set({ status: 'available', version: info.version, checkedAt: Date.now() }));
    this.client.on('update-not-available', () => this.set({ status: 'none', checkedAt: Date.now() }));
    this.client.on('download-progress', (p) => this.set({ status: 'downloading', percent: Math.round(p.percent) }));
    this.client.on('update-downloaded', (info) => this.set({ status: 'ready', version: info.version, percent: 100 }));
    this.client.on('error', (err) => this.failed(err));
  }

  start() {
    if (!this.client) return;
    setTimeout(() => this.check(false), FIRST_CHECK);
    setInterval(() => this.check(false), SIX_HOURS);
  }

  set(patch) {
    if (patch.status && patch.status !== this.state.status) this.log?.info(`state ${this.state.status} → ${patch.status}${patch.version ? ` ${patch.version}` : ''}`);
    this.state = { ...this.state, ...patch };
    this.emit('change', this.state);
  }

  // Background checks fail quietly; only checks and downloads someone asked for show an error.
  failed(err) {
    this.log?.error(`${this.lastAction ?? 'update'} failed`, err);
    if (!this.manual && this.lastAction === 'check') return;
    this.set({ status: 'error', error: describe(err) });
  }

  check(manual = true) {
    const busy = ['checking', 'downloading', 'ready'].includes(this.state.status);
    if (!this.client || busy) return;
    this.manual = manual;
    this.lastAction = 'check';
    this.client.checkForUpdates().catch((err) => this.failed(err));
  }

  download() {
    if (!this.client || !['available', 'error'].includes(this.state.status) || !this.state.version) return;
    this.manual = true;
    this.lastAction = 'download';
    this.set({ status: 'downloading', percent: 0, error: null });
    this.client.downloadUpdate().catch((err) => this.failed(err));
  }

  // Retrying an error repeats whatever failed.
  retry() {
    if (this.lastAction === 'download') this.download();
    else this.check(true);
  }

  install() {
    if (this.state.status !== 'ready') return;
    this.log.info(`installing ${this.state.version}`);
    this.beforeInstall();
    // The window disappears while the installer runs, so say what is happening.
    if (Notification.isSupported()) {
      new Notification({ title: `Updating RemindAni to ${this.state.version}`, body: 'It opens again by itself in a moment. Your reminders are kept.', silent: true }).show();
    }
    startRelaunchGuard(process.execPath, this.log);
    // Silent install, then relaunch: per-user installs need no admin prompt.
    setImmediate(() => this.client.quitAndInstall(true, true));
  }
}

module.exports = Updates;
