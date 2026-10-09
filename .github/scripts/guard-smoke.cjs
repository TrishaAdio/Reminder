// Starts the relaunch guard from plain Node (no Electron) against a dummy target, exits, and
// leaves it running, to tell "the script is broken" apart from "something kills it".
const path = require('path');
const fs = require('fs');
const Module = require('module');
const fakeElectron = { app: {} };
const orig = Module._load;
Module._load = (req, ...rest) => (req === 'electron' ? fakeElectron : orig(req, ...rest));
const { startRelaunchGuard } = require(path.resolve('src/main/relaunch-guard.js'));
const logFile = path.join(process.env.TEMP, 'guard-smoke.log');
try { fs.rmSync(logFile); } catch {}
const lines = [];
startRelaunchGuard(path.join(process.env.WINDIR, 'System32', 'notepad.exe'), {
  file: logFile,
  info: (m) => lines.push(m),
  error: (m, e) => lines.push(`${m} ${e}`),
});
console.log(lines.join('\n'));
