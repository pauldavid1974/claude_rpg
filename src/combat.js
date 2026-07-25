// Melee combat, damage, projectiles, drops and pickups.

import { G, TILE } from './state.js';
import { feetBox, overlaps, playerStats, breakPoise } from './entities.js';
import { sfx } from './audio.js';
import { spawnPix, spawnEffect, addFloat, sparkle } from './particles.js';
import { addItem } from './inventory.js';
import { onKill } from './quests.js';

export function xpNeed(level) { return 12 + level * 8; }

export function startAttack() {
  const p = G.player;
  if (p.attackT > 0 || p.dodgeT > 0) return;
  p.attackT = 0.26;
  p.attackDir = p.dir;
  p.swingId = (p.swingId || 0) + 1;
  sfx('swing');
  // swipe trail particles in an arc in front
  const hb = attackBox();
  for (let i = 0; i < 6; i++) {
    spawnPix(hb.x + Math.random() * hb.w, hb.y + Math.random() * hb.h,
      '#ffffff', 1, 8, 0.18);
  }
}

export function attackBox() {
  const p = G.player;
  const cx = p.x + 8, cy = p.y + 10;
  switch (p.attackDir) {
    case 'up':    return { x: cx - 10, y: cy - 22, w: 20, h: 16 };
    case 'down':  return { x: cx - 10, y: cy + 2,  w: 20, h: 16 };
    case 'left':  return { x: cx - 22, y: cy - 10, w: 16, h: 20 };
    default:      return { x: cx + 6,  y: cy - 10, w: 16, h: 20 };
  }
}

export function updateCombat(dt) {
  const p = G.player;
  // active hit window of the swing
  if (p.attackT > 0.06 && p.attackT < 0.21) {
    const hb = attackBox();
    for (const m of G.monsters) {
      if (m.lastHitSwing === p.swingId) continue;
      const mb = { x: m.x + 2, y: m.y + m.size * 0.3, w: m.size - 4, h: m.size * 0.65 };
      if (overlaps(hb, mb)) {
        m.lastHitSwing = p.swingId;
        const ang = Math.atan2((m.y + m.size / 2) - (p.y + 8), (m.x + m.size / 2) - (p.x + 8));
        const st = playerStats();
        hitMonster(m, st.atk, ang, st.poise);
      }
    }
  }
  updateProjectiles(dt);
  updatePickups(dt);
}

export function hitMonster(m, dmg, ang, poiseDmg = 1) {
  // a staggered enemy is wide open
  const staggered = m.staggerT > 0;
  if (staggered) dmg = Math.round(dmg * 1.5);
  m.hp -= dmg;
  m.hurtT = 0.15;
  const kb = m.type === 'brute' ? 40 : m.type === 'boss' ? 15 : 120;
  m.kbx = Math.cos(ang) * kb;
  m.kby = Math.sin(ang) * kb;
  sfx('slash_hit');
  G.hitstop = staggered ? 0.08 : 0.05;
  G.shake = Math.max(G.shake, staggered ? 4 : 2.5);
  addFloat('' + dmg, m.x + m.size / 2, m.y - 2, staggered ? '#fee761' : '#ffffff');
  spawnPix(m.x + m.size / 2, m.y + m.size / 2, '#ffffff', 5, 40, 0.25);
  if (m.hp > 0 && breakPoise(m, poiseDmg)) {
    addFloat('STAGGER', m.x + m.size / 2, m.y - 10, '#fee761');
    G.hitstop = 0.12;
  }
  if (m.hp <= 0) killMonster(m);
}

const DROP_TABLE = {
  slime:    [['gel', 0.6]],
  skeleton: [['bone', 0.65]],
  bat:      [],
  archer:   [['potion', 0.15]],
  brute:    [['potion', 0.3]],
  boss:     [['amulet', 1]],
};

export function killMonster(m) {
  G.monsters.splice(G.monsters.indexOf(m), 1);
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
  for (const [item, p] of DROP_TABLE[m.type]) {
    if (Math.random() < p) {
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
    p.maxHp += 2;
    p.hp = p.maxHp;
    sfx('levelup');
    G.banner = { text: 'LEVEL ' + p.level + '!  Max HP up, damage up', t: 2.5 };
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
    if (pr.life <= 0 || isSolidAt(G.map, pr.x, pr.y)) {
      spawnPix(pr.x, pr.y, pr.boss ? '#b55088' : '#c0cbdc', 3, 30, 0.2);
      G.projectiles.splice(i, 1);
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
