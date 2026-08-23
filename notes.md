# Stickman Parkour — Build Notes

## CRITICAL QA REVIEW — 2026-08-23 (senior game QA + game designer pass)

**Method.** Replayed the shipped build headlessly via Playwright (Chromium 1.62): scripted *perfect* and *casual* bots playing the real game loop, seeded max-difficulty fairness runs (10×), input probes (swipes at controlled angles), DOM touch-target measurements, pause/restart/game-over flow probes, FPS sampling with blank-page and gradient-only baselines to isolate the game's own cost, console-error watch across 5 viewports (1440×900, 390×844, 320×568, 740×360, small-phone). Screenshots archived in `evidence/review/`. All numbers below are measured, not estimated. (Caveat: FPS in a software-rendered headless shell understates GPU-equipped desktops, but the *relative* cost and the mobile-class result are valid; the gradient-only baseline proves cause.)

### A. Gameplay problems
- **A1 (CRITICAL) — Perfect play is killed by the generator at max difficulty. 10/10 seeded runs (difficulty 1.0, speed ~40) die between 1504–1608m.** Death patterns are consistent: `spawnWallDodge` staggers its two walls `lerp(7, 2.5, d)` = 2.5 z-units apart (62ms at speed 40), and consecutive waves interleave a hurdle/slide-gate into the escape lane as little as ~4 z (≈0.1s) behind a wall. Required reaction: lane change (0.15–0.3s) *plus* jump/slide commit (<0.1s) — infeasible. The run from the earlier persona pass that survived 1km+ simply never reached max difficulty (1460m). Effectively an **endless runner that ends at ~1.5km for everyone**, skill-independent.
- A2 — Side-clip deaths during 2-lane wall traverses: while `p.lane` lerps across the middle lane, a staggered wall there still kills (lethal z-band `[-0.6, 2.9]` + same-lane threshold 0.5 makes the corridor effectively wider than it looks).
- A3 — Coins spawn behind/inside wall lanes as bait (30% post-wave coin lines in random lanes): occasionally reads as designed risk/reward, often reads as a trap since the wall obscures the coin line until ~30z out.
- A4 — Golden Kicks (the only power-up) first appears past 220m and then every ~11–18s of spawn-clock; runs that die before 220m (most casual runs, see B1) never see it.

### B. Balancing problems
- B1 — Ramp: difficulty starts at 60m and hits max at 1460m; combined with A1 the score ceiling is ~35–40k. There is no late-game — the difficulty curve doesn't flatten into a testable "flow" band, it hits a wall (literally).
- B2 — Early game is trivially easy for ~200m (single obstacle every ~1.4s at speed 15), then fairness collapses at the other extreme. The curve is a cliff, not a slope.
- B3 — Milestone bonuses (100×n) dwarf skill income (coins 15, near-miss 25) late-game; score is mostly distance, cheapening the risk/reward loop.

### C. UI/UX problems
- **C1 (HIGH) — Pause screen "Restart" does not restart: it resumes.** Measured: pause at 29.25m → click Restart → state `running`, distance continues 29.25→35.25m. (`pauseRestartButton` emits `start`; `input()` maps `start`-while-paused to resume.) Players cannot abandon a bad run from pause without Menu→Start (2 screens).
- C2 — Mobile first-run has zero control teaching: `#controlHint` is hidden on coarse pointers; nothing explains swipe vs buttons. Desktop hint auto-hides after 4.2s with no way to recall it.
- C3 — No fullscreen option (F/edge); on browsers with URL bars the safe-area tuning matters.
- C4 — Game-over panel shows instantly after the 0.95s crash tumble; no "what killed me" cue (obstacle kind/lane recap), which is the cheapest learn-from-death loop.

### D. Visual weaknesses
- D1 — Wall sprite, while now readable as unjumpable, occupies ~72% of depth height; on short landscape viewports (740×360) `playerH` shrinks to ~104px and the scene reads cramped (measured).
- D2 — Night palette makes hurdles (pink/orange) the highest-salience object on screen; coins (gold) compete with the gold slide-gate and Golden Kicks text for the same hue family — pickup priority is muddled at speed.
- D3 — Crash rotation + flash + shake stack well, but the defeated pose plays behind the game-over panel with no slow-mo; the wipeout is the most emotional beat and it's over in 0.95s.

