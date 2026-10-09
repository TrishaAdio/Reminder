// Builds build/bin/RemindAni-Audio.exe from build/audio/duck.cs with the C# compiler that
// ships with Windows (.NET Framework 4), so no SDK is needed. Runs before every installer
// build; elsewhere it does nothing and the app simply doesn't fade other sound.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

if (process.platform !== 'win32') {
  console.log('audio helper: not on Windows, skipped');
  process.exit(0);
}

const windir = process.env.WINDIR ?? 'C:\\Windows';
const csc = ['Framework64', 'Framework']
  .map((dir) => path.join(windir, 'Microsoft.NET', dir, 'v4.0.30319', 'csc.exe'))
  .find(existsSync);
if (!csc) throw new Error('audio helper: csc.exe from .NET Framework 4 was not found');

mkdirSync('build/bin', { recursive: true });
const out = path.join('build', 'bin', 'RemindAni-Audio.exe');
// winexe: no console window ever appears; RemindAni talks to it over pipes.
execFileSync(
  csc,
  ['/nologo', '/target:winexe', '/platform:anycpu', '/optimize+', '/warnaserror+', `/win32icon:${path.join('build', 'icon.ico')}`, `/out:${out}`, path.join('build', 'audio', 'duck.cs')],
  { stdio: 'inherit' },
);
console.log(`audio helper: built ${out}`);
