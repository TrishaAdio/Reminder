'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { app } = require('electron');

// Fades other apps' sound (music, videos) down before a reminder and back up afterwards,
// through RemindAni-Audio.exe (build/audio/duck.cs). It only changes each app's own volume
// in the Windows mixer; the system volume and RemindAni's sound are left alone.
//
// The helper is a plain console-less exe started with pipes, and it is only running while
// something is faded: it starts on duck() and leaves once everything is restored.

const HELPER = 'RemindAni-Audio.exe';

function helperPath() {
  const file = app.isPackaged ? path.join(process.resourcesPath, HELPER) : path.join(app.getAppPath(), 'build', 'bin', HELPER);
  return fs.existsSync(file) ? file : null;
}

class AudioDucker {
  constructor({ enabled, log }) {
    this.enabled = enabled;
    this.log = log ?? (() => {});
    this.child = null;
    this.ducked = false;
    this.supported = process.platform === 'win32' && helperPath() != null;
  }

  start() {
    if (this.child) return this.child;
    const file = helperPath();
    if (!file) {
      this.supported = false;
      this.log(`audio helper not found; other apps' sound won't fade`);
      return null;
    }
    const state = path.join(app.getPath('userData'), 'audio-fade.tsv');
    // Its own name (RemindAni, or electron while developing) is left out of the fade.
    const own = path.parse(process.execPath).name;
    const child = spawn(file, ['--exclude', own, '--state', state], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
    child.stdout.setEncoding('utf8');
    let buffer = '';
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let i;
      while ((i = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, i).trim();
        buffer = buffer.slice(i + 1);
        if (line) this.log(`audio helper: ${line}`);
        // Everything is back where it was: let the helper go.
        if (line === 'restored' && !this.ducked && this.child === child) {
          child.stdin.end();
          this.child = null;
        }
      }
    });
    child.on('error', (err) => {
      this.log(`audio helper failed: ${err.message}`);
      if (this.child === child) this.child = null;
      this.ducked = false;
    });
    child.on('exit', () => {
      if (this.child === child) this.child = null;
    });
    child.stdin.on('error', () => {});
    this.child = child;
    return child;
  }

  send(line) {
    const child = this.start();
    if (child?.stdin.writable) child.stdin.write(`${line}\n`);
  }

  // Fade other apps to silence over `ms`. Calling it again while faded is harmless.
  duck(ms) {
    if (!this.enabled || !this.supported) return;
    if (this.ducked) return;
    this.ducked = true;
    this.send(`duck ${Math.max(0, Math.round(ms))}`);
  }

  // Fade them back to where they were over `ms`.
  restore(ms) {
    if (!this.ducked) return;
    this.ducked = false;
    if (this.child) this.send(`restore ${Math.max(0, Math.round(ms))}`);
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.restore(1500);
  }

  // On quit: a quick restore; the helper finishes it on its own after RemindAni is gone.
  quit() {
    this.restore(500);
    this.child?.stdin.end();
  }
}

module.exports = { AudioDucker };
