# Stickman Parkour — Build Notes

## 2025-08-17
- Created `index.html` with the first playable-facing title screen (Neon City Endless Run).
- Added responsive SVG stickman preview, Start button, keyboard/pointer start handling.
- Planned next steps: game canvas, SVG sprite system, pseudo-3D lane engine, controls, audio, scoring, and progressive difficulty.

## Same session — core build
- Replaced the static-only title screen with a live canvas runner shell.
- Added `css/style.css`: neon HUD, responsive overlays, safe-area aware mobile touch controls.
- Added `js/assets.js`: all sprites are generated inline SVG (stickman run/jump/slide/dodge/defeat, hurdles, slide gates, dodge walls, coins, golden sneaker, pigeons, city skyline, sun and clouds).
- Added `js/game.js`: pseudo-3D projection engine, three-lane movement, jump/slide physics, spawning waves, collision + near-miss scoring, coin magnet power-up, fireworks milestones, particle effects and title attract mode.
- Added `js/audio.js`: generated Web Audio SFX and a lightweight synthwave beat (no external audio files).
- Added `js/main.js`: keyboard, swipe, on-screen touch buttons, pause/mute/menu wiring and DOM HUD updates.

## Fix pass 1
- Fixed SVG preload flattening for nested stickman sprite sets (previously only flat URLs were loaded).
- Fixed nested stickman sprite lookup (`run`, `dodgeL/R`, `jump`, `slide`, `defeated`).
- Fixed slide-gate and sneaker SVG text elements in the asset builder.
- Corrected dodge-wall asset key mapping, sneaker jump reset, magnet pull, game-over record detection, and menu/return-to-title flow.
- Improved HUD flex layout so touch controls stay bottom-anchored; power-up tag is now absolutely positioned above touch controls.
- Tuned player sprite height for small portrait screens and ignored key auto-repeat.

## Fix pass 2 (feel & fairness)
- Narrowed the obstacle hit window so an obstacle that has visibly passed the runner can no longer hurt.
- Lowered hurdle clearance slightly to forgive frame timing near the top of a jump.
- Ground-anchored sprites by their actual foot/baseline coordinates so the stickman's feet touch the road.
- Added soft shadows under obstacles and a taller opening under slide gates.
- Added haptic vibration on coin, power-up and crash for supported phones.
- Fallen stickman stays visible behind the game-over panel.

## Fix pass 3 (browser-tested)
- Added an inline SVG favicon (no 404, no bitmap icon).
- Fixed hidden overlay descendants from intercepting taps after their screen was dismissed.
- Verified with headless Chrome at desktop (1440×900), phone (390×844) and small phone (320×568) sizes: title, HUD, touch buttons, pause, game-over and restart flows all work without console errors.

## Documentation & final browser pass
- Added controls and feature overview to `README.md`.
- Ran headless Chrome smoke tests across five viewports; no console errors, favicon 404 eliminated, 60 FPS observed on a 390×844 mobile viewport.
- Slightly tightened same-lane collision threshold to reduce side-clip collisions.

## Polish pass 4
- Title attract-mode actions are now silent (no random jump sounds after returning to the menu).
- Added personal-best preview to the title screen.
- Re-tested 320px title layout after the addition.

## Tiny fix
- Initial title screen now immediately shows the saved personal best, not just after a run.
