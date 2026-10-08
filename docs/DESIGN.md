# RemindAni design brief

1. **Feel.** *Calm*: urgency comes from placement and sound, never from red, shaking, badges or exclamation marks. *Precise*: every size, gap, radius and curve is a token; no "close enough" values. *Warm*: warm neutrals and one amber accent; no cold tech-blue, no glass, no gradients.
2. **Type.** Inter Variable (OFL, bundled, optical sizing on). Segoe UI only as fallback. Weights 400/500/600, sentence case everywhere, tabular figures for times.
   Display 24/30 600 −0.019em (popup title only) · Title 20/26 600 −0.017em · Lead 15/21 400 −0.009em (popup body) · Body 14/20 400–500 −0.006em · Callout 13/18 400–600 −0.003em · Caption 12/16 500 0.
3. **Color.** Neutral surfaces + amber. Amber reads as warmth and "now"; red would read as error, blue as information. It follows the Windows app mode.
   Light: bg #F7F6F4, sidebar #EEECE8, surface #FFFFFF, text #1C1B19 / #64615B, accent #A84F0A (5.3:1 with white).
   Dark: bg #1B1A19, sidebar #151413, surface #262523, text #F4F3F0 / #A9A59E, accent #F0A040 (8.3:1 with #231505).
4. **Space.** 4px grid: 4 8 12 16 20 24 32 40. Concentric radii (outer = inner + inset): popup card 24 = buttons 12 + 12 inset; group 12 = segmented 8 + 4 inset; segmented 8 = thumb 6 + 2 inset. Reminder icons are circles, so they never fight a corner.
   Shadow, popup only: 0 1 2 α.06 · 0 6 16 α.08 · 0 18 44 α.14 (dark ×≈3). Small knobs/thumbs: 0 1 2 α.12 · 0 2 6 α.06. A shadowed thing never has a border.
   Windows 10 has no system blur, so surfaces are opaque tonal layers. No fake vibrancy. If transparency or GPU compositing is off, the popup becomes a square, solid, unshadowed card with a hairline.
5. **Motion.** Springs only, solved in JS and emitted as CSS `linear()` easing for WAAPI and transitions.
   Enter k260 c24 (ζ .74, 3% overshoot, within 1% at 408ms) · Exit k700 c52 (ζ .98, 243ms = 60% of enter) · Press k3000 c110 (ζ 1) · Release k520 c26 (ζ .57) · Layout k320 c30 · Toggle k600 c34. Mass 1.
   Popup in: y −14→0, scale .96→1, fade in, text blur 6→0 in the first 160ms. Done: a check wipes in, then the card dissolves. Wait: the card shrinks and travels toward the tray. A queued reminder swaps content in place while the card stays.
   Transform and opacity only, one motion per event. Reduced motion means 150ms cross-fades and no travel.