### E. Performance risks
- **E1 (HIGH) — Fullscreen gradients are re-created and rasterized every frame** (`drawSky`, `drawRoad` ×2, horizon glow, `drawVignette` radial ≈ 6 fullscreen gradient fills/frame). Measured in-headless: gradient-only canvas baseline = **23fps** (blank rAF = 60); full game = **10.3–12fps @1440×900×2dpr** and **~30fps @390×844×2dpr**. The 30fps mobile figure is the realistic low-end-GPU preview; this is the dominant per-frame cost and it is all static content that could be cached once per resize.
- E2 — Per-frame allocations (gradient objects, road path) feed GC pressure on long sessions (minor vs E1).

### F. Mobile usability
- **F1 (HIGH) — Pause/mute buttons measure 36×36px on 390×844** (`.icon-btn` shrunk in the ≤700px media query) — below the 44px minimum (Apple HIG/Google) for a control used mid-run at speed.
- **F2 (HIGH) — Diagonal swipes (~45°) are dead inputs.** `handleSwipe` requires `adx > ady*1.25` or `ady > adx*1.1`; a measured 60/55 (47°) thumb swipe produced **zero actions**. Real thumbs rarely swipe at clean axes; this eats jump/slide inputs exactly when players are frantic.
- F3 — Jump/slide touch buttons are bottom-center while lane buttons are bottom-left: right-thumb travel for jump is fine, but left-handed players get no layout mirror (minor).

### G. PC usability
- G1 — Window blur (alt-tab without tab-hide) does not auto-pause; only `visibilitychange`. Desktop players lose runs on focus loss.
- G2 — Restart is bound nowhere on keyboard (R does nothing); after death you must click or press Space (Space works, but R is the genre convention).

### H. Process problems
- H1 — No committed test harness, no CI, no lint, no package.json: every "verified green" claim in this file is unreproducible from the repo (the prior Playwright suites were ephemeral).
- H2 — Evidence/screenshots were never committed, so regression claims (e.g. "wall reads unjumpable") can't be diffed over time.
- H3 — No LICENSE; repo is all-rights-reserved by default.
- H4 — notes.md mixes dev log and QA findings without severity labels (partially addressed by this section).

### Top 5 priorities (fix order)
1. **A1/B1/B2 — Unfair max-difficulty wave interleaving** (10/10 perfect-bot deaths ~1505m): enforce a spawn-time minimum spacing between cross-wave action obstacles, widen wall-dodge stagger floor. Fair = perfect bot survives indefinitely; hard stays hard for humans.
2. **C1 — Pause "Restart" resumes instead of restarting**: dedicated `restart` action.
3. **E1 — Per-frame fullscreen gradient rasterization** (12fps desktop-class / 30fps mobile-class in software renderer): cache static backdrop to an offscreen canvas at resize; vignette becomes a CSS overlay.
4. **F1 — 36px pause/mute touch targets** → ≥44px on mobile.
5. **F2 — Diagonal swipe dead zone** → dominant-axis swipe resolution.

(Process remediation H1/H2 rides along: the QA harness used below is committed under `tests/`, runnable via `npm test`, and evidence screenshots land in `evidence/`.)

---

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

## Persona playtest pass (headless Chromium, Playwright)
- Played the game as four personas (casual, hardcore, mobile, first-time) at 1440x900 and 390x844 (touch), with scripted perfect/casual bots, swipe/button probes, console capture and screenshots.
- Findings that shaped the next fixes: dodge-walls were drawn at 0.92x the jump apex (209px vs 227px desktop) and 0.81x player height — visually jumpable but lethal on jump; an independent vision review of the screenshot also read them as "designed to be jumped". Perfect bot survived 1km+ (no unfair patterns below max difficulty); casual bot died at ~1.9km only in the max-difficulty wall+wall+hurdle combo. Console clean on all viewports; swipes and touch buttons all work; pause button is only 36px on mobile; jump presses shortly before landing are eaten (no input buffer).

## Fix pass 5 — dodge-wall readability (top-impact issue)
- Rebuilt the dodge-wall sprite as a tall full-lane pillar (viewBox 150x420): no-entry slash up top, yellow hazard chevrons pointing sideways ("go around"), beacon cap, ground plinth.
- Raised `OBSTACLE_DEFS.wall` height 0.40 -> 0.72 of depth so the wall towers over both the runner (1.45x) and the jump apex (1.66x) on desktop and mobile.
- Walls now size their width from lane spacing (`laneHalf * 0.95 * spread`) instead of a fixed sprite ratio, so the blocker fills its lane at every aspect ratio; `drawSprite` accepts an explicit width.
- Exposed `Game.OBSTACLE_DEFS` for testability.
- Verified with an automated suite (geometry assertions at collision z on both viewports, 70s perfect-bot fairness regression, console error watch, wall-approach screenshots): all green; vision review of the new screenshot reads the wall as clearly unjumpable and lane-contained with no rendering artifacts.

