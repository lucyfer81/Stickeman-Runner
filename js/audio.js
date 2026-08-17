/* Stickman Parkour — tiny Web Audio synth.
   All sound effects and the background beat are generated in code. */
(function (global) {
  'use strict';

  class AudioSys {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.musicGain = null;
      this.sfxGain = null;
      this.musicTimer = null;
      this.step = 0;
      this.nextNoteTime = 0;
      this.muted = false;
      try {
        this.muted = localStorage.getItem('sp-muted') === '1';
      } catch (e) { /* ignore */ }
    }

    ensure() {
      if (!this.ctx) {
        const AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.9;
        this.master.connect(this.ctx.destination);
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = 0.55;
        this.sfxGain.connect(this.master);
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.16;
        this.musicGain.connect(this.master);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    }

    setMuted(muted) {
      this.muted = !!muted;
      try { localStorage.setItem('sp-muted', this.muted ? '1' : '0'); } catch (e) { /* ignore */ }
      if (this.master && this.ctx) {
        this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.03);
      }
    }

    tone(opts) {
      if (!this.ctx || this.muted) return;
      const t0 = this.ctx.currentTime + (opts.delay || 0);
      const dur = opts.dur || 0.15;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = opts.type || 'sine';
      osc.frequency.setValueAtTime(opts.freq || 440, t0);
      if (opts.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.freqEnd), t0 + dur);
      if (opts.freqStart && opts.freqEnd) {
        osc.frequency.setValueAtTime(opts.freqStart, t0);
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.freqEnd), t0 + dur);
      }
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(opts.gain || 0.3, t0 + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(this.sfxGain);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }

    noise(opts) {
      if (!this.ctx || this.muted) return;
      const t0 = this.ctx.currentTime + (opts.delay || 0);
      const dur = opts.dur || 0.2;
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = opts.filter || 'lowpass';
      filter.frequency.value = opts.freq || 1000;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(opts.gain || 0.25, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter).connect(gain).connect(this.sfxGain);
      src.start(t0);
    }

    jump() {
      this.tone({ type: 'square', freqStart: 230, freqEnd: 560, dur: 0.14, gain: 0.16 });
      this.tone({ type: 'sine', freqStart: 360, freqEnd: 720, dur: 0.1, gain: 0.1, delay: 0.015 });
    }
    doubleJump() {
      this.tone({ type: 'square', freqStart: 320, freqEnd: 780, dur: 0.16, gain: 0.16 });
      this.tone({ type: 'sine', freqStart: 600, freqEnd: 1100, dur: 0.1, gain: 0.1, delay: 0.02 });
    }
    slide() {
      this.noise({ dur: 0.24, filter: 'bandpass', freq: 620, gain: 0.28 });
      this.tone({ type: 'triangle', freqStart: 360, freqEnd: 150, dur: 0.22, gain: 0.1 });
    }
    lane() {
      this.tone({ type: 'triangle', freq: 520, dur: 0.05, gain: 0.08 });
    }
    coin() {
      this.tone({ type: 'sine', freqStart: 880, freqEnd: 1320, dur: 0.09, gain: 0.16 });
      this.tone({ type: 'sine', freqStart: 1320, freqEnd: 1760, dur: 0.12, gain: 0.14, delay: 0.055 });
    }
    nearMiss() {
      this.noise({ dur: 0.18, filter: 'highpass', freq: 1400, gain: 0.18 });
      this.tone({ type: 'triangle', freqStart: 900, freqEnd: 300, dur: 0.16, gain: 0.09 });
    }
    powerup() {
      [440, 554, 659, 880].forEach((f, i) => this.tone({ type: 'square', freq: f, dur: 0.14, gain: 0.11, delay: i * 0.06 }));
      this.noise({ dur: 0.5, filter: 'highpass', freq: 2500, gain: 0.1, delay: 0.12 });
    }
    smash() {
      this.noise({ dur: 0.3, filter: 'highpass', freq: 900, gain: 0.3 });
      this.tone({ type: 'sawtooth', freqStart: 500, freqEnd: 90, dur: 0.24, gain: 0.12 });
    }
    crash() {
      this.noise({ dur: 0.5, filter: 'lowpass', freq: 700, gain: 0.45 });
      this.tone({ type: 'sawtooth', freqStart: 220, freqEnd: 55, dur: 0.5, gain: 0.2 });
    }
    milestone() {
      [523, 659, 784, 1047].forEach((f, i) => this.tone({ type: 'sine', freq: f, dur: 0.22, gain: 0.12, delay: i * 0.08 }));
    }

    startMusic() {
      if (!this.ctx || this.musicTimer) return;
      this.step = 0;
      this.nextNoteTime = this.ctx.currentTime + 0.1;
      this.musicTimer = setInterval(() => this.scheduleMusic(), 90);
    }

    stopMusic() {
      if (this.musicTimer) {
        clearInterval(this.musicTimer);
        this.musicTimer = null;
      }
    }

    scheduleMusic() {
      if (!this.ctx || this.muted) return;
      const bpm = 124;
      const sixteenth = 60 / bpm / 4;
      while (this.nextNoteTime < this.ctx.currentTime + 0.22) {
        this.playStep(this.step, this.nextNoteTime);
        this.step = (this.step + 1) % 64;
        this.nextNoteTime += sixteenth;
      }
    }

    playStep(step, t) {
      if (step % 8 === 0) {
        // bass pulse
        const f = step % 16 === 0 ? 55 : 65.4;
        this.tone({ type: 'triangle', freq: f, freqEnd: f, dur: 0.22, gain: 0.16, delay: Math.max(0, t - this.ctx.currentTime) });
      }
      if (step % 8 === 4) {
        this.noise({ dur: 0.05, filter: 'highpass', freq: 6000, gain: 0.045, delay: Math.max(0, t - this.ctx.currentTime) });
      }
      if (step === 16 || step === 48) {
        this.tone({ type: 'sine', freq: 330, dur: 0.14, gain: 0.05, delay: Math.max(0, t - this.ctx.currentTime) });
      }
      if (step === 32) {
        this.tone({ type: 'sine', freq: 392, dur: 0.14, gain: 0.05, delay: Math.max(0, t - this.ctx.currentTime) });
      }
    }
  }

  global.AudioSys = AudioSys;
})(window);
