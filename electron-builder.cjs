'use strict';

// GitHub owner and repo for updates live in package.json under "updates": change them there only.
// Keep the .cjs extension: on Windows, a file named electron-builder.js next to package.json is
// run by Windows Script Host instead of the real electron-builder command.
const { updates } = require('./package.json');

module.exports = {
  appId: 'com.remindani.app',
  productName: 'RemindAni',
  copyright: 'Copyright © 2026 RemindAni',
  directories: { output: 'dist', buildResources: 'build' },
  files: ['src/**/*', 'assets/**/*', 'package.json'],
  // Fades other apps' sound around reminders (build/audio/duck.cs, built by
  // scripts/build-audio-helper.mjs before each installer build).
  extraResources: [{ from: 'build/bin/RemindAni-Audio.exe', to: 'RemindAni-Audio.exe' }],
  asar: true,
  electronLanguages: ['en-US'],
  // Uploads go into a draft that already exists (parallel uploads would otherwise each create
// their own release); the draft is published once all three files are in.
  publish: [{ provider: 'github', owner: updates.owner, repo: updates.repo, releaseType: 'draft' }],
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'build/icon.ico',
    requestedExecutionLevel: 'asInvoker',
    legalTrademarks: 'RemindAni',
  },
  nsis: {
    oneClick: false,
    // Per-user by default so updates install without an admin prompt.
    perMachine: false,
    allowElevation: true,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: 'always',
    createStartMenuShortcut: true,
    shortcutName: 'RemindAni',
    uninstallDisplayName: 'RemindAni',
    runAfterFinish: true,
    deleteAppDataOnUninstall: false,
    installerIcon: 'build/icon.ico',
    uninstallerIcon: 'build/icon.ico',
    installerSidebar: 'build/installerSidebar.bmp',
    uninstallerSidebar: 'build/installerSidebar.bmp',
    installerHeader: 'build/installerHeader.bmp',
    include: 'build/installer.nsh',
    artifactName: 'RemindAni-Setup-${version}.${ext}',
  },
};
