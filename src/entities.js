// Player, monsters, NPCs: creation, AI, movement.

import { G, TILE } from './state.js';
import { isSolidAt } from './maps.js';
import { damagePlayer, monsterShoot } from './combat.js';

// --- collision helpers -------------------------------------------------

// Entity position is the top-left of its 16px sprite; the collision box is
// the feet area.
export function feetBox(e) {
  return { x: e.x + 3, y: e.y + 9, w: 10, h: 6 };
}

function boxBlocked(map, b) {
  return isSolidAt(map, b.x, b.y) || isSolidAt(map, b.x + b.w, b.y) ||
         isSolidAt(map, b.x, b.y + b.h) || isSolidAt(map, b.x + b.w, b.y + b.h) ||
         propBlocked(b);
}

function propBlocked(b) {
  for (const p of G.map.props) {
    if (!p.solid) continue;
    const px = p.x * TILE + 2, py = p.y * TILE + 4, pw = 12, ph = 11;
    if (b.x < px + pw && b.x + b.w > px && b.y < py + ph && b.y + b.h > py) return true;
  }
  return false;
}

export function moveEntity(e, dx, dy) {
  const map = G.map;
  if (dx) {
    const b = feetBox(e); b.x += dx;
    if (!boxBlocked(map, b)) e.x += dx; else dx = 0;
  }
  if (dy) {
    const b = feetBox(e); b.y += dy;
    if (!boxBlocked(map, b)) e.y += dy; else dy = 0;
  }
  return dx !== 0 || dy !== 0;
}

export function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}


// --- player ------------------------------------------------------------

export function createPlayer() {
  return {
    x: 0, y: 0, dir: 'down', moving: false,
    animT: 0, stepT: 0,
    hp: 10, maxHp: 10, level: 1, xp: 0, gold: 25,
    weapon: 'dagger', armor: null,
    inv: [{ id: 'dagger', n: 1 }, { id: 'potion', n: 2 }],
    attackT: 0, attackDir: 'down', iframes: 0,
    speed: 72,
  };
}

export function playerStats() {
  const p = G.player;
  const wAtk = p.weapon ? (p.weapon === 'dagger' ? 1 : p.weapon === 'sword' ? 3 : 6) : 0;
  const aDef = p.armor ? (p.armor === 'leather' ? 1 : p.armor === 'chain' ? 3 : 6) : 0;
  return {
    atk: 1 + Math.floor((p.level - 1) / 2) + wAtk,
    def: aDef,
  };
}

export function updatePlayerMovement(dt, held) {
  const p = G.player;
  let dx = 0, dy = 0;
  if (held.left) dx -= 1;
  if (held.right) dx += 1;
  if (held.up) dy -= 1;
  if (held.down) dy += 1;
  p.moving = (dx || dy) && p.attackT <= 0;
  if (p.moving) {
    if (dy < 0) p.dir = 'up';
    if (dy > 0) p.dir = 'down';
    if (dx < 0) p.dir = 'left';
    if (dx > 0) p.dir = 'right';
    const len = Math.hypot(dx, dy);
    const step = p.speed * dt;
    moveEntity(p, dx / len * step, 0);
    moveEntity(p, 0, dy / len * step);
    p.animT += dt;
    p.stepT -= dt;
  } else {
    p.animT = 0;
  }
  if (p.attackT > 0) p.attackT -= dt;
  if (p.iframes > 0) p.iframes -= dt;
}

// --- monsters ----------------------------------------------------------

const MONSTER_STATS = {
  slime:    { hp: 6,  atk: 2, xp: 4,  speed: 55, anim: 'slime_idle',    die: 'slime_die',    gold: [1, 4] },
  skeleton: { hp: 12, atk: 3, xp: 8,  speed: 34, anim: 'skeleton_walk', die: 'skeleton_die', gold: [3, 7] },
  bat:      { hp: 5,  atk: 2, xp: 5,  speed: 62, anim: 'bat_fly',       die: 'bat_die',      gold: [2, 5] },
  archer:   { hp: 9,  atk: 3, xp: 9,  speed: 40, anim: 'archer_idle',   die: 'archer_die',   gold: [4, 9] },
  brute:    { hp: 26, atk: 5, xp: 18, speed: 26, anim: 'brute_walk',    die: 'brute_die',    gold: [8, 16] },
  boss:     { hp: 90, atk: 6, xp: 120, speed: 30, anim: 'boss_idle',    die: 'boss_die',     gold: [50, 80] },
};

export function spawnMonster(type, tx, ty) {
  const s = MONSTER_STATS[type];
  const size = type === 'boss' ? 32 : 16;
  return {
    type, ...structuredClone(s),
    maxHp: s.hp,
    x: tx * TILE, y: ty * TILE, size,
    homeX: tx * TILE, homeY: ty * TILE,
    state: 'idle', t: Math.random() * 2, flip: false,
    hurtT: 0, kbx: 0, kby: 0, telegraphT: 0,
    vx: 0, vy: 0,
  };
}

function playerCenter() {
  return { x: G.player.x + 8, y: G.player.y + 12 };
}
function monsterCenter(m) {
  return { x: m.x + m.size / 2, y: m.y + m.size * 0.7 };
}

