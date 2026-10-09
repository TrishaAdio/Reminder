'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { protocol, net } = require('electron');

const RENDERER = path.join(__dirname, '..', 'renderer');
const BUILTIN_SOUNDS = path.join(__dirname, '..', '..', 'assets', 'sounds');
const BUILTIN_COMPANIONS = path.join(__dirname, '..', '..', 'assets', 'companions');

// A privileged custom scheme gives the renderers a real origin, so the CSP can stay at 'self'.
function registerScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  ]);
}

// Sounds share the pages' origin: Web Audio reads silence from cross-origin media.
function resolve(url, dirs) {
  const { host, pathname } = new URL(url);
  if (host !== 'ui') return null;
  const rel = decodeURIComponent(pathname);
  if (rel.startsWith('/sound/builtin/')) return inside(BUILTIN_SOUNDS, rel.slice(15));
  if (rel.startsWith('/sound/user/')) return inside(dirs.sounds, rel.slice(12));
  if (rel.startsWith('/companion/builtin/')) return inside(BUILTIN_COMPANIONS, rel.slice(19));
  if (rel.startsWith('/companion/user/')) return inside(dirs.companions, rel.slice(16));
  return inside(RENDERER, rel);
}

function inside(root, rel) {
  const file = path.join(root, rel);
  return file.startsWith(root + path.sep) ? file : null;
}

function handleScheme(dirs) {
  protocol.handle('app', (request) => {
    const file = resolve(request.url, dirs);
    if (!file) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

module.exports = { registerScheme, handleScheme };
