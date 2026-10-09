// npm run release [patch|minor|major]   (default: patch)
// Bumps the version, builds the installer, uploads RemindAni-Setup-x.y.z.exe, latest.yml and the
// .blockmap into a draft GitHub Release, publishes it, and pushes the commit and tag. Needs GH_TOKEN.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const bump = process.argv[2] ?? 'patch';
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
const read = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();

if (!['patch', 'minor', 'major'].includes(bump)) throw new Error(`Unknown bump "${bump}". Use patch, minor or major.`);
if (!process.env.GH_TOKEN) throw new Error('Set GH_TOKEN to a GitHub token with "contents: write" on the release repo.');
if (read('git status --porcelain')) throw new Error('Commit or stash your changes first.');
if (process.platform !== 'win32') console.warn('Not on Windows: building the NSIS installer needs Wine here.');

const { version, updates } = JSON.parse(readFileSync('package.json', 'utf8'));
const github = async (method, path, body) => {
  const res = await fetch(`https://api.github.com/repos/${updates.owner}/${updates.repo}${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json' },
    body: body && JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GitHub ${method} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
};

run('npm test');
run(`npm version ${bump} -m "Release v%s"`);
const next = JSON.parse(readFileSync('package.json', 'utf8')).version;
const tag = `v${next}`;
run('git push origin HEAD');
// The tag is pushed last, after the release is complete, so CI sees it done and stops.
const sha = read('git rev-parse HEAD');
const draft = await github('POST', '/releases', { tag_name: tag, target_commitish: sha, name: `RemindAni ${next}`, draft: true, generate_release_notes: true });
run('npm run publish');
const { assets } = await github('GET', `/releases/${draft.id}`);
const names = assets.map((a) => a.name);
for (const f of ['latest.yml', `RemindAni-Setup-${next}.exe`, `RemindAni-Setup-${next}.exe.blockmap`]) {
  if (!names.includes(f)) throw new Error(`${f} did not upload; the draft release was left unpublished.`);
}
await github('PATCH', `/releases/${draft.id}`, { draft: false, make_latest: 'true' });
run(`git push origin ${tag}`);
console.log(`Published ${tag} (was ${version}).`);
