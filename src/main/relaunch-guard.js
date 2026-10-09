'use strict';

const { spawn } = require('node:child_process');

// Restart and update closes RemindAni and hands over to the installer. If the installer never
// runs or never finishes (a dismissed UAC prompt, antivirus blocking it), nothing would open the
// app again. This watcher runs on after RemindAni has quit: once no installer is left running
// and RemindAni has not come back on its own, it starts it again (old version or new).
function startRelaunchGuard(exe, log) {
  if (process.platform !== 'win32') return;
  const quoted = exe.replace(/'/g, "''");
  const script = `
    $since = Get-Date
    $deadline = $since.AddMinutes(10)
    $installer = '^(installer|elevate|Un_[A-Z]|Au_|RemindAni-Setup)'
    Start-Sleep -Seconds 3
    while ((Get-Date) -lt $deadline) {
      if (Get-Process RemindAni -ErrorAction SilentlyContinue | Where-Object StartTime -gt $since) { exit }
      if (-not (Get-Process -ErrorAction SilentlyContinue | Where-Object ProcessName -match $installer)) {
        Start-Sleep -Seconds 4
        if (-not (Get-Process RemindAni -ErrorAction SilentlyContinue | Where-Object StartTime -gt $since)) {
          Start-Process -FilePath '${quoted}'
        }
        exit
      }
      Start-Sleep -Seconds 2
    }`;
  try {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-Command', script], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
    log.info(`relaunch guard started (pid ${child.pid}) for ${exe}`);
  } catch (err) {
    log.error('relaunch guard failed to start', err);
  }
}

module.exports = { startRelaunchGuard };
