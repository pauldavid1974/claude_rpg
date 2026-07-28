// Player, monsters, NPCs: creation, AI, movement.

import { G, TILE } from './state.js';
import { isSolidAt } from './maps.js';
import { damagePlayer, monsterShoot, moveset } from './combat.js';
import { sfx } from './audio.js';
import { dust, spawnPix } from './particles.js';
import { bonuses } from './skills.js';

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

// Would the collision box be blocked with its centre at (cx, cy)?
export function feetBlockedAt(cx, cy) {
  return boxBlocked(G.map, { x: cx - 5, y: cy - 3, w: 10, h: 6 });
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
    sp: 0, skills: {},
    attackT: 0, attackDur: 0.26, attackDir: 'down', iframes: 0,
    combo: 0, comboT: 0, heavy: false, chargeT: 0,
    dodgeT: 0, dodgeCd: 0, dodgeAng: 0,
    useCd: 0, hasteT: 0, poison: 0, poisonWard: 0, poisonTick: 0,
    quick: ['potion', null, null],
    speed: 72,
  };
}

// --- dodge roll ---------------------------------------------------------
// A short burst along one direction with invulnerability over most of it,
// then a cooldown: the answer to a telegraphed wind-up.

export const DODGE = { time: 0.30, iframes: 0.24, cd: 0.42, speed: 230 };

export function canDodge() {
  const p = G.player;
  return p.dodgeT <= 0 && p.dodgeCd <= 0;
}

export function startDodge(ang) {
  const p = G.player;
  if (!canDodge()) return false;
  const b = bonuses();
  p.dodgeT = DODGE.time;
  p.dodgeCd = DODGE.time + DODGE.cd * b.dodgeCd;
  p.dodgeMax = p.dodgeCd;
  p.dodgeAng = ang;
  p.iframes = Math.max(p.iframes, DODGE.iframes * b.iframes);
  p.attackT = 0;
  p.kbx = p.kby = 0;
  if (Math.abs(Math.cos(ang)) > Math.abs(Math.sin(ang))) p.dir = Math.cos(ang) < 0 ? 'left' : 'right';
  else p.dir = Math.sin(ang) < 0 ? 'up' : 'down';
  sfx('dodge');
  dust(p.x + 8, p.y + 15);
  return true;
}

export function playerStats() {
  const p = G.player;
  const b = bonuses();
  const wAtk = p.weapon ? (p.weapon === 'dagger' ? 1 : p.weapon === 'sword' ? 3 : 6) : 0;
  const aDef = p.armor ? (p.armor === 'leather' ? 1 : p.armor === 'chain' ? 3 : 6) : 0;
  return {
    atk: 1 + b.atk + wAtk,
    def: aDef + b.def,
    // heavier steel rocks an enemy harder
    poise: (p.weapon === 'sword' ? 1.6 : p.weapon === 'greatsword' ? 2.8 : 1) * b.poise,
    crit: b.crit,
    critMult: b.critMult,
  };
}

// dx/dy: desired movement vector (any magnitude; normalized here).
// Venom: a slow bleed you can wait out, cut short with an antidote.
function tickStatus(dt) {
  const p = G.player;
  if (p.useCd > 0) p.useCd -= dt;
  if (p.hasteT > 0) p.hasteT -= dt;
  if (p.poisonWard > 0) p.poisonWard -= dt;
  if (p.poison > 0) {
    p.poison -= dt;
    p.poisonTick -= dt;
    if (p.poisonTick <= 0) {
      p.poisonTick = 1.4;
      p.hp -= 1;
      spawnPix(p.x + 8, p.y + 8, '#63c74d', 4, 26, 0.4);
      if (p.hp <= 0) { p.hp = 0; G.mode = 'gameover'; G.ui.gameoverT = 0; }
    }
  }
}

export function poisonPlayer(seconds) {
  const p = G.player;
  if (p.poisonWard > 0 || p.iframes > 0) return;
  p.poison = Math.max(p.poison, seconds);
  p.poisonTick = Math.min(p.poisonTick || 1.4, 1.0);
}

