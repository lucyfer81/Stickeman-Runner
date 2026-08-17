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
