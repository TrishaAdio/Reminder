# RemindAni
Build the installer on Windows 10/11 x64 with Node 22+: `npm install`, then `npm run dist`. The output is `dist/RemindAni-Setup-1.0.0.exe` (`npm start` runs the app, `npm test` runs the scheduler tests).
The build is unsigned, so SmartScreen will say "Unknown publisher": click More info, then Run anyway. To sign later, set `CSC_LINK` (path to a .pfx) and `CSC_KEY_PASSWORD` before running `npm run dist`; electron-builder signs both the app and the installer.
On Linux/macOS, building NSIS needs Wine for icon and metadata embedding (or use the `electronuserland/builder:wine` image). This build was produced that way, but it was not installed on real Windows.
Design brief: docs/DESIGN.md. Running `npm run assets` regenerates the icons, installer art and sounds.
