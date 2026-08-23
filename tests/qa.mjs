/* Stickman Parkour — reproducible QA regression suite (Playwright, headless).
 *
 * Usage:
 *   npm test                fast suite (~90s): smoke, flows, touch targets, swipes, FPS floors
 *   npm run test:fairness   adds long fairness block (perfect bot @ max difficulty, 5 x 45s)
 *
 * Exits non-zero on any failure. Evidence screenshots -> evidence/ (committed). */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EV = path.join(ROOT, 'evidence');
fs.mkdirSync(EV, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures.push(name);
};

/* ------------------------------------------------ static server on a free port */
const server = await new Promise((resolve, reject) => {
  const proc = spawn('python3', ['-u', '-m', 'http.server', '0', '--bind', '127.0.0.1', '--directory', ROOT]);
  let buf = '';
  let resolved = false;
  const onOut = (d) => {
    buf += d;
    const m = buf.match(/Serving HTTP on 127\.0\.0\.1 port (\d+)/);
    if (m && !resolved) { resolved = true; resolve({ proc, port: Number(m[1]) }); }
  };
  proc.stdout.on('data', onOut);
  proc.stderr.on('data', onOut);
  proc.on('exit', (code, sig) => {
    if (!resolved) { resolved = true; reject(new Error(`http.server exited early (code=${code} sig=${sig}): ${buf}`)); }
    else console.error(`  [http.server exited code=${code} sig=${sig}]`);
  });
  setTimeout(() => {
    if (!resolved) { resolved = true; proc.kill(); reject(new Error('http.server did not start: ' + buf)); }
  }, 10000);
});
process.on('exit', () => server.proc.kill());
await sleep(400);
const BASE = `http://127.0.0.1:${server.port}`;

async function newPage(browser, { w, h, touch = false, mobile = false }) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    hasTouch: touch,
    isMobile: mobile,
    deviceScaleFactor: 2,
  });
  ctx.addInitScript(() => {
    let GameClass;
    Object.defineProperty(window, 'Game', {
      configurable: true,
      set(C) { GameClass = C; },
      get() {
        const W = function (...a) { const i = new GameClass(...a); window.__game = i; return i; };
        W.OBSTACLE_DEFS = GameClass.OBSTACLE_DEFS;
        return W;
      },
    });
    window.__consoleErrors = [];
    window.addEventListener('error', (e) => window.__consoleErrors.push(String(e.message)));
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.__errors = errors;
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.assetsReady, null, { timeout: 15000 });
  return { ctx, page };
}

const fps = (page, secs = 3) => page.evaluate((s) => new Promise((res) => {
  let n = 0; const t0 = performance.now();
  const f = () => { n++; if (performance.now() - t0 < s * 1000) requestAnimationFrame(f); else res(+(n / s).toFixed(1)); };
  requestAnimationFrame(f);
}), secs);

