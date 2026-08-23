/* Stickman Parkour — core pseudo-3D endless runner engine. */
(function (global) {
  'use strict';

  const TAU = Math.PI * 2;
  const ZFAR = 78;
  const COLLIDE_Z = 2.9;      // obstacle center must be right at the runner
  const COLLIDE_BEHIND = -0.6; // once it has passed the chest, it cannot hurt
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const OBSTACLE_DEFS = {
    hurdle:    { h: 0.30, ratio: 175 / 180, clearY: 0.28, anchor: 158 / 175 },
    slideGate: { h: 0.39, ratio: 180 / 185, anchor: 172 / 185 },
    wall:      { h: 0.72, ratio: 150 / 420, anchor: 414 / 420 }
  };
  const LANES = [-1, 0, 1];

  class Game {
    constructor(canvas, ui) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.ui = ui;
      this.audio = new global.AudioSys();
      this.assetsReady = false;
      this.defs = null;

      this.state = 'title';
      this.time = 0;
      this.distance = 0;
      this.score = 0;
      this.coins = 0;
      this.best = 0;
      try { this.best = Number(localStorage.getItem('sp-best') || 0); } catch (e) { /* ignore */ }

      this.worldOffset = 0;
      this.speed = 15;
      this.difficulty = 0;
      this.spawnTimer = 1.15;
      this.shake = 0;
      this.flash = 0;
      this.milestoneLevel = 0;
      this.nextSneakerTime = rand(7, 12);
      this.pigeonTimer = rand(6, 12);
      this.pigeons = [];
      this.pigeonSide = 1;

      this.obstacles = [];
      this.pickups = [];
      this.popups = [];
      this.particles = [];

      this.player = this.resetPlayer();
      this.resize();
      this.bindWindow();
    }

    resetPlayer() {
      return {
        lane: 0,
        targetLane: 0,
        y: 0,
        vy: 0,
        grounded: true,
        jumpsUsed: 0,
        maxJumps: 1,
        sliding: false,
        slideTimer: 0,
        jumpBuffer: 0,
        runPhase: 0,
        lean: 0,
        sneakerTimer: 0,
        crashT: -1,
        crashed: false
      };
    }

    async initAssets() {
      this.defs = global.Assets.makeSprites();
      await global.Assets.preload(this.defs);
      this.assetsReady = true;
      this.startLoop();
    }

    bindWindow() {
      const onResize = () => this.resize();
      global.addEventListener('resize', onResize);
      global.addEventListener('orientationchange', onResize);
    }

    resize() {
      const dpr = Math.min(global.devicePixelRatio || 1, 2);
      const w = this.canvas.clientWidth || global.innerWidth;
      const h = this.canvas.clientHeight || global.innerHeight;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.w = w;
      this.h = h;
      this.cx = w / 2;
      this.horizon = Math.round(h * 0.285);
      this.groundBase = Math.round(h * 0.885);
      this.depth = Math.max(180, this.groundBase - this.horizon);
      this.laneHalf = Math.min(w * 0.225, h * 0.255, 245);
      this.playerH = Math.min(this.depth * 0.48, this.w * 0.42);
      this.playerW = this.playerH * (160 / 215);
      this.maxJumpY = this.depth * 0.42;
      this.jumpDuration = 0.62;
      this.gravity = (2 * this.maxJumpY) / ((this.jumpDuration / 2) ** 2);
      this.jumpVelocity = Math.sqrt(2 * this.gravity * this.maxJumpY);
    }

    startLoop() {
      let last = performance.now();
      const frame = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
        last = now;
        this.update(dt);
        this.render();
        this.raf = requestAnimationFrame(frame);
      };
      this.raf = requestAnimationFrame(frame);
    }

    // ------------------------------------------------------------------ input
    input(action) {
      if (action === 'mute') {
        this.audio.ensure();
        this.audio.setMuted(!this.audio.muted);
        this.ui.updateMute(this.audio.muted);
        return;
      }
      if (action === 'pause') {
        if (this.state === 'running') this.pauseGame();
        else if (this.state === 'paused') this.resumeGame();
        return;
      }
      if (this.state === 'paused' && (action === 'jump' || action === 'start')) {
        this.resumeGame();
        return;
      }
      if (action === 'menu') {
        this.returnToTitle();
        return;
      }
      if (this.state === 'title') {
        if (action === 'jump' || action === 'start') this.startRun();
        return;
      }
      if (this.state === 'gameover' && (action === 'jump' || action === 'start')) {
        this.startRun();
        return;
      }
      if (this.state !== 'running') return;

      const p = this.player;
      if (action === 'left') this.changeLane(-1);
      else if (action === 'right') this.changeLane(1);
      else if (action === 'jump') this.startJump();
      else if (action === 'slide') this.startSlide();
    }

    changeLane(dir, silent = false) {
      const p = this.player;
      const target = clamp(p.targetLane + dir, -1, 1);
      if (target !== p.targetLane) {
        p.targetLane = target;
        if (!silent) this.audio.lane();
      }
    }

    startJump(silent = false) {
      const p = this.player;
      if (p.sliding) p.sliding = false;
      if (p.grounded) {
        p.grounded = false;
        p.vy = this.jumpVelocity;
        p.jumpsUsed = 1;
        p.slideTimer = 0;
        this.spawnDust(7);
        if (!silent) this.audio.jump();
      } else if (p.jumpsUsed < p.maxJumps) {
        p.vy = this.jumpVelocity * 0.86;
        p.jumpsUsed += 1;
        this.spawnAirRing();
        if (!silent) this.audio.doubleJump();
      } else {
        // Pressed slightly too early while airborne: remember it briefly so
        // the jump fires the instant we touch down instead of being eaten.
        p.jumpBuffer = 0.12;
      }
    }

    startSlide(silent = false) {
      const p = this.player;
      if (!p.grounded) return;
      // Re-arm: a second gate arriving just after the first slide expires must
      // not be unslidable. Refreshing a nearly-depleted slide is allowed;
      // a fresh one is not restarted (prevents mash-spam dust/sound).
      if (p.sliding) {
        if (p.slideTimer > 0.4) return;
        p.slideTimer = 0.72;
        if (!silent) this.audio.slide();
        return;
      }
      p.sliding = true;
      p.slideTimer = 0.72;
      this.spawnDust(10);
      if (!silent) this.audio.slide();
    }

    startRun() {
      this.audio.ensure();
      this.audio.setMuted(this.audio.muted);
      this.audio.startMusic();

      this.state = 'running';
      this.time = 0;
      this.distance = 0;
      this.score = 0;
      this.coins = 0;
      this.worldOffset = 0;
      this.speed = 15;
      this.difficulty = 0;
      this.spawnTimer = 1.15;
      this.shake = 0;
      this.flash = 0;
      this.milestoneLevel = 0;
      this.nextSneakerTime = rand(7, 12);
      this.pigeonTimer = rand(5, 10);
      this.pigeons = [];
      this.obstacles = [];
      this.pickups = [];
      this.popups = [];
      this.particles = [];
      this.player = this.resetPlayer();
      this.ui.startRun();
    }

    returnToTitle() {
      this.state = 'title';
      this.obstacles = [];
      this.pickups = [];
      this.popups = [];
      this.particles = [];
      this.pigeons = [];
      this.shake = 0;
      this.flash = 0;
      this.audio.stopMusic();
      this.player = this.resetPlayer();
      this.attractTimer = 0;
      this.ui.showTitle();
    }

    pauseGame() {
      if (this.state !== 'running') return;
      this.state = 'paused';
      this.audio.stopMusic();
      this.ui.showPause(true);
    }

    resumeGame() {
      if (this.state !== 'paused') return;
      this.state = 'running';
      this.audio.ensure();
      this.audio.startMusic();
      this.ui.showPause(false);
    }

    gameOver() {
      this.state = 'gameover';
      this.audio.stopMusic();
      const isRecord = this.score > this.best;
      if (isRecord) {
        this.best = this.score;
        try { localStorage.setItem('sp-best', String(this.best)); } catch (e) { /* ignore */ }
      }
      this.ui.showGameOver({
        score: Math.floor(this.score),
        distance: Math.floor(this.distance),
        coins: this.coins,
        best: Math.floor(this.best),
        isRecord
      });
    }

    // ----------------------------------------------------------------- update
    update(dt) {
      this.time += dt;
      this.updateClouds(dt);
      if (this.state === 'title') this.updateTitle(dt);
      else if (this.state === 'running') this.updateRunning(dt);
      else if (this.state === 'crashing') this.updateCrashing(dt);

      this.updatePopups(dt);
      this.updateParticles(dt);
      this.updatePigeons(dt);
      this.shake = Math.max(0, this.shake - dt * 2.4);
      this.flash = Math.max(0, this.flash - dt * 2.5);
      if (this.ui && this.ui.updateHUD) {
        this.ui.updateHUD(this.score, this.distance, this.coins, this.best, this.player.sneakerTimer);
      }
    }

    updateClouds(dt) {
      if (!this.clouds) {
        this.clouds = [
          { x: this.w * 0.12, y: this.horizon * 0.45, s: 0.7, v: 6 },
          { x: this.w * 0.48, y: this.horizon * 0.25, s: 0.5, v: 9 },
          { x: this.w * 0.78, y: this.horizon * 0.55, s: 0.85, v: 5 },
          { x: this.w * 0.95, y: this.horizon * 0.32, s: 0.62, v: 8 }
        ];
      }
      for (const c of this.clouds) {
        c.x += c.v * dt;
        if (c.x > this.w + 180) c.x = -170;
      }
    }

    updateTitle(dt) {
      this.worldOffset += 14 * dt;
      const p = this.player;
      p.runPhase += dt * (1.4 + 14 * 0.05);
      this.updatePlayerPhysics(dt, 14);
      this.attractTimer = (this.attractTimer || 0) - dt;
      if (this.attractTimer <= 0) {
        this.attractTimer = rand(0.9, 1.8);
        const roll = Math.random();
        if (roll < 0.34) this.startJump(true);
        else if (roll < 0.56) this.startSlide(true);
        else this.changeLane(pick([-1, 1]), true);
      }
      this.spawnDust(p.grounded ? 1 : 0, 0.25);
    }

    updateRunning(dt) {
      this.difficulty = clamp((this.distance - 60) / 1400, 0, 1);
      const boost = this.player.sneakerTimer > 0 ? 1.22 : 1;
      const targetSpeed = lerp(15, 40, this.difficulty) * boost;
      this.speed = lerp(this.speed, targetSpeed, 1 - Math.exp(-dt * 1.2));
      this.distance += this.speed * dt * 0.5;
      this.score += this.speed * dt * 0.5 * 8;
      this.worldOffset += this.speed * dt;

      const p = this.player;
      p.runPhase += dt * (1.4 + this.speed * 0.055);
      if (p.sneakerTimer > 0) {
        p.sneakerTimer -= dt;
        if (p.sneakerTimer <= 0) {
          p.sneakerTimer = 0;
          p.maxJumps = 1;
          this.addPopup('GOLD KICKS ENDED', this.cx, this.h * 0.3, '#ffd166');
        }
        this.spawnTrail(dt);
      }

      this.updatePlayerPhysics(dt, this.speed);
      this.updateSpawns(dt);
      this.updateWorldObjects(dt);
      this.updateCollisions();
      this.updateMilestones();
      this.updateAmbient(dt);

      if (p.grounded || p.sliding) this.spawnDust(p.sliding ? 2 : 1, p.sliding ? 0.35 : 0.16);
    }

    updatePlayerPhysics(dt, speed) {
      const p = this.player;
      const laneLerp = 1 - Math.exp(-dt * 12.5);
      const oldLane = p.lane;
      p.lane = lerp(p.lane, p.targetLane, laneLerp);
      p.lean = lerp(p.lean, clamp((p.targetLane - p.lane) * 2.4 + (p.lane - oldLane) * 18, -1.4, 1.4), 1 - Math.exp(-dt * 8));

      if (!p.grounded) {
        p.vy -= this.gravity * dt;
        p.y += p.vy * dt;
        if (p.y <= 0) {
          p.y = 0;
          p.vy = 0;
          p.grounded = true;
          p.jumpsUsed = 0;
          this.spawnDust(8);
          if (p.jumpBuffer > 0) {
            p.jumpBuffer = 0;
            this.startJump();
          }
        }
      } else {
        p.y = 0;
      }

      if (p.jumpBuffer > 0) p.jumpBuffer -= dt;

      if (p.sliding) {
        p.slideTimer -= dt;
        if (p.slideTimer <= 0) p.sliding = false;
      }

      if (p.crashT >= 0) p.crashT += dt;
      void speed;
    }

    updateSpawns(dt) {
      this.spawnTimer -= dt;
      if (this.spawnTimer > 0) return;
      const d = this.difficulty;
      const interval = lerp(1.38, 0.78, d);
      this.spawnTimer = interval * rand(0.82, 1.18);
      this.spawnWave();

      this.nextSneakerTime -= interval * rand(0.82, 1.18) * 0.55;
      if (this.nextSneakerTime <= 0 && this.player.sneakerTimer <= 0 && this.distance > 220) {
        this.spawnSneaker();
        this.nextSneakerTime = rand(11, 18);
      }
    }

    spawnWave() {
      const d = this.difficulty;
      const lanes = [...LANES];
      this.waveId = (this.waveId || 0) + 1;

      if (Math.random() < lerp(0.24, 0.10, d)) {
        this.spawnCoinLine(pick(lanes));
        return;
      }

      const roll = Math.random();
      if (d < 0.16) {
        this.spawnSingle(roll < 0.82 ? 'hurdle' : 'slideGate', pick(lanes));
      } else if (d < 0.42) {
        if (roll < 0.48) {
          this.spawnSingle(Math.random() < 0.65 ? 'hurdle' : 'slideGate', pick(lanes));
        } else if (roll < 0.74) {
          const a = pick(lanes); let b = pick(lanes.filter(l => l !== a));
          this.spawnObstacle('hurdle', a, ZFAR);
          this.spawnObstacle('slideGate', b, ZFAR + rand(3, 6));
          if (Math.random() < 0.55) this.spawnCoinLine(pick(lanes.filter(l => l !== a && l !== b)));
        } else {
          this.spawnWallDodge(d);
        }
      } else {
        if (roll < 0.42) {
          const a = pick(lanes); const b = pick(lanes.filter(l => l !== a));
          this.spawnObstacle(Math.random() < 0.5 ? 'hurdle' : 'slideGate', a, ZFAR);
          this.spawnObstacle('slideGate', b, ZFAR + rand(3, 6));
          if (Math.random() < 0.6) this.spawnCoinLine(pick(lanes.filter(l => l !== a && l !== b)));
        } else if (roll < 0.78) {
          this.spawnWallDodge(d);
        } else {
          const a = pick(lanes); const b = pick(lanes.filter(l => l !== a));
          this.spawnObstacle('wall', a, ZFAR);
          const wallBz = ZFAR + rand(5, 8);
          this.spawnObstacle('wall', b, wallBz);
          const open = lanes.find(l => l !== a && l !== b);
          // The escape-lane action must not fire while the player is still
          // completing the wall dodge: give it a speed-proportional head start.
          this.spawnObstacle(Math.random() < 0.6 ? 'hurdle' : 'slideGate', open, wallBz + lerp(9, 13, d));
        }
      }

      // A normal obstacle wave can carry a short coin trail through the safe line.
      if (Math.random() < 0.30) {
        this.spawnCoinLine(pick(lanes), 4);
      }
      this.enforceWaveSpacing();
    }

    // Fairness guard: consecutive waves may interleave, but the next required
    // action must stay reaction-feasible — at least ~0.24s after the previous
    // obstacle, plus lane-travel time when it sits in a different lane. A
    // hurdle-first same-lane chain gets a wider gap because the jump occupies
    // the lane for its full duration. Runs to a fixed point so a push can
    // never drop the obstacle right in front of a later old one. (Invariant:
    // fresh waves spawn at ZFAR behind all live obstacles, so only pushing
    // fresh z forward is needed.)
    enforceWaveSpacing() {
      const w = this.waveId;
      const fresh = this.obstacles.filter(o => o.wave === w);
      const old = this.obstacles.filter(o => o.wave !== w && !o.smashed && o.z > 3);
      for (const n of fresh) {
        let changed = true;
        let passes = 0;
        while (changed && passes++ < 8) {
          changed = false;
          for (const ob of old) {
            if (ob.z >= n.z) continue;
            const laneDist = Math.min(2, Math.abs(ob.lane - n.lane));
            let minGap = this.speed * (0.24 + 0.09 * laneDist);
            if (ob.kind === 'hurdle' && laneDist === 0) minGap = Math.max(minGap, this.speed * 0.75);
            if (n.z - ob.z < minGap) {
              n.z = ob.z + minGap;
              changed = true;
            }
          }
        }
      }
    }

    spawnWallDodge(d) {
      const openLane = pick(LANES);
      const blocked = LANES.filter(l => l !== openLane);
      const stagger = lerp(7, 3.5, d);
      this.spawnObstacle('wall', blocked[0], ZFAR);
      this.spawnObstacle('wall', blocked[1], ZFAR + stagger);
      if (Math.random() < 0.45) this.spawnCoinLine(openLane, 4);
    }

    spawnSingle(kind, lane) {
      this.spawnObstacle(kind, lane, ZFAR);
      if (Math.random() < 0.42) {
        const alt = LANES.filter(l => l !== lane);
        this.spawnCoinLine(pick(alt), 3);
      }
    }

    spawnObstacle(kind, lane, z) {
      this.obstacles.push({
        kind,
        lane,
        z,
        passed: false,
        smashed: false,
        nearMissGiven: false,
        spawnZ: z,
        wave: this.waveId || 0
      });
    }

    spawnCoinLine(lane, count) {
      const n = Math.floor(count || rand(5, 8));
      const spacing = 3.4;
      for (let i = 0; i < n; i++) {
        this.pickups.push({
          kind: 'coin',
          lane,
          z: ZFAR + i * spacing,
          bob: rand(0, TAU),
          taken: false,
          baseZ: ZFAR + i * spacing
        });
      }
    }

    spawnSneaker() {
      this.pickups.push({
        kind: 'sneaker',
        lane: pick(LANES),
        z: ZFAR,
        bob: 0,
        taken: false,
        baseZ: ZFAR
      });
      this.addPopup('GOLDEN KICKS AHEAD!', this.cx, this.h * 0.34, '#ffd166');
    }

    updateWorldObjects(dt) {
      const s = this.speed;
      for (const ob of this.obstacles) ob.z -= s * dt;
      for (const pk of this.pickups) {
        pk.z -= s * dt;
        pk.bob += dt * 5;
        if (pk.kind === 'coin' && this.player.sneakerTimer > 0 && pk.z < 40 && pk.z > -3) {
          const pull = 1 - Math.exp(-dt * 6.5);
          pk.lane = lerp(pk.lane, this.player.lane, pull);
          pk.z -= this.speed * dt * 2.4 * (1 - Math.abs(pk.lane - this.player.lane) * 0.4);
        }
      }
      this.obstacles = this.obstacles.filter(o => o.z > -6 && !o.smashed);
      this.pickups = this.pickups.filter(p => p.z > -6 && !p.taken);
    }

    updateCollisions() {
      const p = this.player;
      const jumpNorm = p.y / this.maxJumpY;

      // Pickups first: coins can still be collected while an obstacle is close.
      for (const pk of this.pickups) {
        if (pk.taken || pk.z < -2.4 || pk.z > 4.4) continue;
        if (Math.abs(pk.lane - p.lane) > 0.58) continue;
        this.collect(pk);
      }

      // Obstacles
      for (const ob of this.obstacles) {
        if (ob.passed || ob.smashed || ob.z > COLLIDE_Z || ob.z < COLLIDE_BEHIND) continue;
        const sameLane = Math.abs(ob.lane - p.lane) < 0.5;

        if (ob.kind === 'hurdle') {
          if (sameLane && jumpNorm < OBSTACLE_DEFS.hurdle.clearY) {
            if (p.sneakerTimer > 0) this.smashObstacle(ob);
            else this.crash(ob);
            continue;
          }
          if (sameLane && !ob.nearMissGiven && jumpNorm >= OBSTACLE_DEFS.hurdle.clearY) {
            ob.nearMissGiven = true;
            this.addNearMiss(ob, 'CLEAN JUMP');
          }
        } else if (ob.kind === 'slideGate') {
          if (sameLane && !p.sliding) {
            if (p.sneakerTimer > 0) this.smashObstacle(ob);
            else this.crash(ob);
            continue;
          }
          if (sameLane && !ob.nearMissGiven && p.sliding) {
            ob.nearMissGiven = true;
            this.addNearMiss(ob, 'SMOOTH SLIDE');
          }
        } else if (ob.kind === 'wall') {
          if (sameLane) {
            if (p.sneakerTimer > 0) this.smashObstacle(ob);
            else this.crash(ob);
            continue;
          }
        }

        if (ob.z < -2.2) ob.passed = true;
        if (this.state !== 'running') return;
      }
    }

    collect(pk) {
      pk.taken = true;
      if (pk.kind === 'coin') {
        this.coins += 1;
        this.score += 15;
        this.audio.coin();
        if (global.navigator && navigator.vibrate) navigator.vibrate(12);
        this.addPopup('+15', this.project(pk.lane, 1).x, this.h * 0.52, '#ffd166', 0.55);
        this.spawnBurst(this.project(pk.lane, 1).x, this.project(pk.lane, 1).y - this.depth * 0.06, '#ffd166', 8);
      } else if (pk.kind === 'sneaker') {
        const p = this.player;
        p.sneakerTimer = 8;
        p.maxJumps = 2;
        this.score += 100;
        this.audio.powerup();
        if (global.navigator && navigator.vibrate) navigator.vibrate([28, 34, 28]);
        this.flash = 0.55;
        this.addPopup('GOLD KICKS!', this.cx, this.h * 0.28, '#ffd166', 1.4);
        this.spawnBurst(this.project(pk.lane, 1).x, this.project(pk.lane, 1).y, '#ffd166', 18);
      }
    }

    smashObstacle(ob) {
      ob.smashed = true;
      const pr = this.project(ob.lane, Math.max(0, ob.z));
      this.score += 50;
      this.audio.smash();
      this.shake = Math.max(this.shake, 0.35);
      this.addPopup('SMASH +50', pr.x, pr.y - this.depth * 0.3, '#ff5d8f', 0.8);
      this.spawnBurst(pr.x, pr.y - this.depth * 0.2, '#ff5d8f', 16);
      this.spawnBurst(pr.x, pr.y - this.depth * 0.2, '#ffd166', 10);
    }

    addNearMiss(ob, label) {
      const pr = this.project(ob.lane, Math.max(0, ob.z));
      this.score += 25;
      this.audio.nearMiss();
      this.addPopup(`${label} +25`, pr.x, pr.y - this.depth * 0.34, '#4df3e0', 0.9);
    }

    crash(ob) {
      const p = this.player;
      p.crashed = true;
      p.crashT = 0;
      this.state = 'crashing';
      this.audio.crash();
      if (global.navigator && navigator.vibrate) navigator.vibrate([70, 40, 110]);
      this.shake = 1;
      this.flash = 0.35;
      const pr = this.project(p.lane, 1);
      this.spawnBurst(pr.x, pr.y - this.depth * 0.25, '#ffffff', 14);
      this.spawnBurst(pr.x, pr.y - this.depth * 0.25, '#ff5d8f', 18);
      this.ui.showCrash();
    }

    updateCrashing(dt) {
      const p = this.player;
      if (p.crashT >= 0) p.crashT += dt;
      this.shake = Math.max(this.shake, 0.25);
      if (p.crashT > 0.95) {
        p.crashT = -1;
        this.gameOver();
      }
    }

    updateMilestones() {
      const next = Math.floor(this.distance / 500);
      if (next > this.milestoneLevel) {
        this.milestoneLevel = next;
        const bonus = 100 * next;
        this.score += bonus;
        this.audio.milestone();
        this.addPopup(`${next * 500}m  +${bonus}`, this.cx, this.h * 0.30, '#4df3e0', 1.6);
        for (let i = 0; i < 5; i++) {
          this.spawnFirework(this.w * (0.18 + Math.random() * 0.64), this.h * (0.12 + Math.random() * 0.18));
        }
      }
    }

    updateAmbient(dt) {
      this.pigeonTimer -= dt;
      if (this.pigeonTimer <= 0) {
        this.pigeonTimer = rand(14, 24);
        this.launchPigeons();
      }
    }

    launchPigeons() {
      const fromLeft = Math.random() < 0.5;
      const y = this.horizon + this.depth * rand(0.04, 0.34);
      const count = Math.floor(rand(5, 9));
      for (let i = 0; i < count; i++) {
        this.pigeons.push({
          x: fromLeft ? rand(-160, -40) : this.w + rand(40, 160),
          y: y + rand(-26, 26),
          vx: (fromLeft ? 1 : -1) * rand(170, 280),
          s: rand(0.45, 1.15),
          flap: rand(0, TAU),
          flapSpeed: rand(7, 13)
        });
      }
    }

    updatePigeons(dt) {
      if (this.state === 'paused') return;
      for (const b of this.pigeons) {
        b.x += b.vx * dt;
        b.y += Math.sin(b.flap) * 10 * dt;
        b.flap += b.flapSpeed * dt;
      }
      this.pigeons = this.pigeons.filter(b => b.x > -220 && b.x < this.w + 220);
    }

    updatePopups(dt) {
      for (const p of this.popups) {
        p.life -= dt;
        p.y -= dt * 22;
      }
      this.popups = this.popups.filter(p => p.life > 0);
    }

    updateParticles(dt) {
      for (const p of this.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += p.grav * dt;
        p.life -= dt;
        p.rot += p.rotV * dt;
      }
      this.particles = this.particles.filter(p => p.life > 0);
    }

    // -------------------------------------------------------------- particles
    spawnDust(count, power = 1) {
      if (this.state !== 'running' && this.state !== 'title') return;
      const pr = this.project(this.player.lane, 0.6);
      for (let i = 0; i < count; i++) {
        this.particles.push({
          x: pr.x + rand(-8, 8),
          y: pr.y + rand(-2, 3),
          vx: rand(-36, 36) * power,
          vy: rand(-60, -12) * power,
          grav: 130 * power,
          life: rand(0.2, 0.45),
          maxLife: 0.45,
          size: rand(1.5, 3.6),
          color: 'rgba(174, 226, 255, 0.8)',
          rot: 0,
          rotV: 0
        });
      }
    }

    spawnTrail(dt) {
      this.trailAcc = (this.trailAcc || 0) + dt;
      if (this.trailAcc < 0.035) return;
      this.trailAcc = 0;
      const pr = this.project(this.player.lane, 0.8);
      this.particles.push({
        x: pr.x + rand(-12, 12),
        y: pr.y - rand(0, this.playerH * 0.6),
        vx: rand(-20, 20),
        vy: rand(-35, -5),
        grav: -20,
        life: rand(0.35, 0.7),
        maxLife: 0.7,
        size: rand(2, 4.5),
        color: 'rgba(255, 209, 102, 0.95)',
        rot: 0,
        rotV: 0
      });
    }

    spawnAirRing() {
      const pr = this.project(this.player.lane, 0.8);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        this.particles.push({
          x: pr.x,
          y: pr.y - this.depth * 0.2,
          vx: Math.cos(a) * 90,
          vy: Math.sin(a) * 60,
          grav: -10,
          life: 0.38,
          maxLife: 0.38,
          size: 2,
          color: 'rgba(77, 243, 224, 0.9)',
          rot: 0,
          rotV: 0
        });
      }
    }

    spawnBurst(x, y, color, count) {
      for (let i = 0; i < count; i++) {
        const a = rand(0, TAU);
        const sp = rand(70, 330);
        this.particles.push({
          x, y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 60,
          grav: 420,
          life: rand(0.35, 0.8),
          maxLife: 0.8,
          size: rand(1.5, 4),
          color,
          rot: rand(0, TAU),
          rotV: rand(-8, 8)
        });
      }
    }

    spawnFirework(x, y) {
      const colors = ['#ff5d8f', '#4df3e0', '#ffd166', '#8c5bff', '#eaf6ff'];
      for (let i = 0; i < 34; i++) {
        const a = (i / 34) * TAU;
        const sp = rand(80, 260);
        this.particles.push({
          x, y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          grav: 95,
          life: rand(0.7, 1.3),
          maxLife: 1.3,
          size: rand(1.5, 3.4),
          color: pick(colors),
          rot: rand(0, TAU),
          rotV: rand(-4, 4)
        });
      }
    }

    addPopup(text, x, y, color, life = 0.9) {
      this.popups.push({
        text,
        x: clamp(x, 60, this.w - 60),
        y,
        color,
        life,
        maxLife: life
      });
    }

    // ------------------------------------------------------------- projection
    project(lane, z) {
      const nz = clamp(z / ZFAR, 0, 1);
      const persp = 1 - nz;
      const spread = 0.055 + 0.945 * persp;
      return {
        x: this.cx + lane * this.laneHalf * spread,
        y: this.horizon + this.depth * spread,
        spread,
        scale: 0.17 + 0.83 * persp
      };
    }

    // ----------------------------------------------------------------- render
    render() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.w, this.h);
      ctx.save();
      if (this.shake > 0) {
        ctx.translate(rand(-1, 1) * this.shake * 12, rand(-1, 1) * this.shake * 9);
      }
      this.drawSky(ctx);
      this.drawSkyline(ctx);
      this.drawRoad(ctx);
      this.drawPigeons(ctx);
      this.drawWorld(ctx);
      this.drawPlayer(ctx);
      this.drawParticles(ctx);
      this.drawPopups(ctx);
      this.drawVignette(ctx);
      if (this.flash > 0) {
        ctx.fillStyle = `rgba(255, 230, 180, ${this.flash * 0.25})`;
        ctx.fillRect(-20, -20, this.w + 40, this.h + 40);
      }
      ctx.restore();
    }

    drawSky(ctx) {
      const g = ctx.createLinearGradient(0, 0, 0, this.horizon + 4);
      g.addColorStop(0, '#050714');
      g.addColorStop(0.45, '#131b3d');
      g.addColorStop(0.8, '#3a2454');
      g.addColorStop(1, '#7a2f55');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.w, this.horizon + 4);

      // stars
      ctx.fillStyle = 'rgba(234,246,255,0.8)';
      for (let i = 0; i < 26; i++) {
        const sx = ((i * 97 + 31) % 1000) / 1000 * this.w;
        const sy = ((i * 53 + 17) % 1000) / 1000 * this.horizon * 0.85;
        const tw = 0.35 + 0.65 * Math.abs(Math.sin(this.time * 0.8 + i * 1.7));
        ctx.globalAlpha = tw * 0.65;
        ctx.fillRect(sx, sy, 1.6, 1.6);
      }
      ctx.globalAlpha = 1;

      const sun = global.Assets.get(this.defs, 'sun');
      if (sun) {
        const sw = Math.min(this.w * 0.4, this.h * 0.34);
        const sh = sw * 220 / 260;
        ctx.drawImage(sun, this.w - sw * 0.9, this.horizon - sh * 0.72, sw, sh);
      }
      const cloud = global.Assets.get(this.defs, 'cloud');
      if (cloud) {
        for (const c of this.clouds || []) {
          const cw = 170 * c.s;
          const ch = cw * 100 / 260;
          ctx.drawImage(cloud, c.x, c.y, cw, ch);
        }
      }
    }

    drawSkyline(ctx) {
      const img = global.Assets.get(this.defs, 'skyline');
      if (!img) return;
      const w = this.w;
      const h = Math.min(w * 0.21, this.depth * 0.72);
      ctx.globalAlpha = 0.95;
      ctx.drawImage(img, 0, this.horizon - h * 0.78, w, h);
      ctx.globalAlpha = 1;
      // Neon horizon line
      const g = ctx.createLinearGradient(0, this.horizon, 0, this.horizon + 8);
      g.addColorStop(0, 'rgba(77,243,224,0.05)');
      g.addColorStop(0.5, 'rgba(77,243,224,0.55)');
      g.addColorStop(1, 'rgba(77,243,224,0.05)');
      ctx.fillStyle = g;
      ctx.fillRect(0, this.horizon - 1, this.w, 7);
    }

    drawRoad(ctx) {
      const ground = ctx.createLinearGradient(0, this.horizon, 0, this.h);
      ground.addColorStop(0, '#191c3a');
      ground.addColorStop(0.45, '#10142a');
      ground.addColorStop(1, '#080b18');
      ctx.fillStyle = ground;
      ctx.fillRect(0, this.horizon, this.w, this.h - this.horizon);

      const halfTop = this.laneHalf * 1.52 * 0.055;
      const halfBottom = this.laneHalf * 1.52 * 1.16;
      const yTop = this.horizon;
      const yBottom = this.h + 40;

      ctx.beginPath();
      ctx.moveTo(this.cx - halfTop, yTop);
      ctx.lineTo(this.cx - halfBottom, yBottom);
      ctx.lineTo(this.cx + halfBottom, yBottom);
      ctx.lineTo(this.cx + halfTop, yTop);
      ctx.closePath();
      const road = ctx.createLinearGradient(0, yTop, 0, yBottom);
      road.addColorStop(0, '#20264c');
      road.addColorStop(0.3, '#181d3c');
      road.addColorStop(1, '#0d1126');
      ctx.fillStyle = road;
      ctx.fill();
      ctx.strokeStyle = 'rgba(77,243,224,0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // horizontal speed stripes
      const spacing = 8;
      const scroll = this.worldOffset % spacing;
      ctx.lineCap = 'round';
      for (let i = 0; i < 15; i++) {
        const z = (i + 1) * spacing - scroll;
        if (z < 0.3 || z > ZFAR) continue;
        const pr = this.project(0, z);
        const half = this.laneHalf * 1.48 * pr.spread;
        ctx.strokeStyle = `rgba(77,243,224,${0.14 + 0.3 * (1 - z / ZFAR)})`;
        ctx.lineWidth = 1.2 + 3 * (1 - z / ZFAR);
        ctx.beginPath();
        ctx.moveTo(this.cx - half, pr.y);
        ctx.lineTo(this.cx + half, pr.y);
        ctx.stroke();
      }

      // lane separators
      const boundaries = [-0.5, 0.5];
      ctx.lineCap = 'butt';
      for (const b of boundaries) {
        for (let i = 0; i < 14; i++) {
          const z1 = i * 5.6 - (this.worldOffset % 5.6);
          const z2 = z1 + 3.1;
          if (z2 < 0 || z1 > ZFAR) continue;
          const p1 = this.project(b, clamp(z1, 0, ZFAR));
          const p2 = this.project(b, clamp(z2, 0, ZFAR));
          ctx.strokeStyle = `rgba(234,246,255,${0.08 + 0.42 * p1.spread})`;
          ctx.lineWidth = 1 + 3.4 * p1.spread;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }

      // curbs
      for (const side of [-1.52, 1.52]) {
        const pNear = this.project(side, 0.5);
        const pFar = this.project(side, ZFAR);
        ctx.strokeStyle = 'rgba(255,93,143,0.75)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(pNear.x, pNear.y);
        ctx.lineTo(pFar.x, pFar.y);
        ctx.stroke();
      }
    }

    drawPigeons(ctx) {
      if (!this.defs) return;
      const frame = Math.floor(this.time * 11) % 2;
      const img = global.Assets.get(this.defs, 'bird', frame);
      if (!img) return;
      for (const b of this.pigeons) {
        const w = 52 * b.s;
        const h = w * 60 / 90;
        ctx.globalAlpha = 0.85;
        ctx.drawImage(img, b.x - w / 2, b.y - h / 2, w, h);
      }
      ctx.globalAlpha = 1;
    }

    drawWorld(ctx) {
      const items = [];
      for (const ob of this.obstacles) {
        if (ob.z < 0.2 || ob.z > ZFAR) continue;
        const def = OBSTACLE_DEFS[ob.kind];
        const pr = this.project(ob.lane, ob.z);
        const assetKey = ob.kind === 'wall' ? 'dodgeWall' : ob.kind;
        const h = def.h * this.depth * pr.scale;
        // Walls fill their lane: width tracks lane spacing so the barrier reads
        // as a full-lane blocker at every aspect ratio, unlike height-based ratios.
        const w = ob.kind === 'wall' ? this.laneHalf * 0.95 * pr.spread : h * def.ratio;
        items.push({
          z: ob.z,
          draw: () => {
            this.drawGroundShadow(ctx, pr, w * 0.72, 0.30);
            this.drawSprite(ctx, assetKey, pr, h, def.ratio, undefined, def.anchor, w);
          }
        });
      }
      for (const pk of this.pickups) {
        if (pk.z < 0.2 || pk.z > ZFAR) continue;
        const pr = this.project(pk.lane, pk.z);
        const isCoin = pk.kind === 'coin';
        const h = (isCoin ? 0.105 : 0.145) * this.depth * pr.scale;
        const ratio = isCoin ? 1 : 140 / 100;
        const y = pr.y - h - (isCoin ? Math.sin(pk.bob) * h * 0.35 : Math.sin(pk.bob * 0.7) * h * 0.2);
        items.push({ z: pk.z, draw: () => this.drawSprite(ctx, pk.kind, pr, h, ratio, y) });
      }
      items.sort((a, b) => b.z - a.z);
      for (const item of items) item.draw();
    }

    drawGroundShadow(ctx, pr, w, alpha) {
      ctx.fillStyle = `rgba(0,0,0,${alpha})`;
      ctx.beginPath();
      ctx.ellipse(pr.x, pr.y, w / 2, Math.max(3, w * 0.055), 0, 0, TAU);
      ctx.fill();
    }

    drawSprite(ctx, key, pr, h, ratio, overrideY, anchor, explicitW) {
      const img = global.Assets.get(this.defs, key);
      if (!img) return;
      const w = explicitW !== undefined ? explicitW : h * ratio;
      const x = pr.x;
      const y = overrideY !== undefined ? overrideY : pr.y - h * (anchor || 1);
      ctx.drawImage(img, x - w / 2, y, w, h);
    }

    drawPlayer(ctx) {
      const p = this.player;
      const pr = this.project(p.lane, 0.9);
      const h = this.playerH;
      const w = this.playerW;

      // shadow
      const air = clamp(p.y / this.maxJumpY, 0, 1);
      const shadowW = w * (0.72 - air * 0.34);
      const shadowH = Math.max(5, h * 0.055 * (1 - air * 0.55));
      ctx.fillStyle = `rgba(0,0,0,${0.34 - air * 0.18})`;
      ctx.beginPath();
      ctx.ellipse(pr.x, pr.y, shadowW / 2, shadowH / 2, 0, 0, TAU);
      ctx.fill();

      let img = null;
      let yOff = p.y;
      let rotation = 0;
      let spriteH = h;
      let anchor = 0.87; // run-cycle grounded foot position inside the SVG viewBox

      if (p.crashed) {
        img = global.Assets.get(this.defs, 'stickman', 'defeated');
        rotation = 2.35;
        yOff = 0;
        spriteH = h * 0.92;
        anchor = 0.61;
      } else if (p.crashT >= 0) {
        img = global.Assets.get(this.defs, 'stickman', 'defeated');
        const t = Math.min(1, p.crashT / 0.9);
        rotation = t * 2.4;
        yOff = Math.sin(t * Math.PI) * this.depth * 0.2;
        spriteH = h * (1 - t * 0.08);
        anchor = 0.61;
      } else if (p.sliding) {
        img = global.Assets.get(this.defs, 'stickman', 'slide');
        spriteH = h * 0.68;
        yOff = 0;
        anchor = 0.78;
      } else if (!p.grounded) {
        const rising = p.vy > 0;
        img = global.Assets.get(this.defs, 'stickman', rising ? 'jumpRise' : 'jumpFall');
        anchor = rising ? 0.69 : 0.745;
        rotation = rising ? -0.06 : 0.10;
      } else {
        const frame = Math.floor(p.runPhase * 8) % 8;
        if (p.lean > 0.42) img = global.Assets.get(this.defs, 'stickman', 'dodgeR', frame);
        else if (p.lean < -0.42) img = global.Assets.get(this.defs, 'stickman', 'dodgeL', frame);
        else img = global.Assets.get(this.defs, 'stickman', 'run', frame);
      }

      if (!img) return;

      // Golden Kicks aura
      if (p.sneakerTimer > 0) {
        const aura = 0.5 + Math.sin(this.time * 10) * 0.2;
        const rg = ctx.createRadialGradient(pr.x, pr.y - spriteH * 0.5, 4, pr.x, pr.y - spriteH * 0.5, spriteH * 0.75);
        rg.addColorStop(0, `rgba(255,209,102,${0.24 * aura})`);
        rg.addColorStop(1, 'rgba(255,209,102,0)');
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(pr.x, pr.y - spriteH * 0.5, spriteH * 0.75, 0, TAU);
        ctx.fill();
      }

      ctx.save();
      ctx.translate(pr.x, pr.y - yOff);
      ctx.rotate(rotation);
      const drawH = spriteH;
      const drawW = drawH * (160 / 215);
      // Anchor the in-SVG foot baseline to the projected ground point rather
      // than anchoring the full viewBox, so feet visibly touch the road.
      ctx.drawImage(img, -drawW / 2, -drawH * anchor, drawW, drawH);
      ctx.restore();
    }

    drawParticles(ctx) {
      for (const p of this.particles) {
        const alpha = clamp(p.life / p.maxLife, 0, 1);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        if (p.rotV) {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    drawPopups(ctx) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const p of this.popups) {
        const alpha = clamp(p.life / p.maxLife, 0, 1);
        const pop = 1 + Math.max(0, p.maxLife - p.life - 0.12) * 1.6;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(pop, pop);
        ctx.globalAlpha = alpha;
        ctx.font = '900 20px system-ui, -apple-system, sans-serif';
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(5,7,20,0.85)';
        ctx.strokeText(p.text, 0, 0);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, 0, 0);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    drawVignette(ctx) {
      const g = ctx.createRadialGradient(this.cx, this.h * 0.5, this.h * 0.25, this.cx, this.h * 0.5, this.h * 0.85);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(2,4,12,0.42)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.w, this.h);
    }
  }

  global.Game = Game;
  Game.OBSTACLE_DEFS = OBSTACLE_DEFS;
})(window);