export function updatePlayerMovement(dt, dx, dy) {
  const p = G.player;
  tickStatus(dt);
  if (p.dodgeCd > 0) p.dodgeCd -= dt;
  if (p.dodgeT > 0) {
    p.dodgeT -= dt;
    const k = Math.max(0, p.dodgeT / DODGE.time);
    const spd = DODGE.speed * (0.3 + 0.7 * k);
    moveEntity(p, Math.cos(p.dodgeAng) * spd * dt, 0);
    moveEntity(p, 0, Math.sin(p.dodgeAng) * spd * dt);
    if (Math.random() < dt * 22) dust(p.x + 8, p.y + 14);
    p.moving = false;
    p.animT = 0;
    if (p.iframes > 0) p.iframes -= dt;
    return;
  }
  p.moving = (dx || dy) && p.attackT <= 0;
  if (p.moving) {
    if (Math.abs(dx) > Math.abs(dy)) p.dir = dx < 0 ? 'left' : 'right';
    else p.dir = dy < 0 ? 'up' : 'down';
    const len = Math.hypot(dx, dy);
    const step = p.speed * bonuses().speed * (p.hasteT > 0 ? 1.5 : 1) * dt;
    moveEntity(p, dx / len * step, 0);
    moveEntity(p, 0, dy / len * step);
    p.animT += dt;
    p.stepT -= dt;
  } else {
    p.animT = 0;
  }
  if (p.attackT > 0) {
    p.attackT -= dt;
    // the swing lands: hold the string open for a beat
    if (p.attackT <= 0) { p.comboT = moveset().window; p.heavy = false; }
  } else if (p.comboT > 0) {
    p.comboT -= dt;
    if (p.comboT <= 0) p.combo = 0;
  }
  if (p.iframes > 0) p.iframes -= dt;
}

export function facePoint(wx, wy) {
  const p = G.player;
  const dx = wx - (p.x + 8), dy = wy - (p.y + 11);
  if (Math.abs(dx) > Math.abs(dy)) p.dir = dx < 0 ? 'left' : 'right';
  else p.dir = dy < 0 ? 'up' : 'down';
}

// --- monsters ----------------------------------------------------------

const MONSTER_STATS = {
  slime:    { hp: 6,  atk: 2, xp: 4,  speed: 55, poise: 2,  anim: 'slime_idle',    die: 'slime_die',    gold: [1, 4] },
  skeleton: { hp: 12, atk: 3, xp: 8,  speed: 34, poise: 3,  anim: 'skeleton_walk', die: 'skeleton_die', gold: [3, 7] },
  bat:      { hp: 5,  atk: 2, xp: 5,  speed: 62, poise: 1,  anim: 'bat_fly',       die: 'bat_die',      gold: [2, 5] },
  archer:   { hp: 9,  atk: 3, xp: 9,  speed: 40, poise: 2,  anim: 'archer_idle',   die: 'archer_die',   gold: [4, 9] },
  brute:    { hp: 26, atk: 5, xp: 18, speed: 26, poise: 6,  anim: 'brute_walk',    die: 'brute_die',    gold: [8, 16] },
  boss:     { hp: 90, atk: 6, xp: 120, speed: 30, poise: 12, anim: 'boss_idle',    die: 'boss_die',     gold: [50, 80] },
};

// Melee attack profile: a readable wind-up, a short strike that actually
// carries the damage, then a recovery you can punish. Contact alone no
// longer hurts - everything an enemy does is telegraphed first.
const ATTACK = {
  slime:    { reach: 22, wind: 0.42, strike: 0.14, recover: 0.28, cd: 0.55, lunge: 105, range: 9 },
  skeleton: { reach: 24, wind: 0.52, strike: 0.13, recover: 0.36, cd: 0.70, lunge: 60,  range: 10 },
  bat:      { reach: 28, wind: 0.28, strike: 0.16, recover: 0.46, cd: 0.85, lunge: 185, range: 8 },
  archer:   null,   // ranged only
  brute:    { reach: 30, wind: 0.78, strike: 0.18, recover: 0.52, cd: 1.05, lunge: 80,  range: 13 },
  boss:     { reach: 42, wind: 0.60, strike: 0.20, recover: 0.42, cd: 0.90, lunge: 140, range: 16 },
};

export const STAGGER_TIME = 0.75;

export function attackProfile(m) { return ATTACK[m.type] || null; }

