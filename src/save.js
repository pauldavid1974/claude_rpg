// localStorage persistence.

import { G } from './state.js';

const KEY = 'emberdale_save_v1';

export function saveGame() {
  const p = G.player;
  if (!p) return;
  const data = {
    player: {
      hp: p.hp, maxHp: p.maxHp, level: p.level, xp: p.xp, gold: p.gold,
      weapon: p.weapon, armor: p.armor, inv: p.inv, quick: p.quick,
      sp: p.sp, skills: p.skills, upgrades: p.upgrades,
      x: p.x, y: p.y,
    },
    mapName: G.mapName,
    quests: G.quests,
    flags: G.flags,
    muted: G.muted,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) { /* storage may be unavailable; play on without saving */ }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}
