// Melee combat, damage, projectiles, drops and pickups.

import { G, TILE } from './state.js';
import { feetBox, overlaps, playerStats, breakPoise, spawnMonster } from './entities.js';
import { sfx } from './audio.js';
import { spawnPix, spawnEffect, addFloat, sparkle } from './particles.js';
import { addItem } from './inventory.js';
import { onKill } from './quests.js';
import { POINTS_PER_LEVEL, bonuses } from './skills.js';

export function xpNeed(level) { return 12 + level * 8; }

// --- weapon movesets -----------------------------------------------------
// Each weapon swings on its own rhythm.  A string continues while the
// window after a swing is still open, and the last hit lands harder.

export const MOVES = {
  none:       { dur: 0.24, hits: 1, reach: 15, width: 18, window: 0.30,
                dmgMul: [1],           poiseMul: [1] },
  dagger:     { dur: 0.17, hits: 3, reach: 16, width: 18, window: 0.34,
                dmgMul: [1, 1, 1.5],   poiseMul: [1, 1, 1.4] },
  sword:      { dur: 0.26, hits: 2, reach: 19, width: 22, window: 0.36,
                dmgMul: [1, 1.35],     poiseMul: [1, 1.4] },
  greatsword: { dur: 0.40, hits: 1, reach: 23, width: 30, window: 0.22,
                dmgMul: [1.5],         poiseMul: [1.6] },
};

export const CHARGE_MIN = 0.45;   // hold this long past a swing for a heavy
export const CHARGE_FULL = 0.9;

export function moveset() { return MOVES[G.player.weapon] || MOVES.none; }

export function startAttack(heavy = false) {
  const p = G.player;
  if (p.attackT > 0 || p.dodgeT > 0) return;
  const mv = moveset();
  const b = bonuses();
  // continue the string while the window is open, otherwise start over
  p.combo = (!heavy && p.comboT > 0 && p.combo < mv.hits - 1) ? p.combo + 1 : 0;
  p.heavy = heavy;
  p.attackDur = (heavy ? mv.dur * 1.5 : mv.dur) * b.atkSpeed;
  p.attackT = p.attackDur;
  p.comboT = 0;
  p.attackDir = p.dir;
  p.swingId = (p.swingId || 0) + 1;
  sfx(heavy ? 'crit' : 'swing');
  if (heavy) G.shake = Math.max(G.shake, 3);
  const hb = attackBox();
  for (let i = 0; i < (heavy ? 16 : 6); i++) {
    spawnPix(hb.x + Math.random() * hb.w, hb.y + Math.random() * hb.h,
      heavy ? '#fee761' : '#ffffff', 1, heavy ? 30 : 8, 0.2);
  }
}

export function attackBox() {
  const p = G.player;
  const mv = moveset();
  const r = mv.reach + (p.heavy ? 6 : 0);
  const w = mv.width + (p.heavy ? 8 : 0);
  const cx = p.x + 8, cy = p.y + 10;
  switch (p.attackDir) {
    case 'up':    return { x: cx - w / 2, y: cy - 6 - r, w, h: r };
    case 'down':  return { x: cx - w / 2, y: cy + 2,     w, h: r };
    case 'left':  return { x: cx - 6 - r, y: cy - w / 2, w: r, h: w };
    default:      return { x: cx + 6,     y: cy - w / 2, w: r, h: w };
  }
}

// A hit from outside the enemy's guard - behind it, or while it is
// staggered - always crits.
function exposed(m) {
  if (m.staggerT > 0) return true;
  if (m.face === undefined) return false;
  const p = G.player;
  const ang = Math.atan2((p.y + 10) - (m.y + m.size / 2), (p.x + 8) - (m.x + m.size / 2));
  return Math.cos(ang - m.face) < -0.35;
}

export function updateCombat(dt) {
  const p = G.player;
  // active hit window, as a slice of whatever this weapon's swing lasts
  const dur = p.attackDur || 0.26;
  const elapsed = dur - p.attackT;
  if (p.attackT > 0 && elapsed > dur * 0.22 && elapsed < dur * 0.72) {
    const hb = attackBox();
    const mv = moveset();
    const i = Math.min(p.combo || 0, mv.dmgMul.length - 1);
    for (const m of G.monsters) {
      if (m.lastHitSwing === p.swingId) continue;
      const mb = { x: m.x + 2, y: m.y + m.size * 0.3, w: m.size - 4, h: m.size * 0.65 };
      if (!overlaps(hb, mb)) continue;
      m.lastHitSwing = p.swingId;
      const ang = Math.atan2((m.y + m.size / 2) - (p.y + 8), (m.x + m.size / 2) - (p.x + 8));
      const st = playerStats();
      const back = exposed(m);
      const crit = back || Math.random() < st.crit;
      let dmg = st.atk * mv.dmgMul[i] * (p.heavy ? 2 : 1);
      if (crit) dmg *= back ? st.critMult * 1.25 : st.critMult;
      const poise = st.poise * mv.poiseMul[i] * (p.heavy ? 2.5 : 1);
      hitMonster(m, Math.max(1, Math.round(dmg)), ang, poise,
                 back ? 'backstab' : crit ? 'crit' : null);
    }
    smashables(hb, p.swingId);
  }
  updateProjectiles(dt);
  updatePickups(dt);
  updateHazards(dt);
}

