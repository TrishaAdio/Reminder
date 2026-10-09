'use strict';

const { spawn } = require('node:child_process');

// Restart and update closes RemindAni and hands over to the installer. If the installer never
// runs or never finishes (a dismissed UAC prompt, antivirus blocking it), nothing would open the
// app again. This watcher runs on after RemindAni has quit: once no installer is left running
// and RemindAni has not come back on its own, it starts it again (old version or new).
const ps = (s) => `'${s.replace(/'/g, "''")}'`;

function script(exe, logFile) {
  return `
$ErrorActionPreference = 'SilentlyContinue'
function Log($m) { Add-Content -LiteralPath ${ps(logFile)} -Value "$((Get-Date).ToUniversalTime().ToString('o')) guard $m" }
$exe = ${ps(exe)}
$since = Get-Date
$deadline = $since.AddMinutes(10)
$installers = @('installer', 'elevate', 'Un_A', 'Un_B', 'Au_')
Log "watching for $exe"
Start-Sleep -Seconds 3
while ((Get-Date) -lt $deadline) {
  $back = Get-Process -Name RemindAni | Where-Object { $_.StartTime -gt $since }
  if ($back) { Log "RemindAni is back by itself (pid $($back[0].Id))"; exit }
  $busy = Get-Process | Where-Object { $installers -contains $_.ProcessName -or $_.ProcessName -like 'RemindAni-Setup*' }
  if (-not $busy) {
    Start-Sleep -Seconds 4
    if (Get-Process -Name RemindAni | Where-Object { $_.StartTime -gt $since }) { Log 'RemindAni came back'; exit }
    Log 'no installer running and RemindAni is not back: starting it'
    Start-Process -FilePath $exe
    exit
  }
  Start-Sleep -Seconds 2
}
Log 'gave up after 10 minutes'
`;
}

function startRelaunchGuard(exe, log) {
  if (process.platform !== 'win32') return;
  try {
    // EncodedCommand (UTF-16LE base64) sidesteps every quoting rule between Node and PowerShell.
    const encoded = Buffer.from(script(exe, log.file), 'utf16le').toString('base64');
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded], {
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
