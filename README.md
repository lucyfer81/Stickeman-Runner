# Stickman Parkour

A browser-based pseudo-3D endless runner with a neon stickman, three lanes, and no bitmap assets — every sprite is generated as inline SVG and drawn to canvas.

## Run

Serve this folder with any static file server and open `index.html`:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Test

Reproducible Playwright QA suite (5 viewports: flows, touch targets, swipe matrix, FPS floors; `npm run test:fairness` adds a perfect-bot max-difficulty fairness block):

```bash
npm install                # playwright lib only; browsers must already be installed (npx playwright install chromium)
npm test
```

## Controls

| Action | Desktop | Mobile |
|---|---|---|
| Jump | Space / ↑ / W | Jump button or swipe up |
| Slide | ↓ / S | Slide button or swipe down |
| Change lane | ← → / A D | Lane buttons or swipe left/right |
| Pause | P / Esc | Pause button |
| Mute | M | Speaker button |

## Features

- Endless three-lane running with pseudo-3D projection
- Jump, slide, and wall-dodge obstacles
- Score, distance, coins, near-miss bonuses, and local best
- Difficulty ramps up the farther you run
- Golden Kicks power-up: double jump, coin magnet, and obstacle smashing
- Pigeon ambushes, fireworks milestones, dust, crashes, and screen shake
- Generated Web Audio SFX and synthwave beat
- Responsive title / pause / game-over screens and safe-area aware touch controls