export function updateMonster(m, dt) {
  const p = G.player;
  const pc = playerCenter(), mc = monsterCenter(m);
  const dx = pc.x - mc.x, dy = pc.y - mc.y;
  const dist = Math.hypot(dx, dy);
  m.t -= dt;
  if (m.hurtT > 0) m.hurtT -= dt;

  // knockback decays
  if (m.kbx || m.kby) {
    moveEntity(m, m.kbx * dt, m.kby * dt);
    m.kbx *= Math.pow(0.002, dt);
    m.kby *= Math.pow(0.002, dt);
    if (Math.abs(m.kbx) < 4 && Math.abs(m.kby) < 4) { m.kbx = m.kby = 0; }
  }

  switch (m.type) {
    case 'slime':
      if (m.t <= 0) {
        m.t = 1.1 + Math.random() * 0.5;
        const ang = dist < 110 ? Math.atan2(dy, dx) : Math.random() * Math.PI * 2;
        m.vx = Math.cos(ang) * m.speed;
        m.vy = Math.sin(ang) * m.speed;
        m.hopT = 0.4;
      }
      if (m.hopT > 0) {
        m.hopT -= dt;
        moveEntity(m, m.vx * dt, m.vy * dt);
        m.flip = m.vx < 0;
      }
      break;

    case 'skeleton':
      if (dist < 100) {
        moveEntity(m, Math.sign(dx) * m.speed * dt, Math.sign(dy) * m.speed * dt);
        m.flip = dx < 0;
      } else {
        if (m.t <= 0) { m.t = 1.6 + Math.random(); m.patrol = (m.patrol || 1) * -1; }
        if (!moveEntity(m, (m.patrol || 1) * m.speed * 0.6 * dt, 0)) m.patrol = (m.patrol || 1) * -1;
        m.flip = (m.patrol || 1) < 0;
      }
      break;

    case 'bat': {
      const swoop = dist < 120;
      const ang = swoop ? Math.atan2(dy, dx) : (m.wanderAng ??= Math.random() * 7);
      if (!swoop && m.t <= 0) { m.t = 1.2; m.wanderAng = Math.random() * Math.PI * 2; }
      const wob = Math.sin(G.time * 6 + m.homeX) * 30;
      moveEntity(m,
        Math.cos(ang) * m.speed * dt,
        (Math.sin(ang) * m.speed + wob) * dt * 0.8);
      m.flip = Math.cos(ang) < 0;
      break;
    }

    case 'archer':
      if (dist < 60) {         // too close: back away
        moveEntity(m, -Math.sign(dx) * m.speed * dt, -Math.sign(dy) * m.speed * dt);
      } else if (dist < 150) { // in range: hold and shoot
        if (m.t <= 0) {
          m.t = 2.1;
          monsterShoot(mc.x, mc.y, Math.atan2(dy, dx), 95, m.atk);
        }
      } else if (m.t <= 0) {
        m.t = 1.5;
        m.wanderAng = Math.random() * Math.PI * 2;
      } else if (m.wanderAng !== undefined) {
        moveEntity(m, Math.cos(m.wanderAng) * 20 * dt, Math.sin(m.wanderAng) * 20 * dt);
      }
      m.flip = dx < 0;
      break;

    case 'brute':
      if (dist < 130) {
        const ang = Math.atan2(dy, dx);
        moveEntity(m, Math.cos(ang) * m.speed * dt, Math.sin(ang) * m.speed * dt);
        m.flip = dx < 0;
      }
      break;

    case 'boss': {
      const enraged = m.hp < m.maxHp / 2;
      const spd = m.speed * (enraged ? 1.5 : 1);
      if (m.telegraphT > 0) {
        m.telegraphT -= dt;
        if (m.telegraphT <= 0) {
          for (let i = 0; i < 8; i++) {
            const a = i / 8 * Math.PI * 2 + G.time;
            monsterShoot(mc.x, mc.y - 6, a, 80, m.atk - 2, true);
          }
          m.lungeT = 0.5;
          m.lungeAng = Math.atan2(dy, dx);
        }
      } else if (m.lungeT > 0) {
        m.lungeT -= dt;
        moveEntity(m, Math.cos(m.lungeAng) * 130 * dt, Math.sin(m.lungeAng) * 130 * dt);
      } else if (dist < 200) {
        moveEntity(m, Math.cos(Math.atan2(dy, dx)) * spd * dt, Math.sin(Math.atan2(dy, dx)) * spd * dt);
        if (m.t <= 0) {
          m.t = enraged ? 2.4 : 3.6;
          m.telegraphT = 0.6;
        }
      }
      m.flip = dx < 0;
      break;
    }
  }

  // touch damage
  const box = { x: m.x + 2, y: m.y + m.size * 0.4, w: m.size - 4, h: m.size * 0.55 };
  if (overlaps(box, feetBox(p))) {
    damagePlayer(m.atk, mc.x, mc.y);
  }
}

// --- NPCs --------------------------------------------------------------

export function spawnNpc(def) {
  return {
    ...def,
    x: def.x * TILE, y: def.y * TILE,
    homeX: def.x * TILE, homeY: def.y * TILE,
    t: Math.random() * 3, vx: 0, vy: 0,
  };
}

export function updateNpc(n, dt) {
  if (!n.wander) return;
  n.t -= dt;
  if (n.t <= 0) {
    n.t = 2 + Math.random() * 2.5;
    if (Math.random() < 0.6) {
      const a = Math.random() * Math.PI * 2;
      n.vx = Math.cos(a) * 22; n.vy = Math.sin(a) * 22;
      n.walkT = 0.7;
    }
  }
  if (n.walkT > 0) {
    n.walkT -= dt;
    // stay near home
    if (Math.abs(n.x + n.vx * dt - n.homeX) < 40 && Math.abs(n.y + n.vy * dt - n.homeY) < 40) {
      moveEntity(n, n.vx * dt, n.vy * dt);
    }
  }
}
