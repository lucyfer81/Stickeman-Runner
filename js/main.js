/* Stickman Parkour — UI wiring, keyboard and touch controls. */
(function (global) {
  'use strict';

  function $(id) { return document.getElementById(id); }

  class UI {
    constructor(game) {
      this.game = game;
      this.hud = $('hud');
      this.titleScreen = $('titleScreen');
      this.pauseScreen = $('pauseScreen');
      this.gameOverScreen = $('gameOverScreen');

      this.scoreValue = $('scoreValue');
      this.distanceValue = $('distanceValue');
      this.coinsValue = $('coinsValue');
      this.bestValue = $('bestValue');
      this.powerupTag = $('powerupTag');

      this.muteIcons = document.querySelectorAll('.mute-icon');
      this.pauseBars = $('pauseBars');
      this.pausePlay = $('pausePlay');
      this.titleBest = $('titleBest');
      if (this.titleBest) this.titleBest.textContent = Math.floor(game.best).toLocaleString();
      this.titleLevel = $('titleLevel');
      this.titleBank = $('titleBank');
      this.titleAch = $('titleAch');
      this.touchHint = $('touchHint');

      this.finalScore = $('finalScore');
      this.finalDistance = $('finalDistance');
      this.finalCoins = $('finalCoins');
      this.finalBest = $('finalBest');
      this.finalBank = $('finalBank');
      this.bestLabel = $('bestLabel');
      this.recordTag = $('recordTag');
      this.recapLine = $('recapLine');
      this.achLine = $('achLine');
      this.xpText = $('xpText');
      this.xpFill = $('xpFill');

      this.crashFlash = $('crashFlash');
      this.updateTitleStats();
    }

    updateTitleStats() {
      if (!this.game.meta) return;
      const s = this.game.meta.stats();
      if (this.titleLevel) this.titleLevel.textContent = `LV ${s.level}`;
      if (this.titleBank) this.titleBank.textContent = s.coinBank.toLocaleString();
      if (this.titleAch) this.titleAch.textContent = `${s.achievements.length}/${global.MetaSys.ACHIEVEMENTS.length} ★`;
    }

    startRun() {
      if (this.titleBest) this.titleBest.textContent = Math.floor(this.game.best).toLocaleString();
      this.titleScreen.classList.add('hidden');
      this.pauseScreen.classList.add('hidden');
      this.gameOverScreen.classList.add('hidden');
      this.hud.classList.add('visible');
      const hint = $('controlHint');
      hint.classList.add('show');
      clearTimeout(this.hintTimeout);
      this.hintTimeout = setTimeout(() => hint.classList.remove('show'), 4200);
      if (this.touchHint) {
        const coarse = global.matchMedia && matchMedia('(pointer: coarse)').matches;
        const showTouch = this.game.firstRun && coarse;
        this.touchHint.classList.toggle('show', showTouch);
        clearTimeout(this.touchHintTimeout);
        if (showTouch) this.touchHintTimeout = setTimeout(() => this.touchHint.classList.remove('show'), 6000);
      }
    }

    showTitle() {
      if (this.titleBest) this.titleBest.textContent = Math.floor(this.game.best).toLocaleString();
      this.updateTitleStats();
      this.titleScreen.classList.remove('hidden');
      this.pauseScreen.classList.add('hidden');
      this.gameOverScreen.classList.add('hidden');
      this.hud.classList.remove('visible');
    }

    showPause(show) {
      this.pauseScreen.classList.toggle('hidden', !show);
      if (this.pauseBars) this.pauseBars.style.display = show ? 'none' : '';
      if (this.pausePlay) this.pausePlay.style.display = show ? '' : 'none';
    }

    showGameOver(data) {
      this.gameOverScreen.classList.remove('hidden');
      this.finalScore.textContent = data.score.toLocaleString();
      this.finalDistance.textContent = `${data.distance.toLocaleString()} m`;
      this.finalCoins.textContent = data.coins.toLocaleString();
      this.finalBest.textContent = data.best.toLocaleString();
      this.bestLabel.textContent = data.isRecord ? 'NEW RECORD' : 'BEST';
      this.recordTag.classList.toggle('best-flash', data.isRecord);
      this.gameOverScreen.classList.toggle('new-record', data.isRecord);
      if (this.recapLine) {
        this.recapLine.textContent = data.recap || 'Run ended — jump hurdles, slide gates, dodge walls';
      }
      if (this.finalBank && typeof data.bank === 'number') {
        this.finalBank.textContent = data.bank.toLocaleString();
      }
      const p = data.progress;
      if (this.xpText && p) {
        const into = Math.max(0, p.xp - p.levelFloor);
        const span = Math.max(1, p.levelCeil - p.levelFloor);
        this.xpText.textContent = `LV ${p.newLevel}${p.leveledUp ? ' — LEVEL UP!' : ''} · +${p.xpGained.toLocaleString()} XP`;
        if (this.xpFill) this.xpFill.style.width = `${Math.round((into / span) * 100)}%`;
      }
      if (this.achLine) {
        const total = data.achTotal || global.MetaSys.ACHIEVEMENTS.length;
        const unlockedNow = p && p.unlocked.length ? p.unlocked.map((a) => a.name).join(', ') : null;
        const count = this.game.meta ? this.game.meta.stats().achievements.length : 0;
        this.achLine.textContent = unlockedNow
          ? `★ New: ${unlockedNow} (${count}/${total})`
          : `★ Achievements ${count}/${total}`;
      }
    }

    showCrash() {
      if (this.crashFlash) {
        this.crashFlash.classList.add('show');
        setTimeout(() => this.crashFlash.classList.remove('show'), 160);
      }
    }

    updateHUD(score, distance, coins, best, sneakerTimer) {
      this.scoreValue.textContent = Math.floor(score).toLocaleString();
      this.distanceValue.textContent = `${Math.floor(distance).toLocaleString()} m`;
      this.coinsValue.textContent = coins.toLocaleString();
      this.bestValue.textContent = Math.floor(best).toLocaleString();
      this.powerupTag.classList.toggle('show', sneakerTimer > 0);
      if (sneakerTimer > 0) {
        this.powerupTag.textContent = `⚡ GOLD KICKS ${sneakerTimer.toFixed(1)}s`;
      }
    }

    updateMute(muted) {
      document.body.classList.toggle('muted', muted);
    }
  }

  class Input {
    constructor(game, ui) {
      this.game = game;
      this.ui = ui;
      this.pointer = null;
      this.swipeHandled = false;
      this.bind();
    }

    bind() {
      // Keyboard -----------------------------------------------------------------
      global.addEventListener('keydown', (e) => {
        const code = e.code;
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(code)) {
          e.preventDefault();
        }
        if (e.repeat) return;
        if (code === 'Space' || code === 'ArrowUp' || code === 'KeyW') this.game.input('jump');
        else if (code === 'ArrowDown' || code === 'KeyS') this.game.input('slide');
        else if (code === 'ArrowLeft' || code === 'KeyA') this.game.input('left');
        else if (code === 'ArrowRight' || code === 'KeyD') this.game.input('right');
        else if (code === 'Enter') this.game.input('start');
        else if (code === 'KeyP' || code === 'Escape') this.game.input('pause');
        else if (code === 'KeyM') this.game.input('mute');
      });

      // Pointer / swipe -----------------------------------------------------------
      const surface = $('game');
      surface.addEventListener('pointerdown', (e) => {
        this.pointer = { x: e.clientX, y: e.clientY, id: e.pointerId };
        this.swipeHandled = false;
      });

      surface.addEventListener('pointermove', (e) => {
        if (!this.pointer || e.pointerId !== this.pointer.id || this.swipeHandled) return;
        const dx = e.clientX - this.pointer.x;
        const dy = e.clientY - this.pointer.y;
        const adx = Math.abs(dx);
        const ady = Math.abs(dy);
        // Early-fire only when one axis clearly dominates: a near-diagonal
        // gesture must not be committed at half-distance, where the angle
        // is still ambiguous (it gets classified on pointerup instead).
        if (Math.max(adx, ady) > 28 && (adx > ady * 1.2 || ady > adx * 1.2)) {
          this.handleSwipe(dx, dy);
          this.swipeHandled = true;
        }
      });

      surface.addEventListener('pointerup', (e) => {
        if (!this.pointer || e.pointerId !== this.pointer.id) return;
        if (!this.swipeHandled) {
          const dx = e.clientX - this.pointer.x;
          const dy = e.clientY - this.pointer.y;
          const adx = Math.abs(dx);
          const ady = Math.abs(dy);
          if (Math.max(adx, ady) > 22) this.handleSwipe(dx, dy);
        }
        this.pointer = null;
      });

      surface.addEventListener('pointercancel', () => { this.pointer = null; });

      // Buttons -------------------------------------------------------------------
      this.bindButton('startButton', 'start');
      this.bindButton('pauseRestartButton', 'restart');
      this.bindButton('runAgainButton', 'start');
      this.bindButton('resumeButton', 'pause');
      this.bindButton('menuButton', 'menu');
      this.bindButton('gameOverMenuButton', 'menu');
      this.bindButton('pauseButton', 'pause');
      this.bindButton('muteButton', 'mute');
      this.bindButton('titleMuteButton', 'mute');
      this.bindTouch('btnLeft', 'left');
      this.bindTouch('btnRight', 'right');
      this.bindTouch('btnJump', 'jump');
      this.bindTouch('btnSlide', 'slide');

      // Tapping the title overlay is an invitation to run.
      $('titleScreen').addEventListener('pointerdown', (e) => {
        if (e.target.closest('button')) return;
        this.game.input('start');
      });

      $('titleScreen').addEventListener('contextmenu', (e) => e.preventDefault());
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.game.state === 'running') this.game.input('pause');
      });
    }

    bindButton(id, action) {
      const el = $(id);
      if (!el) return;
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.game.input(action);
      });
    }

    bindTouch(id, action) {
      const el = $(id);
      if (!el) return;
      const press = (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.add('pressed');
        this.game.input(action);
      };
      const release = (e) => {
        e.preventDefault();
        el.classList.remove('pressed');
      };
      el.addEventListener('pointerdown', press);
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('pointerleave', release);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    handleSwipe(dx, dy) {
      // Dominant-axis resolution: every swipe angle maps to an action,
      // including ~45° thumb swipes that the old ratio thresholds dropped.
      if (Math.abs(dx) >= Math.abs(dy)) {
        this.game.input(dx < 0 ? 'left' : 'right');
      } else {
        this.game.input(dy < 0 ? 'jump' : 'slide');
      }
    }
  }

  function boot() {
    const canvas = $('gameCanvas');
    const game = new global.Game(canvas);
    const ui = new UI(game);
    game.ui = ui;
    new Input(game, ui);
    ui.updateMute(game.audio.muted);
    game.initAssets().catch((err) => {
      console.error('Asset preload failed:', err);
      game.assetsReady = true;
      game.startLoop();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
