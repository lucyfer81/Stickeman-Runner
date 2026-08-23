/* Stickman Parkour — lifetime progression: coin bank, XP levels, achievements. */
(function (global) {
  'use strict';

  const ACHIEVEMENTS = [
    { id: 'first-run', name: 'First Steps', desc: 'Finish your first run' },
    { id: 'run-500', name: 'Getting Warm', desc: 'Reach 500 m in a single run' },
    { id: 'run-1000', name: 'Kilometer Club', desc: 'Reach 1,000 m in a single run' },
    { id: 'coins-100', name: 'Coin Magnet', desc: 'Bank 100 lifetime coins' },
    { id: 'kicks', name: 'Golden Touch', desc: 'Grab the Golden Kicks' },
    { id: 'runs-10', name: 'Regular', desc: 'Play 10 runs' },
    { id: 'score-10k', name: 'Ten Grand', desc: 'Score 10,000 in a single run' },
    { id: 'level-5', name: 'Rising Star', desc: 'Reach level 5' }
  ];

  const xpThreshold = (level) => 250 * level * (level - 1);
  const levelFor = (xp) => {
    let l = 1;
    while (xpThreshold(l + 1) <= xp) l += 1;
    return l;
  };

  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

  class MetaSys {
    constructor() {
      this.load();
    }

    load() {
      let ach = [];
      try {
        const parsed = JSON.parse(localStorage.getItem('sp-ach') || '[]');
        if (Array.isArray(parsed)) ach = parsed;
      } catch (e) { /* ignore */ }
      const valid = new Set(ACHIEVEMENTS.map((a) => a.id));
      this.runs = num(localStorage.getItem('sp-runs'), 0);
      this.coinBank = num(localStorage.getItem('sp-coinbank'), 0);
      this.xp = num(localStorage.getItem('sp-xp'), 0);
      this.unlockedIds = new Set(ach.filter((id) => valid.has(id)));
    }

    save() {
      try {
        localStorage.setItem('sp-runs', String(this.runs));
        localStorage.setItem('sp-coinbank', String(this.coinBank));
        localStorage.setItem('sp-xp', String(this.xp));
        localStorage.setItem('sp-ach', JSON.stringify([...this.unlockedIds]));
      } catch (e) { /* ignore */ }
    }

    isFirstRun() {
      return this.runs === 0;
    }

    stats() {
      return {
        runs: this.runs,
        coinBank: this.coinBank,
        xp: this.xp,
        level: levelFor(this.xp),
        achievements: [...this.unlockedIds]
      };
    }

    unlock(id) {
      if (this.unlockedIds.has(id)) return null;
      this.unlockedIds.add(id);
      this.save();
      return ACHIEVEMENTS.find((a) => a.id === id) || null;
    }

    recordRun({ score, distance, coins, kicks }) {
      this.runs += 1;
      this.coinBank += coins;
      const xpGained = Math.floor(score / 10);
      const prevLevel = levelFor(this.xp);
      this.xp += xpGained;
      const newLevel = levelFor(this.xp);
      const unlocked = [];
      const tryUnlock = (id, cond) => {
        if (cond) {
          const def = this.unlock(id);
          if (def) unlocked.push(def);
        }
      };
      tryUnlock('first-run', true);
      tryUnlock('run-500', distance >= 500);
      tryUnlock('run-1000', distance >= 1000);
      tryUnlock('coins-100', this.coinBank >= 100);
      tryUnlock('kicks', !!kicks);
      tryUnlock('runs-10', this.runs >= 10);
      tryUnlock('score-10k', score >= 10000);
      tryUnlock('level-5', newLevel >= 5);
      this.save();
      return {
        xpGained,
        xp: this.xp,
        prevLevel,
        newLevel,
        leveledUp: newLevel > prevLevel,
        unlocked,
        levelFloor: xpThreshold(newLevel),
        levelCeil: xpThreshold(newLevel + 1)
      };
    }
  }

  global.MetaSys = MetaSys;
  MetaSys.ACHIEVEMENTS = ACHIEVEMENTS;
  MetaSys.levelFor = levelFor;
  MetaSys.xpThreshold = xpThreshold;
})(window);
