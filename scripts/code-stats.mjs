// npm run stats: counts the project's own code and writes the totals into README.md, between
// the <!-- stats --> markers. Code means every tracked text source file (src, scripts, tests,
// build helpers, CI, config); generated files (package-lock.json), docs and binary assets
// (pictures, sounds, fonts, icons) are left out.
//   Lines: every line, blank ones included.
//   Words: pieces of text separated by spaces, tabs or line breaks.
//   Tokens: about one per 4 characters, the usual estimate for code.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const CODE = new Set(['.js', '.mjs', '.cjs', '.css', '.html', '.cs', '.nsh', '.yml', '.json']);
const SKIP = new Set(['package-lock.json']);

const files = execSync('git ls-files', { encoding: 'utf8' })
  .split('\n')
  .filter((f) => f && CODE.has(path.extname(f)) && !SKIP.has(path.basename(f)));

let lines = 0;
let words = 0;
let chars = 0;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  lines += text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
  words += text.split(/\s+/).filter(Boolean).length;
  chars += text.length;
}
const tokens = Math.round(chars / 4);
const n = (v) => v.toLocaleString('en-US');

const block = [
  '<!-- stats -->',
  `Total Code Lines : ${n(lines)}  `,
  `Total Words Used With A Space Gap : ${n(words)}  `,
  `Approx Token Used : ~${n(tokens)}`,
  '<!-- /stats -->',
].join('\n');

const readme = readFileSync('README.md', 'utf8');
const marked = /<!-- stats -->[\s\S]*?<!-- \/stats -->/;
const next = marked.test(readme) ? readme.replace(marked, block) : readme.replace(/^# .*\n/, (title) => `${title}${block}\n\n`);
writeFileSync('README.md', next);
console.log(`${files.length} files: ${n(lines)} lines, ${n(words)} words, ~${n(tokens)} tokens`);
