// Starts the relaunch guard from plain Node (no Electron) against a dummy target, exits, and
// leaves it running, to tell "the script is broken" apart from "something kills it".
const path = require('path');
const fs = require('fs');
const Module = require('module');
const fakeElectron = { app: {} };
const orig = Module._load;
Module._load = (req, ...rest) => (req === 'electron' ? fakeElectron : orig(req, ...rest));
const { startRelaunchGuard } = require(path.resolve('src/main/relaunch-guard.js'));
const lines = [];
for (const detached of [true, false]) {
  const logFile = path.join(process.env.TEMP, `guard-smoke-${detached ? 'detached' : 'attached'}.log`);
  try { fs.rmSync(logFile); } catch {}
  startRelaunchGuard(path.join(process.env.WINDIR, 'System32', detached ? 'notepad.exe' : 'charmap.exe'), {
    file: logFile,
    info: (m) => lines.push(m),
    error: (m, e) => lines.push(`${m} ${e}`),
  }, { detached });
}
console.log(lines.join('\n'));
