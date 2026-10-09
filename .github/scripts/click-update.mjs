// Used by .github/workflows/update-test.yml: opens the installed app with a debugging port and
// clicks through the update the way a person would.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const exe = process.env.REMINDANI_EXE;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const app = spawn(exe, ['--remote-debugging-port=9222'], { stdio: ['ignore', 'pipe', 'pipe'] });
app.stdout.on('data', (d) => process.stdout.write(`[app] ${d}`));
app.stderr.on('data', (d) => process.stdout.write(`[app] ${d}`));
app.on('exit', (code, signal) => console.log(`old app exited: code ${code} signal ${signal}`));

let browser;
for (let i = 0; i < 30 && !browser; i++) {
  await sleep(1000);
  browser = await chromium.connectOverCDP('http://127.0.0.1:9222').catch(() => null);
}
const main = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes('/main/'));
const text = (sel) => main.textContent(sel).catch(() => null);
console.log('opened', main.url());

await main.click('#tab-settings');
const title = '.update-line:not(.leaving) .update-title';
for (let i = 0; i < 60; i++) {
  const t = await text(title);
  if (/available/.test(t ?? '')) break;
  if (await main.isVisible('button:has-text("Check for updates")')) await main.click('button:has-text("Check for updates")');
  if (await main.isVisible('button:has-text("Check again")')) await main.click('button:has-text("Check again")');
  if (await main.isVisible('.update button:has-text("Try again")')) await main.click('.update button:has-text("Try again")');
  await sleep(2000);
}
console.log('state:', await text(title));
await main.click('.update button:has-text("Download")');
for (let i = 0; i < 120 && !/Ready/.test((await text(title)) ?? ''); i++) await sleep(1000);
console.log('state:', await text(title), '|', await text('.update-line:not(.leaving) .update-detail'));
writeFileSync('clicked-at.txt', new Date().toISOString());
await main.click('.update button:has-text("Restart and update")');
console.log('clicked Restart and update');
const exited = await Promise.race([new Promise((r) => app.once('exit', () => r(true))), sleep(30000).then(() => false)]);
console.log(exited ? 'old app quit' : 'old app did NOT quit within 30 s');
if (process.env.SCENARIO === 'reopen') {
  // Someone sees the app vanish and double-clicks it again while the update installs.
  await sleep(3000);
  spawn(exe, [], { detached: true, stdio: 'ignore' }).unref();
  console.log('reopened the app 3 s after it quit');
}
process.exit(0);
