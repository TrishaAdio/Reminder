'use strict';

const { EventEmitter } = require('node:events');
const { app } = require('electron');

// Stand-in for electron-updater, started with --fake-update=<scenario>, so every state of
// the update UI can be seen without publishing a release. It speaks the same events.
//   available       an update is found, downloads, then waits for restart (default)
//   latest          you're up to date
//   error           the first check fails, retry succeeds
//   download-error  the download fails at 40 percent, retry succeeds
const SCENARIOS = new Set(['available', 'latest', 'error', 'download-error']);

class FakeUpdater extends EventEmitter {
  constructor(scenario) {
    super();
    this.scenario = SCENARIOS.has(scenario) ? scenario : 'available';
    this.failures = this.scenario === 'error' || this.scenario === 'download-error' ? 1 : 0;
    const [major, minor] = app.getVersion().split('.').map(Number);
    this.version = `${major}.${minor + 1}.0`;
    this.timer = null;
  }

  checkForUpdates() {
    this.emit('checking-for-update');
    return new Promise((resolve) => {
      setTimeout(() => {
        if (this.scenario === 'error' && this.failures > 0) {
          this.failures--;
          this.emit('error', Object.assign(new Error('net::ERR_INTERNET_DISCONNECTED'), { code: 'ERR_INTERNET_DISCONNECTED' }));
        } else if (this.scenario === 'latest') {
          this.emit('update-not-available', { version: app.getVersion() });
        } else {
          this.emit('update-available', { version: this.version, releaseDate: new Date().toISOString() });
        }
        resolve(null);
      }, 1400);
    });
  }

  downloadUpdate() {
    clearInterval(this.timer);
    let percent = 0;
    const total = 98_000_000;
    return new Promise((resolve) => {
      this.timer = setInterval(() => {
        percent = Math.min(100, percent + 4 + Math.random() * 5);
        if (this.scenario === 'download-error' && this.failures > 0 && percent >= 40) {
          clearInterval(this.timer);
          this.failures--;
          this.emit('error', Object.assign(new Error('Download interrupted'), { code: 'ERR_CONNECTION_RESET' }));
          return resolve([]);
        }
        this.emit('download-progress', { percent, transferred: (total * percent) / 100, total, bytesPerSecond: 4_000_000 });
        if (percent >= 100) {
          clearInterval(this.timer);
          this.emit('update-downloaded', { version: this.version });
          resolve([]);
        }
      }, 260);
    });
  }

  // There is nothing to install, so restarting just quits.
  quitAndInstall() {
    app.quit();
  }
}

module.exports = FakeUpdater;
