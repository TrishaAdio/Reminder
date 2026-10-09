# Audit and verification

Each control was clicked through Playwright against the running Electron app on Linux (Xvfb). The tray menu was driven through its real `MenuItem.click()`, and the clock was shifted inside the main process to simulate sleep, waits and clock changes. The app itself has not been run on a real Windows PC.

Release pipeline (real, not simulated): pushing tag `v1.1.0` built the installer on `windows-latest`, ran the 42 unit tests, and published `RemindAni-Setup-1.1.0.exe`, `latest.yml` and the `.blockmap` to one GitHub Release. The real electron-updater client, reporting version 1.0.0 as win32, then found 1.1.0 there, downloaded it and verified its sha512. Installing a downloaded update was not tested.

## v1.0 (before)
Controls v1 had mostly worked. **14 required features did not exist**: per-row toggle, icon picker, duplicate, undo delete, per-reminder wait, play/stop preview, popup dimming and idle motion, popup position, theme, quiet hours, pause (tray and app), updates, Today timeline and countdown. "Show now" was a preview, so Wait/Done on it did nothing. A defect was also found later: **three of the six built-in sounds (Glass, Marimba, Chime) were silent WAV files**. `test/sounds.test.js` now guards against that.

## v1.1 (after): 60 works, 1 unverified, 0 broken, 0 page errors
| Area | Control | Result | Evidence |
|---|---|---|---|
| Create | Gallery; 1-click Bed time, Drink water, Rest your eyes, Stretch, Take medicine | works | Row and toast appear |
| Create | Undo on "Added"; Start from scratch → editor with title focused | works | |
| Edit | Name, message, details, icon + tint | works | Saved instantly |
| Edit | Daily time + weekdays; every N min + active hours | works | Next fire recomputed |
| Edit | Sound select + preview, live level meter, play/stop morph | works | Meter at 1.0 / 0.78 / 0.49 / 0.26 |
| Edit | Choose file… → copied, name shown, previewed, played on fire | works | |
| Edit | Repeat until answered, per-reminder wait, on/off | works | |
| Edit | Test now → real popup + real sound, shown without focus | works | |
| Edit/List | Duplicate (+ undo); delete with undo restores in place | works | |
| List | Row toggle, hover actions | works | |
| Popup | Real fire → Done → next fire 24 h later | works | |
| Popup | Wait 2 / Wait 3 re-fire after exactly 2 / 3 min, not earlier | works | |
| Popup | Keys 2 / 3 / Esc / Enter; × = default wait (per-reminder value) | works | |
| Popup | Three at once: "2 more waiting", shown one after another | works | |
| Tray | Next reminder; Pause 30 min / 1 h / until tomorrow; Resume | works | |
| Tray | Pause skips a reminder that comes up; Open; Quit | works | |
| Settings | Theme system/light/dark; position ×4; dim; default wait | works | |
| Settings | Pause / Resume; quiet hours (and it mutes); volume; Show folder | works | |
| Settings | Open at sign-in | unverified | Electron login items are Windows/macOS only |
| Keys | Ctrl+1/2/3, Ctrl+, , Ctrl+N, Esc, Ctrl+W | works | |
| Updates | Silent launch check → badge + tray entry → tray opens Settings | works | Fake updater |
| Updates | Checking → available → downloading % → ready → restart | works | Fake updater |
| Updates | Error → Try again → recovers; up to date with time | works | Fake updater |
| App | Single instance; wake (<10 min fires, >10 min skipped) | works | |
| App | Clock set back 1 h: no double fire; persistence across restart | works | |
| Window | Caption buttons, drag, Snap Layouts | unverified | Native Windows chrome |
