// Runs the relaunch guard's PowerShell synchronously (shortened deadline) and prints its errors.
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const src = fs.readFileSync(path.resolve('src/main/relaunch-guard.js'), 'utf8');
const mod = { exports: {} };
new Function('module', 'require', `${src}\nmodule.exports.script = script;`)(mod, (r) => (r === 'node:child_process' ? {} : require(r)));
const logFile = path.join(process.env.TEMP, 'guard-smoke.log');
const target = path.join(process.env.WINDIR, 'System32', 'notepad.exe');
const encoded = Buffer.from(mod.exports.script(target, logFile), 'utf16le').toString('base64');
const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { encoding: 'utf8', timeout: 40000 });
console.log('status', r.status, 'signal', r.signal, 'error', r.error?.message);
console.log('stdout:', r.stdout);
console.log('stderr:', r.stderr);
console.log('log:', fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '(none)');