/* ------------------------------------------------------------ perfect bot */
const BOT_SRC = `
  window.__qaDeaths = [];
  let wasRunning = false;
  window.__botTimer = setInterval(() => {
    const g = window.__game;
    if (!g) return;
    if (g.state === 'running') {
      wasRunning = true;
      const p = g.player, sp = g.speed;
      const TRAVERSE = 0.13; // seconds of lane lerp per lane crossed

      // time until 'lane' would kill a runner who starts moving there now
      const laneKillTime = (lane) => {
        const traverse = Math.abs(lane - p.lane) * TRAVERSE;
        let t = Infinity;
        for (const ob of g.obstacles) {
          if (ob.smashed || ob.lane !== lane || ob.z < -1) continue;
          const ta = (ob.z - 2.9) / sp;
          if (ta < -0.05) continue;
          if (ob.kind === 'wall') { if (ta < t) t = ta; }
          else {
            const lead = ob.kind === 'hurdle' ? 0.30 : 0.10;
            if (ta - traverse < lead && ta < t) t = ta; // can't act in time after arriving
          }
        }
        return t;
      };

      // 1) act on own-lane jump/slide obstacles
      let act = null;
      for (const ob of g.obstacles) {
        if (ob.smashed || ob.z < -1) continue;
        if (Math.abs(ob.lane - p.targetLane) >= 0.4) continue;
        const t = (ob.z - 2.9) / sp;
        if (t < -0.06 || t > 1.4) continue;
        if (ob.kind === 'wall') continue;
        if (!act || ob.z < act.z) act = ob;
      }
      if (act) {
        const t = (act.z - 2.9) / sp;
        if (act.kind === 'hurdle' && p.grounded && t < 0.30) g.input('jump');
        else if (act.kind === 'slideGate' && p.grounded && t < 0.10) g.input('slide'); // game re-arms depleted slides
      }

      // 2) escape own-lane walls toward the lane with the longest survival time
      let wall = null;
      for (const ob of g.obstacles) {
        if (ob.smashed || ob.kind !== 'wall' || ob.z < -1) continue;
        if (Math.abs(ob.lane - p.targetLane) >= 0.4) continue;
        const t = (ob.z - 2.9) / sp;
        if (t < -0.06 || t > 1.4) continue;
        if (!wall || ob.z < wall.z) wall = ob;
      }
      if (wall) {
        const tWall = (wall.z - 2.9) / sp;
        if (tWall < 0.55 && Math.abs(p.lane - wall.lane) < 0.4) {
          const cands = [p.targetLane - 1, p.targetLane + 1].filter((l) => l >= -1 && l <= 1);
          let best = null, bestT = -1;
          for (const l of cands) { const t = laneKillTime(l); if (t > bestT) { bestT = t; best = l; } }
          // transit taps are allowed: we can pass THROUGH a blocked lane
          // (staggered wall pairs) as long as we can arrive there and keep moving
          if (best !== null && bestT > 0.18 + Math.abs(best - p.lane) * TRAVERSE) {
            g.input(best < p.targetLane ? 'left' : 'right');
          }
        }
      }
    } else if (wasRunning && g.state === 'crashing') {
      wasRunning = false;
      window.__qaDeaths.push({
        distance: Math.round(g.distance),
        pattern: g.obstacles.filter((o) => o.z < 34).map((o) => ({ k: o.kind, l: o.lane, z: +o.z.toFixed(1) })),
        playerLane: +g.player.lane.toFixed(2),
        targetLane: g.player.targetLane,
        sliding: g.player.sliding,
        grounded: g.player.grounded,
        speed: +g.speed.toFixed(1)
      });
    }
  }, 16);
`;

/* ------------------------------------------------------------------- suite */
const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] });

/* 1. smoke across viewports */
const viewports = [
  ['desktop', { w: 1440, h: 900 }],
  ['laptop', { w: 1280, h: 720 }],
  ['mobile', { w: 390, h: 844, touch: true, mobile: true }],
  ['small', { w: 320, h: 568, touch: true, mobile: true }],
  ['landscape', { w: 740, h: 360, touch: true, mobile: true }],
];
for (const [name, opts] of viewports) {
  const { ctx, page } = await newPage(browser, opts);
  await page.screenshot({ path: path.join(EV, `smoke-${name}-title.jpg`), type: 'jpeg', quality: 70 });
  await page.click('#startButton');
  await sleep(1500);
  await page.screenshot({ path: path.join(EV, `smoke-${name}-run.jpg`), type: 'jpeg', quality: 70 });
  const state = await page.evaluate(() => window.__game.state);
  check(`smoke[${name}] run starts`, state === 'running', `state=${state}`);
  check(`smoke[${name}] no console errors`, page.__errors.length === 0, page.__errors.join(' | ').slice(0, 200));
  await ctx.close();
}

/* 2. pause / restart / game-over flows (desktop) */
{
  const { ctx, page } = await newPage(browser, { w: 1440, h: 900 });
  await page.click('#startButton');
  await sleep(2000);
  await page.keyboard.press('KeyP');
  await sleep(300);
  check('pause shows overlay', await page.isVisible('#pauseScreen:not(.hidden)'));
  const dPaused = await page.evaluate(() => window.__game.distance);
  await sleep(1000);
  check('pause freezes simulation', (await page.evaluate(() => window.__game.distance)) === dPaused);
  await page.click('#pauseRestartButton');
  await sleep(1200);
  const after = await page.evaluate(() => ({ d: window.__game.distance, s: window.__game.state }));
  check('pause Restart starts a fresh run', after.s === 'running' && after.d < 10, `state=${after.s} distance=${after.d.toFixed(1)}`);
  // game over flow: steer into the next obstacle's lane and wait for the crash
  await page.evaluate(() => { window.__game.player.targetLane = window.__game.obstacles[0]?.lane ?? 0; });
  await page.waitForFunction(() => window.__game.state === 'gameover', null, { timeout: 30000 });
  await page.screenshot({ path: path.join(EV, 'flow-gameover.jpg'), type: 'jpeg', quality: 70 });
  await page.click('#runAgainButton');
  await sleep(800);
  const again = await page.evaluate(() => ({ s: window.__game.state, d: window.__game.distance }));
  check('game-over Run Again restarts', again.s === 'running' && again.d < 15, `state=${again.s} d=${again.d.toFixed(1)}`);
  await ctx.close();
}

