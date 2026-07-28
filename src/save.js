// localStorage persistence, across three slots.

import { G } from './state.js';

const KEY = 'emberdale_save_v1';
export const SLOTS = 3;

function slotKey(i) { return KEY + '_s' + i; }

// Older builds wrote a single unslotted save; fold it into slot 0 once.
function migrate() {
  try {
    const old = localStorage.getItem(KEY);
    if (old && !localStorage.getItem(slotKey(0))) {
      localStorage.setItem(slotKey(0), old);
      localStorage.removeItem(KEY);
    }
  } catch (e) { /* ignore */ }
}
migrate();

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
    ngPlus: G.ngPlus || 0,
    stats: G.stats,
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(slotKey(G.slot || 0), JSON.stringify(data));
  } catch (e) { /* storage may be unavailable; play on without saving */ }
}

export function loadGame(slot = G.slot || 0) {
  try {
    const raw = localStorage.getItem(slotKey(slot));
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function clearSave(slot = G.slot || 0) {
  try { localStorage.removeItem(slotKey(slot)); } catch (e) { /* ignore */ }
}

// Enough to label a slot on the picker without loading it.
export function slotSummary(i) {
  const s = loadGame(i);
  if (!s) return null;
  return {
    level: s.player?.level || 1,
    map: s.mapName || 'town1',
    ngPlus: s.ngPlus || 0,
    playtime: s.stats?.playtime || 0,
    savedAt: s.savedAt || 0,
    done: !!s.flags?.mainDone,
  };
}

export function newestSlot() {
  let best = -1, when = -1;
  for (let i = 0; i < SLOTS; i++) {
    const s = slotSummary(i);
    if (s && s.savedAt > when) { when = s.savedAt; best = i; }
  }
  return best;
}

export function anySave() { return newestSlot() >= 0; }