// Barrels take the same swing enemies do, and cough up what was in them.
function smashables(hb, swingId) {
  for (let i = G.map.props.length - 1; i >= 0; i--) {
    const pr = G.map.props[i];
    if (!pr.hp || pr.lastHitSwing === swingId) continue;
    const box = { x: pr.x * TILE + 2, y: pr.y * TILE + 4, w: 12, h: 11 };
    if (!overlaps(hb, box)) continue;
    pr.lastHitSwing = swingId;
    pr.hp--;
    pr.shakeT = 0.18;
    const cx = pr.x * TILE + 8, cy = pr.y * TILE + 9;
    if (pr.hp > 0) {
      sfx('slash_hit');
      spawnPix(cx, cy, '#b86f50', 4, 40, 0.25);
      continue;
    }
    G.map.props.splice(i, 1);
    G.flags['smashed_' + pr.x + '_' + pr.y + '_' + G.mapName] = true;
    sfx('break');
    G.shake = Math.max(G.shake, pr.type === 'crack' ? 6 : 3);
    const stone = pr.type === 'crack';
    for (let k = 0; k < (stone ? 22 : 12); k++) {
      spawnPix(cx, cy, k % 2 ? (stone ? '#3a4466' : '#733e39')
                             : (stone ? '#5a6988' : '#b86f50'), 5, 110, 0.6);
    }
    if (stone) {                                  // a walled-up alcove pays out
      G.banner = { text: 'The wall gives way', t: 1.8 };
      const loot = pr.loot || {};
      for (let k = 0; k < (loot.gold || 0); k += 5) {
        const a = Math.random() * Math.PI * 2;
        G.pickups.push({ kind: 'coin', x: cx, y: cy, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70 - 20, t: 0, value: 5 });
      }
      for (const it of loot.items || []) {
        G.pickups.push({ kind: 'item', item: it, x: cx + (Math.random() - 0.5) * 10, y: cy + 4,
                         vx: (Math.random() - 0.5) * 40, vy: -30, t: 0 });
      }
      continue;
    }
    const roll = Math.random();
    if (roll < 0.45) {
      for (let k = 0; k < 2 + Math.floor(Math.random() * 3); k++) {
        const a = Math.random() * Math.PI * 2;
        G.pickups.push({ kind: 'coin', x: cx, y: cy, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60 - 20, t: 0 });
      }
    } else if (roll < 0.60) {
      G.pickups.push({ kind: 'heart', x: cx, y: cy, vx: 0, vy: -20, t: 0 });
    } else if (roll < 0.72) {
      G.pickups.push({ kind: 'item', item: Math.random() < 0.5 ? 'potion' : 'knife',
                       x: cx, y: cy, vx: 0, vy: -25, t: 0 });
    }
  }
}

// Floor spikes: flush, a beat of warning, then out.
export function updateHazards(dt) {
  const p = G.player;
  for (const pr of G.map.props) {
    if (pr.shakeT > 0) pr.shakeT -= dt;
    if (pr.type !== 'spikes') continue;
    pr.t = (pr.t || 0) + dt;
    const period = pr.period || 2.4;
    const phase = ((pr.t + (pr.offset || 0)) % period) / period;
    pr.stage = phase < 0.62 ? 0 : phase < 0.76 ? 1 : 2;
    if (pr.stage !== 2) { pr.bit = false; continue; }
    const box = { x: pr.x * TILE + 2, y: pr.y * TILE + 4, w: 12, h: 10 };
    if (!pr.bit && overlaps(box, feetBox(p))) {
      pr.bit = true;
      damagePlayer(pr.dmg || 3, pr.x * TILE + 8, pr.y * TILE + 8);
    }
  }
}