## Fix pass 6 — jump input buffering (feel & fairness)
- Problem measured: a jump pressed 50-120ms before landing was silently discarded (airborne, no double jump available) — the classic "my jump didn't register" death, worst on touch where latency eats into reaction timing.
- Added a 0.12s jump buffer on the player: early airborne presses are remembered and fire automatically on touchdown (full dust/jump feedback, not a ghost step). Stale presses (>0.12s before landing) still expire unused; double-jump with Golden Kicks is unchanged.
- TDD'd with a deterministic harness that arms presses at an exact predicted time-to-landing (computed per physics frame, immune to headless frame jitter): red (eaten at 86-90ms early), green after the fix; a 200-260ms-early stale press correctly does not auto-jump.
- Re-ran the full verify suite (wall geometry on both viewports, 70s perfect-bot fairness run, console watch): all green.

## Dev log — Fix pass 7 (top-5 #1): fairness at max difficulty

**Problem (measured).** 10/10 perfect-bot runs died at 1504–1608m. Three stacked causes found via death-pattern forensics and a per-tick input timeline probe:
1. `spawnWallDodge` stagger at max difficulty = 2.5z (62ms at speed 40).
2. Cross-wave interleaving dropped action obstacles into escape lanes as little as ~4z (~0.1s) behind a wall; a spacing-guard leak could even produce 0.4z cross-wave pairs (a pushed obstacle landing in front of a later one the guard had skipped).
3. **Slide-chain trap (mechanics):** two same-lane slide-gates 0.29s apart. First slide (0.72s) still active through the second gate's re-slide window; `startSlide` refused input while sliding → guaranteed death in the (0.72s, 0.85s) gap band, skill-independent. Timeline evidence: slide fired at t=19.98, gate#2 impact at t≈20.75, slide expired 20.70, crash on the next tick.

**Fixes.**
- `js/game.js`: obstacles now carry a `wave` id; `enforceWaveSpacing()` runs after each wave and enforces a speed-proportional minimum z-gap between cross-wave obstacles — `0.24s` base + `0.09s` per lane of lateral travel, `0.75s` for hurdle-first same-lane chains (jump occupies the lane) — iterating to a fixed point so pushes can't create new violations.
- Wall-dodge stagger floor raised `2.5 → 3.5`z; double-wall branch's escape-lane gate now spawns `wallB + lerp(9,13,d)` instead of `ZFAR + rand(9,12)`.
- `startSlide` re-arms a depleted slide (`slideTimer ≤ 0.4` refreshes to 0.72; a fresh slide is not restarted, preventing mash-spam). This deletes the deadly band: mashing slide now always works, matching player expectation.
- `tests/qa.mjs`: perfect-bot oracle rewritten as a predictive policy (per-tick lane survival-time evaluation with transit taps through staggered wall pairs, fixed reaction leads 0.30s jump / 0.10s slide / 0.55s wall). It found three of its own oracle bugs along the way (nearest-any-lane masking, random lane pick into gates, paralysis on stagger pairs) — each documented by death patterns, not guessed.

**Verification (Playwright).** `FAIRNESS_RUNS=10 npm run test:fairness`: **10/10 perfect-bot runs survive the full 45s window at seeded max difficulty (difficulty 1.0, speed ~40)**, distances consistent at cap (~1830–1850m vs 1504–1608 before). Fast suite: 4 pre-existing failures remain (fixes #2–#5 below), smoke clean, no console errors. Evidence: `evidence/fix1-maxdifficulty-fair.jpg`.

## Dev log — Fix pass 8 (top-5 #2): pause Restart now restarts

**Problem (measured).** Pause screen "Restart" resumed the run instead of restarting it: `pauseRestartButton` emitted `start`, and `input()` maps `start`-while-paused to resume. Distance probe: pause at 29.25m → click Restart → run continued 29.25→35.25m.

**Fix.** Dedicated `restart` action (`js/game.js` `input()`: restarts from running/paused/gameover) and `js/main.js` binds `pauseRestartButton` to it. Keyboard resume paths (Esc/P toggle, Space/Enter-while-paused) are untouched.

**Verification (Playwright).** Suite check `pause Restart starts a fresh run` green (state `running`, distance < 10m). Dedicated probe: Esc→pause→Esc→resume ✓, Space-while-paused resumes ✓, Restart from pause → distance 2.1m, difficulty 0, obstacles cleared, overlay hidden ✓, zero page errors. Evidence: `evidence/fix2-pause-restart-fresh-run.jpg`.
