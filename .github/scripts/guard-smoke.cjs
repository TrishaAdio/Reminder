// Starts the relaunch guard script four ways and exits at once, like RemindAni quitting.
// The next workflow step reads each variant's log to see which ones survived.
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const src = fs.readFileSync(path.resolve('src/main/relaunch-guard.js'), 'utf8');
const mod = { exports: {} };
new Function('module', 'require', `${src}\nmodule.exports.script = script;`)(mod, (r) => (r === 'node:child_process' ? {} : require(r)));
const sys = path.join(process.env.WINDIR, 'System32');
const variants = {
  A: { detached: true, hidden: false },
  B: { detached: true, hidden: true },
  C: { detached: false, hidden: true },
  D: { detached: true, hidden: false, viaCmd: true },
};
for (const [name, v] of Object.entries(variants)) {
  const logFile = path.join(process.env.TEMP, `guard-${name}.log`);
  try { fs.rmSync(logFile); } catch {}
  // Each variant reopens a copy of notepad with its own name so the results can't mix.
  const target = path.join(process.env.TEMP, `note${name}.exe`);
  fs.copyFileSync(path.join(sys, 'notepad.exe'), target);
  const encoded = Buffer.from(mod.exports.script(target, logFile), 'utf16le').toString('base64');
  const psArgs = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...(v.hidden ? ['-WindowStyle', 'Hidden'] : []), '-EncodedCommand', encoded];
  const [cmd, args] = v.viaCmd ? ['cmd.exe', ['/d', '/c', 'start', '""', '/min', 'powershell.exe', ...psArgs]] : ['powershell.exe', psArgs];
  const child = spawn(cmd, args, { detached: v.detached, stdio: 'ignore', windowsHide: true });
  child.unref();
  console.log(name, JSON.stringify(v), 'pid', child.pid);
}
process.exit(0);
