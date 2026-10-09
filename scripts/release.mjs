// npm run release [patch|minor|major]   (default: patch)
// Bumps the version, builds the installer and publishes RemindAni-Setup-x.y.z.exe, latest.yml
// and the .blockmap to a GitHub Release, then pushes the commit and tag. Needs GH_TOKEN.
// The tag push also starts the CI workflow, which sees the release is already complete and stops.
import { execSync } from 'node:child_process';

const bump = process.argv[2] ?? 'patch';
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
const read = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();

if (!['patch', 'minor', 'major'].includes(bump)) throw new Error(`Unknown bump "${bump}". Use patch, minor or major.`);
if (!process.env.GH_TOKEN) throw new Error('Set GH_TOKEN to a GitHub token with "contents: write" on the release repo.');
if (read('git status --porcelain')) throw new Error('Commit or stash your changes first.');
if (process.platform !== 'win32') console.warn('Not on Windows: building the NSIS installer needs Wine here.');

run('npm test');
run(`npm version ${bump} -m "Release v%s"`);
run('npx electron-builder --win nsis --x64 --publish always');
run('git push --follow-tags');
