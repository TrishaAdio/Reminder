'use strict';

// GitHub owner and repo for updates live in package.json under "updates": change them there only.
const { updates } = require('./package.json');

module.exports = {
  appId: 'com.remindani.app',
  productName: 'RemindAni',
  copyright: 'Copyright © 2026 RemindAni',
  directories: { output: 'dist', buildResources: 'build' },
  files: ['src/**/*', 'assets/**/*', 'package.json'],
  asar: true,
  electronLanguages: ['en-US'],
  publish: [{ provider: 'github', owner: updates.owner, repo: updates.repo, releaseType: 'release' }],
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