export function hitMonster(m, dmg, ang, poiseDmg = 1, crit = null) {
  // a staggered enemy is wide open
  const staggered = m.staggerT > 0;
  if (staggered) dmg = Math.round(dmg * 1.5);
  if (m.armour) dmg = Math.max(1, dmg - m.armour);
  m.hp -= dmg;
  m.hurtT = crit ? 0.24 : 0.15;
  const kb = (m.type === 'brute' ? 40 : m.type === 'boss' ? 15 : 120) * (crit ? 1.4 : 1);
  m.kbx = Math.cos(ang) * kb;
  m.kby = Math.sin(ang) * kb;
  const cx = m.x + m.size / 2, cy = m.y + m.size / 2;
  if (crit) {
    sfx('crit');
    G.hitstop = 0.13;
    G.shake = Math.max(G.shake, 6);
    addFloat(crit === 'backstab' ? 'BACKSTAB ' + dmg : 'CRIT ' + dmg,
             cx, cy - 12, '#fee761', true);
    spawnPix(cx, cy, '#fee761', 12, 90, 0.4);
  } else {
    sfx('slash_hit');
    G.hitstop = staggered ? 0.08 : 0.05;
    G.shake = Math.max(G.shake, staggered ? 4 : 2.5);
    addFloat('' + dmg, cx, m.y - 2, staggered ? '#fee761' : '#ffffff');
    spawnPix(cx, cy, '#ffffff', 5, 40, 0.25);
  }
  if (m.hp > 0 && breakPoise(m, poiseDmg)) {
    addFloat('STAGGER', cx, m.y - 10, '#fee761');
    G.hitstop = Math.max(G.hitstop, 0.12);
  }
  if (m.hp <= 0) killMonster(m);
}

const DROP_TABLE = {
  slime:    [['gel', 0.6]],
  skeleton: [['bone', 0.65], ['knife', 0.12]],
  bat:      [['antidote', 0.08]],
  archer:   [['potion', 0.15], ['knife', 0.25]],
  brute:    [['potion', 0.3], ['bomb', 0.15]],
  boss:     [['amulet', 1]],
};

export function killMonster(m) {
  G.monsters.splice(G.monsters.indexOf(m), 1);
  // a rendspawn does not die so much as become two problems
  if (m.elite === 'splits' && !m.spawned) {
    for (const off of [-7, 7]) {
      const kid = spawnMonster(m.type, 0, 0);
      kid.x = m.x + off; kid.y = m.y + (off > 0 ? 4 : -4);
      kid.prevX = kid.x; kid.prevY = kid.y;
      kid.homeX = kid.x; kid.homeY = kid.y;
      kid.hp = kid.maxHp = Math.max(2, Math.round(m.maxHp * 0.3));
      kid.size = 16; kid.spawned = true; kid.xp = Math.round(m.xp * 0.2);
      kid.gold = [0, 1];
      G.monsters.push(kid);
    }
  }
  sfx('die');
  G.shake = Math.max(G.shake, m.type === 'boss' ? 6 : 3);
  spawnEffect(m.die, m.x, m.y);
  const cx = m.x + m.size / 2, cy = m.y + m.size / 2;
  // coins arc out
  const [lo, hi] = m.gold;
  const coins = lo + Math.floor(Math.random() * (hi - lo + 1));
  for (let i = 0; i < coins; i++) {
    const a = Math.random() * Math.PI * 2;
    G.pickups.push({ kind: 'coin', x: cx, y: cy, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70 - 30, t: 0 });
  }
  if (Math.random() < 0.18) {
    G.pickups.push({ kind: 'heart', x: cx, y: cy, vx: 0, vy: -20, t: 0 });
  }
  if (m.elite && !m.spawned) {
    G.pickups.push({ kind: 'item', item: 'shard', x: cx, y: cy + 4,
                     vx: (Math.random() - 0.5) * 40, vy: -34, t: 0 });
  }
  for (const [item, p] of DROP_TABLE[m.type]) {
    if (Math.random() < (m.elite ? p * 1.6 : p)) {
      G.pickups.push({ kind: 'item', item, x: cx, y: cy + 4, vx: (Math.random() - 0.5) * 40, vy: -30, t: 0 });
    }
  }
  gainXp(m.xp);
  if (m.type === 'boss') {
    G.flags.bossDead = true;
    sfx('boss');
  }
  onKill(m.type);
}

export function gainXp(n) {
  const p = G.player;
  p.xp += n;
  while (p.xp >= xpNeed(p.level)) {
    p.xp -= xpNeed(p.level);
    p.level++;
    p.sp = (p.sp || 0) + POINTS_PER_LEVEL;
    p.hp = p.maxHp;
    sfx('levelup');
    G.banner = { text: 'LEVEL ' + p.level + '!  +' + POINTS_PER_LEVEL + ' skill points', t: 2.5 };
    sparkle(p.x + 8, p.y + 8, 14, '#fee761');
  }
}

export function damagePlayer(atk, fromX, fromY) {
  const p = G.player;
  if (p.iframes > 0 || G.mode !== 'play') return;
  const dmg = Math.max(1, atk - playerStats().def);
  p.hp -= dmg;
  p.iframes = 1.0;
  p.hurtWobble = 0.6;
  sfx('hurt');
  G.shake = Math.max(G.shake, 4);
  addFloat('-' + dmg, p.x + 8, p.y - 4, '#e43b44');
  const ang = Math.atan2((p.y + 8) - fromY, (p.x + 8) - fromX);
  p.kbx = Math.cos(ang) * 90;
  p.kby = Math.sin(ang) * 90;
  if (p.hp <= 0) {
    p.hp = 0;
    G.mode = 'gameover';
    G.ui.gameoverT = 0;
  }
}

