'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { protocol, net } = require('electron');

const RENDERER = path.join(__dirname, '..', 'renderer');
const BUILTIN_SOUNDS = path.join(__dirname, '..', '..', 'assets', 'sounds');

// A privileged custom scheme gives the renderers a real origin, so the CSP can stay at 'self'.
function registerScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  ]);
}

// Sounds share the pages' origin: Web Audio reads silence from cross-origin media.
function resolve(url, userSounds) {
  const { host, pathname } = new URL(url);
  if (host !== 'ui') return null;
  const rel = decodeURIComponent(pathname);
  if (rel.startsWith('/sound/builtin/')) return inside(BUILTIN_SOUNDS, rel.slice(15));
  if (rel.startsWith('/sound/user/')) return inside(userSounds, rel.slice(12));
  return inside(RENDERER, rel);
}

function inside(root, rel) {
  const file = path.join(root, rel);
  return file.startsWith(root + path.sep) ? file : null;
}

function handleScheme(userSounds) {
  protocol.handle('app', (request) => {
    const file = resolve(request.url, userSounds);
    if (!file) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

module.exports = { registerScheme, handleScheme };
