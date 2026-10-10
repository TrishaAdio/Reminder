// Used by .github/workflows/audio-fade-test.yml: drives RemindAni-Audio.exe against a real
// app that is playing sound (a looping PowerShell SoundPlayer), and checks that it fades that
// app down and back up smoothly, recovers after being killed mid-fade, and restores on quit.
// It also checks RemindAni's own sound is never faded: the player is a child of this script, so
// with --pid set to this script it counts as "own", like Chromium's audio process does.
import { spawn, execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';

const exe = path.resolve('build/bin/RemindAni-Audio.exe');
const state = path.resolve('audio-fade-test.tsv');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed++;
};

function helper(args = ['--exclude', 'node', '--state', state]) {
  const child = spawn(exe, args, { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
  // Every line the helper has said, in order; waits look from a given position onwards.
  const history = [];
  const waiters = [];
  let buffer = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => {
    buffer += d;
    let i;
    while ((i = buffer.indexOf('\n')) >= 0) {
      history.push(buffer.slice(0, i).trim());
      buffer = buffer.slice(i + 1);
      for (const w of [...waiters]) w.check();
    }
  });
  const until = (re, from = 0, ms = 8000) =>
    new Promise((resolve, reject) => {
      const w = {
        check() {
          const at = history.findIndex((l, j) => j >= from && re.test(l));
          if (at < 0) return false;
          waiters.splice(waiters.indexOf(w), 1);
          clearTimeout(w.timer);
          resolve(at);
          return true;
        },
      };
      waiters.push(w);
      if (w.check()) return;
      w.timer = setTimeout(() => reject(new Error(`timed out waiting for ${re}`)), ms);
    });
  const send = (cmd) => child.stdin.write(`${cmd}\n`);
  // Volume of the playing PowerShell session, as the helper reports it.
  const sessions = async () => {
    const from = history.length;
    send('list');
    const end = await until(/^listed$/, from);
    return history.slice(from, end).filter((l) => l.startsWith('session '));
  };
  const row = async () => (await sessions()).find((l) => /^session powershell /i.test(l));
  const volume = async () => {
    const r = await row();
    return r ? Number(r.split(' ')[2]) : null;
  };
  const exited = new Promise((r) => child.on('exit', (code) => r(code)));
  return { child, send, until, sessions, volume, row, exited, history };
}

rmSync(state, { force: true });
const wav = path.resolve('assets/sounds/tide.wav');
const player = spawn('powershell.exe', ['-NoProfile', '-Command', `$p = New-Object Media.SoundPlayer '${wav}'; $p.PlayLooping(); Start-Sleep 300`], { stdio: 'ignore' });
await sleep(4000);

const a = helper();
await a.until(/^ready$/);
console.log('sessions:', (await a.sessions()).join(' | ') || '(none)');
const start = await a.volume();
check(start != null, `the playing app has an audio session (volume ${start})`);
if (start == null) {
  player.kill();
  process.exit(1);
}

// 1. Fade down over 2 s, sampled along the way.
a.send('duck 2000');
const down = [];
const t0 = Date.now();
while (Date.now() - t0 < 2600) {
  await sleep(250);
  down.push(await a.volume());
}
console.log('fading down:', down.map((v) => v.toFixed(3)).join(' '));
check(down.at(-1) < 0.001, 'silent after the fade');
check(down.slice(0, -1).some((v) => v > 0.05 && v < start - 0.05), 'passed through in-between levels (a fade, not a jump)');
check(down.every((v, i) => i === 0 || v <= down[i - 1] + 1e-4), 'never went back up on the way down');

// 2. Fade back up over 2 s.
a.send('restore 2000');
const up = [];
const t1 = Date.now();
while (Date.now() - t1 < 2600) {
  await sleep(250);
  up.push(await a.volume());
}
console.log('fading up:  ', up.map((v) => v.toFixed(3)).join(' '));
await a.until(/^restored$/);
check(Math.abs(up.at(-1) - start) < 0.001, `back to exactly ${start}`);
check(up.slice(0, -1).some((v) => v > 0.05 && v < start - 0.05), 'came back gradually');
check(!existsSync(state), 'no saved volumes left once restored');

// 3. Killed while ducked: the next run puts the volume back.
a.send('duck 300');
await sleep(800);
check((await a.volume()) < 0.001, 'ducked again');
check(existsSync(state), 'original volumes saved while ducked');
execSync(`taskkill /F /PID ${a.child.pid}`);
await sleep(500);
const b = helper();
await b.until(/^recovered/);
check(Math.abs((await b.volume()) - start) < 0.001, 'a new run restored the volume after a crash');

// 4. RemindAni quits while ducked (stdin closes): restores, then exits by itself.
b.send('duck 300');
await sleep(800);
check((await b.volume()) < 0.001, 'ducked before quitting');
b.child.stdin.end();
const code = await Promise.race([b.exited, sleep(5000).then(() => 'still running')]);
check(code === 0, `exited after its pipe closed (${code})`);
const c = helper();
await c.until(/^ready$/);
check(Math.abs((await c.volume()) - start) < 0.001, 'volume was put back on quit');
c.child.stdin.end();
await c.exited;

// 5. Own sound (found through the process tree, not the name) is left alone while ducked.
const ownArgs = ['--pid', String(process.pid), '--state', state];
const d = helper(ownArgs);
await d.until(/^ready$/);
check(/ own$/.test((await d.row()) ?? ''), 'a child of RemindAni counts as its own sound');
d.send('duck 300');
await sleep(800);
check(Math.abs((await d.volume()) - start) < 0.001, 'its own sound kept its volume while others are faded');
d.send('restore 0');
await d.until(/^restored$/);
d.child.stdin.end();
await d.exited;

// 6. Own slider left at silence (by anything) is put back as the helper starts.
const e = helper();
await e.until(/^ready$/);
e.send('duck 0');
await sleep(400);
check((await e.volume()) < 0.001, 'player silenced to set up the heal check');
execSync(`taskkill /F /PID ${e.child.pid}`);
await sleep(500);
rmSync(state, { force: true });
const f = helper(ownArgs);
await f.until(/^own sound back on/);
check((await f.volume()) > 0.99, 'own slider put back at full');
f.child.stdin.end();
await f.exited;

player.kill();
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