// --- thrown consumables -------------------------------------------------

export function playerThrow(kind, ang, dmg) {
  const p = G.player;
  const speed = kind === 'bomb' ? 100 : 165;
  G.projectiles.push({
    x: p.x + 8, y: p.y + 10,
    vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
    dmg, kind, ally: true,
    life: kind === 'bomb' ? 0.62 : 1.2,
    spin: 0,
  });
}

export function explode(x, y, dmg) {
  sfx('boss');
  G.shake = Math.max(G.shake, 6);
  G.hitstop = 0.07;
  for (let i = 0; i < 26; i++) {
    spawnPix(x, y, i % 3 ? '#feae34' : '#fee761', 6, 110, 0.45);
  }
  for (const m of [...G.monsters]) {
    const mx = m.x + m.size / 2, my = m.y + m.size / 2;
    const d = Math.hypot(mx - x, my - y);
    if (d > 36) continue;
    hitMonster(m, Math.max(1, Math.round(dmg * (1 - d / 52))), Math.atan2(my - y, mx - x), 3);
  }
}

export function monsterShoot(x, y, ang, speed, dmg, boss = false) {
  G.projectiles.push({
    x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
    dmg, life: 3, boss,
  });
}

import { isSolidAt } from './maps.js';

function updateProjectiles(dt) {
  const p = G.player;
  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    const pr = G.projectiles[i];
    pr.x += pr.vx * dt; pr.y += pr.vy * dt;
    pr.life -= dt;
    pr.spin = (pr.spin || 0) + dt * 14;
    const hitWall = isSolidAt(G.map, pr.x, pr.y);
    if (pr.life <= 0 || hitWall) {
      if (pr.kind === 'bomb') explode(pr.x, pr.y, pr.dmg);
      else spawnPix(pr.x, pr.y, pr.boss ? '#b55088' : '#c0cbdc', 3, 30, 0.2);
      G.projectiles.splice(i, 1);
      continue;
    }
    if (pr.ally) {                       // thrown by the player: hits monsters
      let struck = false;
      for (const m of G.monsters) {
        const mb = { x: m.x + 2, y: m.y + m.size * 0.3, w: m.size - 4, h: m.size * 0.65 };
        if (pr.x < mb.x || pr.x > mb.x + mb.w || pr.y < mb.y || pr.y > mb.y + mb.h) continue;
        struck = true;
        if (pr.kind === 'bomb') explode(pr.x, pr.y, pr.dmg);
        else hitMonster(m, pr.dmg, Math.atan2(pr.vy, pr.vx), 1);
        break;
      }
      if (struck) G.projectiles.splice(i, 1);
      continue;
    }
    const fb = feetBox(p);
    if (pr.x > fb.x - 2 && pr.x < fb.x + fb.w + 2 && pr.y > fb.y - 6 && pr.y < fb.y + fb.h + 2) {
      G.projectiles.splice(i, 1);
      damagePlayer(pr.dmg, pr.x - pr.vx, pr.y - pr.vy);
    }
  }
}

function updatePickups(dt) {
  const p = G.player;
  const pc = { x: p.x + 8, y: p.y + 10 };
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const pk = G.pickups[i];
    pk.t += dt;
    const d = Math.hypot(pc.x - pk.x, pc.y - pk.y);
    const vac = pk.kind === 'coin' ? 34 : 22;   // coins vacuum from further away
    if (pk.t > 0.35 && d < vac) {
      pk.vx += (pc.x - pk.x) * 180 * dt;
      pk.vy += (pc.y - pk.y) * 180 * dt;
    } else {
      pk.vx *= Math.pow(0.02, dt);
      pk.vy *= Math.pow(0.02, dt);
    }
    pk.x += pk.vx * dt; pk.y += pk.vy * dt;
    if (d < 12 && pk.t > 0.25) {
      G.pickups.splice(i, 1);
      if (pk.id) G.flags['got_' + pk.id] = true;   // map pickups never respawn
      if (pk.kind === 'coin') {
        p.gold += pk.value || 1;
        sfx('coin');
      } else if (pk.kind === 'heart') {
        p.hp = Math.min(p.maxHp, p.hp + 2);
        sfx('heal');
        addFloat('+2', p.x + 8, p.y - 4, '#63c74d');
      } else {
        addItem(pk.item, 1);
        sfx('pickup');
        sparkle(pc.x, pc.y - 4, 8, '#2ce8f5');
      }
    }
  }
}