// Where a wind-up is going to land, in world space.
export function monsterAttackBox(m) {
  const A = ATTACK[m.type];
  if (!A) return null;
  const c = monsterCenter(m);
  const r = A.range;
  const d = m.size * 0.35 + r * 0.7;
  return {
    x: c.x + Math.cos(m.atkAng) * d - r,
    y: c.y + Math.sin(m.atkAng) * d - r,
    w: r * 2, h: r * 2,
  };
}

export function spawnMonster(type, tx, ty) {
  const s = MONSTER_STATS[type];
  const size = type === 'boss' ? 32 : 16;
  return {
    type, ...structuredClone(s),
    maxHp: s.hp, poiseMax: s.poise,
    x: tx * TILE, y: ty * TILE, size,
    homeX: tx * TILE, homeY: ty * TILE,
    state: 'idle', t: Math.random() * 2, flip: false,
    hurtT: 0, kbx: 0, kby: 0, telegraphT: 0,
    atkPhase: 'none', atkT: 0, atkCd: Math.random() * 0.8, atkAng: 0, atkHit: false,
    face: 0, prevX: tx * TILE, prevY: ty * TILE,
    staggerT: 0,
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

  // --- stagger: poise broken, wide open for a moment ------------------
  if (m.staggerT > 0) {
    m.staggerT -= dt;
    m.atkPhase = 'none';
    m.atkT = 0;
    m.atkCd = Math.max(m.atkCd, 0.3);
    faceFromMotion(m);
    return;
  }
  if (m.poise < m.poiseMax) {
    m.poise = Math.min(m.poiseMax, m.poise + dt * m.poiseMax * 0.4);
  }

  // --- telegraphed melee ----------------------------------------------
  const A = ATTACK[m.type];
  if (m.atkPhase !== 'none') {
    m.atkT -= dt;
    if (m.atkPhase === 'wind') {
      // track the player early in the wind-up, then commit, so the
      // marker on the ground is a promise you can roll out of
      if (m.atkT > A.wind * 0.4) m.atkAng = Math.atan2(dy, dx);
      m.flip = Math.cos(m.atkAng) < 0;
      m.face = m.atkAng;
      if (m.atkT <= 0) {
        m.atkPhase = 'strike';
        m.atkT = A.strike;
        m.atkHit = false;
        sfx('swing');
      }
    } else if (m.atkPhase === 'strike') {
      moveEntity(m, Math.cos(m.atkAng) * A.lunge * dt, Math.sin(m.atkAng) * A.lunge * dt);
      if (!m.atkHit && overlaps(monsterAttackBox(m), feetBox(p))) {
        m.atkHit = true;
        damagePlayer(m.atk, mc.x, mc.y);
      }
      if (m.atkT <= 0) { m.atkPhase = 'recover'; m.atkT = A.recover; }
    } else if (m.atkT <= 0) {
      m.atkPhase = 'none';
      m.atkCd = A.cd;
    }
    faceFromMotion(m);
    return;
  }
  if (A) {
    m.atkCd -= dt;
    if (m.atkCd <= 0 && dist < A.reach && m.telegraphT <= 0 && !(m.lungeT > 0)) {
      m.atkPhase = 'wind';
      m.atkT = A.wind;
      m.atkAng = Math.atan2(dy, dx);
      m.face = m.atkAng;
      sfx('telegraph');
      faceFromMotion(m);
      return;
    }
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
  faceFromMotion(m);
}

// Facing comes from where the monster actually went, not from where the
// player is - otherwise nothing could ever be caught from behind.
function faceFromMotion(m) {
  const mvx = m.x - m.prevX, mvy = m.y - m.prevY;
  if (mvx * mvx + mvy * mvy > 0.004) m.face = Math.atan2(mvy, mvx);
  m.prevX = m.x; m.prevY = m.y;
}

// Poise damage from a hit; zero poise means a stagger.
export function breakPoise(m, amount) {
  if (m.staggerT > 0) return false;
  m.poise -= amount;
  if (m.poise > 0) return false;
  m.poise = m.poiseMax;
  m.staggerT = STAGGER_TIME * (m.type === 'boss' ? 0.7 : 1);
  m.atkPhase = 'none';
  sfx('break');
  for (let i = 0; i < 8; i++) {
    spawnPix(m.x + m.size / 2, m.y + m.size / 2, '#fee761', 4, 60, 0.4);
  }
  return true;
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