/* 3. touch target sizes (mobile) */
{
  const { ctx, page } = await newPage(browser, { w: 390, h: 844, touch: true, mobile: true });
  await page.click('#startButton');
  await sleep(1200);
  for (const id of ['pauseButton', 'muteButton', 'btnLeft', 'btnRight', 'btnJump', 'btnSlide']) {
    const bb = await page.evaluate((i) => { const r = document.getElementById(i).getBoundingClientRect(); return Math.min(r.width, r.height); }, id);
    check(`touch target ${id} >= 44px`, bb >= 44, `${bb.toFixed(0)}px`);
  }
  await ctx.close();
}

/* 4. swipe matrix incl. diagonal (mobile) */
{
  const { ctx, page } = await newPage(browser, { w: 390, h: 844, touch: true, mobile: true });
  await page.click('#startButton');
  await sleep(800);
  await page.evaluate(() => {
    const g = window.__game;
    g.__swipeLog = [];
    const orig = g.input.bind(g);
    g.input = (a) => { g.__swipeLog.push(a); return orig(a); };
    g.player.targetLane = 0;
  });
  const swipe = (dx, dy) => page.evaluate(({ dx, dy }) => {
    const el = document.getElementById('game');
    const x0 = innerWidth / 2, y0 = innerHeight / 2;
    const fire = (type, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerId: 7, clientX: x, clientY: y, bubbles: true, isPrimary: true }));
    fire('pointerdown', x0, y0);
    fire('pointermove', x0 + dx * 0.5, y0 + dy * 0.5);
    fire('pointermove', x0 + dx, y0 + dy);
    fire('pointerup', x0 + dx, y0 + dy);
  }, { dx, dy });
  await swipe(-80, 0); await swipe(0, -80); await swipe(0, 80);
  const axisLog = await page.evaluate(() => window.__game.__swipeLog);
  check('axis swipes work', JSON.stringify(axisLog) === JSON.stringify(['left', 'jump', 'slide']), JSON.stringify(axisLog));
  await page.evaluate(() => { window.__game.__swipeLog = []; window.__game.player.targetLane = 0; });
  await swipe(60, 55); // ~47° diagonal, the classic dead zone
  const diagLog = await page.evaluate(() => window.__game.__swipeLog);
  check('47° diagonal swipe resolves to an action', diagLog.length > 0, JSON.stringify(diagLog));
  await ctx.close();
}

/* 5. FPS floors (software renderer; floors chosen to catch the per-frame gradient regression) */
{
  const { ctx, page } = await newPage(browser, { w: 390, h: 844, touch: true, mobile: true });
  await page.click('#startButton');
  await sleep(2500);
  const m = await fps(page);
  check('fps mobile >= 45', m >= 45, `${m}fps`);
  await ctx.close();

  const d = await newPage(browser, { w: 1440, h: 900 });
  await d.page.click('#startButton');
  await sleep(2500);
  const f = await fps(d.page);
  check('fps desktop >= 20', f >= 20, `${f}fps`);
  await d.ctx.close();
}

/* 6. fairness (opt-in, long) */
if (process.argv.includes('--fairness')) {
  const { ctx, page } = await newPage(browser, { w: 1440, h: 900 });
  const RUNS = Number(process.env.FAIRNESS_RUNS || 5), CAP_MS = 45000;
  let deaths = 0; const patterns = [];
  for (let i = 0; i < RUNS; i++) {
    await page.evaluate(() => { if (window.__botTimer) clearInterval(window.__botTimer); window.__game.startRun(); window.__game.distance = 1450; });
    await page.evaluate(BOT_SRC);
    const t0 = Date.now();
    while (Date.now() - t0 < CAP_MS) {
      if ((await page.evaluate(() => window.__game.state)) === 'gameover') break;
      await sleep(400);
    }
    const r = await page.evaluate(() => ({ d: window.__qaDeaths, dist: Math.round(window.__game.distance) }));
    if (r.d.length) { deaths++; patterns.push(JSON.stringify(r.d[0])); }
    console.log(`  fairness run ${i + 1}/${RUNS}: dist=${r.dist} deaths=${r.d.length}`);
  }
  check(`fairness: perfect bot survives max difficulty (${RUNS} x ${CAP_MS / 1000}s)`, deaths === 0, patterns.join(' || ').slice(0, 400));
  await ctx.close();
}

await browser.close();
server.proc.kill();
console.log(failures.length ? `\n${failures.length} FAILURE(S)` : '\nALL GREEN');
process.exit(failures.length ? 1 : 0);
