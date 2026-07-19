// Boot, game loop, world update/draw, map changes, interactions.

import { G, VW, VH, TILE, setView, resetRun } from './state.js';
import { loadAssets, drawAnim, drawAnimFlash, frameOf } from './assets.js';
import { initInput, input, endFrame } from './input.js';
import { initAudio, music, sfx, toggleMute, setMuted } from './audio.js';
import { buildMap } from './maps.js';
import {
  createPlayer, updatePlayerMovement, updateMonster, updateNpc,
  spawnMonster, spawnNpc, feetBox, moveEntity,
} from './entities.js';
import { startAttack, updateCombat } from './combat.js';
import { updateParticles, drawParticles, drawFloats, sparkle, dust, addFloat } from './particles.js';
import { openInventory, updateInventory, drawInventory, addItem, hasItem, removeItem } from './inventory.js';
import { openQuests, updateQuests, drawQuests } from './quests.js';
import { updateDialogue, drawDialogue, talkTo, say } from './dialogue.js';
import { updateShop, drawShop } from './shops.js';
import {
  drawHud, drawTitle, updateTitle, drawPause, updatePause,
  drawGameover, drawTransition, drawText,
} from './ui.js';
import { saveGame, loadGame, clearSave } from './save.js';
import { ITEMS } from './items.js';

// --- boot ---------------------------------------------------------------

const canvas = document.getElementById('game');
G.canvas = canvas;
G.ctx = canvas.getContext('2d');
G.ctx.imageSmoothingEnabled = false;

// Render at an integer number of device pixels per game pixel, so the
// browser never resamples, and extend the internal viewport so the canvas
// fills the whole window: no letterboxing, no stretched pixels.
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const z = Math.max(1, Math.floor(Math.min(innerWidth * dpr / 320, innerHeight * dpr / 180)));
  const vw = Math.max(320, Math.ceil(innerWidth * dpr / z));
  const vh = Math.max(180, Math.ceil(innerHeight * dpr / z));
  setView(vw, vh);
  G.zoom = z;
  canvas.width = vw * z;
  canvas.height = vh * z;
  const cssW = vw * z / dpr, cssH = vh * z / dpr;
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.style.left = Math.min(0, (innerWidth - cssW) / 2) + 'px';
  canvas.style.top = Math.min(0, (innerHeight - cssH) / 2) + 'px';
}
addEventListener('resize', resize);
resize();

async function boot() {
  await loadAssets();
  await document.fonts.load('16px "Jacquard 12"').catch(() => {});
  initInput(() => {
    initAudio();
    if (G.muted) setMuted(true);
    music(G.mode === 'title' ? 'town' : G.map ? G.map.music : 'town');
  });
  const save = loadGame();
  G.ui.title = { sel: 0, hasSave: !!save };
  requestAnimationFrame(loop);
}

// --- map / run management -----------------------------------------------

export function changeMap(name, tx, ty) {
  resetRun();
  G.map = buildMap(name);
  G.mapName = name;
  for (const p of G.map.props) {
    if (p.type === 'chest') p.solid = true;
    if (p.type === 'sign') p.solid = true;
    if (p.type === 'barrel') p.solid = true;
    if (p.type === 'gate') p.solid = !G.flags.gateOpen;
  }
  G.map.props = G.map.props.filter(p => !(p.type === 'gate' && G.flags.gateOpen));
  for (const d of G.map.monsterDefs) {
    if (d.type === 'boss' && G.flags.bossDead) continue;
    G.monsters.push(spawnMonster(d.type, d.x, d.y));
  }
  for (const d of G.map.npcDefs) G.npcs.push(spawnNpc(d));
  for (const d of G.map.pickupDefs) {
    if (G.flags['got_' + d.id]) continue;
    G.pickups.push({ kind: 'item', item: d.item, id: d.id, x: d.x * TILE + 8, y: d.y * TILE + 8, vx: 0, vy: 0, t: 1 });
  }
  G.player.x = tx * TILE;
  G.player.y = ty * TILE;
  [G.cam.x, G.cam.y] = camTarget();
  music(G.map.music);
  saveGame();
}

function transitionTo(cb) {
  if (G.transition) return;
  sfx('door');
  G.transition = { phase: 'out', t: 0, cb };
}

function newGame() {
  clearSave();
  G.player = createPlayer();
  G.quests = {};
  G.flags = {};
  G.mode = 'play';
  changeMap('town1', 12, 10);
  say('Elder Rowan', [
    'Welcome to Emberdale, traveler. Dark times - but you look capable.',
    'Find me by the blue-roofed house when you are ready to help.',
  ]);
}

function continueGame(save) {
  G.player = createPlayer();
  Object.assign(G.player, save.player);
  G.quests = save.quests || {};
  G.flags = save.flags || {};
  G.muted = !!save.muted;
  G.mode = 'play';
  changeMap(save.mapName || 'town1', 2, 2);
  G.player.x = save.player.x;
  G.player.y = save.player.y;
}

function respawn() {
  const p = G.player;
  p.gold = Math.floor(p.gold * 0.8);
  p.hp = p.maxHp;
  p.iframes = 2;
  G.mode = 'play';
  changeMap('town1', 12, 10);
}

// --- interaction --------------------------------------------------------

function facingPoint() {
  const p = G.player;
  const cx = p.x + 8, cy = p.y + 11;
  const d = 14;
  switch (p.dir) {
    case 'up': return { x: cx, y: cy - d };
    case 'down': return { x: cx, y: cy + d };
    case 'left': return { x: cx - d, y: cy };
    default: return { x: cx + d, y: cy };
  }
}

function tryInteract() {
  const p = G.player;
  const fp = facingPoint();
  // NPCs
  for (const n of G.npcs) {
    if (Math.hypot(n.x + 8 - fp.x, n.y + 8 - fp.y) < 13 ||
        Math.hypot(n.x + 8 - (p.x + 8), n.y + 8 - (p.y + 8)) < 18) {
      n.facePlayer = true;
      talkTo(n);
      return;
    }
  }
  // props
  for (const pr of G.map.props) {
    const px = pr.x * TILE + 8, py = pr.y * TILE + 8;
    if (Math.hypot(px - fp.x, py - fp.y) > 13) continue;
    if (pr.type === 'sign') {
      say(null, [pr.text]);
      return;
    }
    if (pr.type === 'chest') {
      if (G.flags['chest_' + pr.id]) { say(null, ['Empty.']); return; }
      G.flags['chest_' + pr.id] = true;
      sfx('pickup');
      const loot = pr.loot || {};
      for (let i = 0; i < (loot.gold || 0); i += 2) {
        const a = Math.random() * Math.PI * 2;
        G.pickups.push({ kind: 'coin', x: px, y: py, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60 - 20, t: 0, value: 2 });
      }
      if (loot.gold) addFloat('+' + loot.gold + 'g', px, py - 8, '#fee761');
      for (const it of loot.items || []) {
        addItem(it, 1);
        addFloat(ITEMS[it].name, px, py - 16, '#2ce8f5');
      }
      sparkle(px, py - 4, 10, '#fee761');
      saveGame();
      return;
    }
    if (pr.type === 'gate') {
      if (hasItem('key')) {
        removeItem('key', 1);
        G.flags.gateOpen = true;
        G.map.props = G.map.props.filter(q => q.type !== 'gate');
        sfx('door');
        G.shake = 3;
        say(null, ['The bone key crumbles as the gate grinds open.']);
        saveGame();
      } else {
        say(null, ['A heavy gate, barred fast. The keyhole is shaped like bone.']);
      }
      return;
    }
  }
}

// --- update -------------------------------------------------------------

let last = 0;

function loop(ts) {
  requestAnimationFrame(loop);
  const now = ts / 1000;
  let dt = Math.min(0.05, now - (last || now));
  last = now;
  G.time += dt;

  if (G.hitstop > 0) {
    G.hitstop -= dt;
    dt = 0;
  }

  switch (G.mode) {
    case 'title': {
      const act = updateTitle();
      if (act === 'New Game') newGame();
      else if (act === 'Continue') continueGame(loadGame());
      break;
    }
    case 'play': updatePlay(dt); break;
    case 'dialogue': updateDialogue(dt); updateWorldAmbient(dt); break;
    case 'inventory': updateInventory(dt); break;
    case 'quests': updateQuests(dt); break;
    case 'shop': updateShop(dt); break;
    case 'pause': {
      const act = updatePause();
      if (act === 'Resume') { G.mode = 'play'; sfx('menu'); }
      else if (act === 'Mute' || act === 'Unmute') { toggleMute(); saveGame(); }
      else if (act === 'Restart (new game)') newGame();
      break;
    }
    case 'gameover': {
      G.ui.gameoverT += dt;
      if (G.ui.gameoverT > 1.2 && (input.pressed.interact || input.pressed.attack)) respawn();
      break;
    }
  }

  if (G.transition) {
    const tr = G.transition;
    tr.t += (now - (tr.last || now)) * 4; // real time, unaffected by hitstop
    tr.last = now;
    if (tr.phase === 'out' && tr.t >= 1) {
      tr.cb();
      tr.phase = 'in'; tr.t = 0;
    } else if (tr.phase === 'in' && tr.t >= 1) {
      G.transition = null;
    }
  }

  if (input.pressed.mute) { toggleMute(); saveGame(); }

  draw();
  endFrame();
}

function updatePlay(dt) {
  const p = G.player;
  if (input.pressed.pause) { G.mode = 'pause'; G.ui.pause = { sel: 0 }; sfx('menu'); return; }
  if (input.pressed.inv) { openInventory(); return; }
  if (input.pressed.quest) { openQuests(); return; }
  if (input.pressed.interact) { tryInteract(); if (G.mode !== 'play') return; }
  if (input.pressed.attack) startAttack();

  if (!G.transition) updatePlayerMovement(dt, input.held);

  // player knockback
  if (p.kbx || p.kby) {
    moveEntity(p, p.kbx * dt, p.kby * dt);
    p.kbx *= Math.pow(0.001, dt); p.kby *= Math.pow(0.001, dt);
    if (Math.abs(p.kbx) < 4) p.kbx = 0;
    if (Math.abs(p.kby) < 4) p.kby = 0;
  }

  // footsteps
  if (p.moving && p.stepT <= 0) {
    p.stepT = 0.24;
    sfx('step');
    dust(p.x + 8, p.y + 15);
  }

  for (const m of G.monsters) updateMonster(m, dt);
  for (const n of G.npcs) updateNpc(n, dt);
  updateCombat(dt);
  updateWorldAmbient(dt);

  // exits
  if (!G.transition) {
    const fb = feetBox(p);
    const tx = Math.floor((fb.x + fb.w / 2) / TILE), ty = Math.floor((fb.y + fb.h / 2) / TILE);
    for (const e of G.map.exits) {
      if (tx >= e.x && tx < e.x + e.w && ty >= e.y && ty < e.y + e.h) {
        transitionTo(() => changeMap(e.to, e.tx, e.ty));
        break;
      }
    }
  }

  // camera follows with lerp
  const [targetX, targetY] = camTarget();
  G.cam.x += (targetX - G.cam.x) * Math.min(1, dt * 8);
  G.cam.y += (targetY - G.cam.y) * Math.min(1, dt * 8);

  G.saveTimer += dt;
  if (G.saveTimer > 10) { G.saveTimer = 0; saveGame(); }
}

function updateWorldAmbient(dt) {
  updateParticles(dt);
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 18);
  // water shimmer: occasional cyan glints on visible water
  if (Math.random() < dt * 6) {
    const x = G.cam.x + Math.random() * VW, y = G.cam.y + Math.random() * VH;
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    const cell = G.map.render[ty] && G.map.render[ty][tx];
    if (cell && cell.base.startsWith('water')) {
      G.particles.push({ x, y, vx: 0, vy: -3, g: 0, life: 0.5, maxLife: 0.5, color: '#2ce8f5', size: 1, twinkle: true });
    }
    if (cell && cell.base === 'grass_flowers') {
      G.particles.push({ x, y: y - 2, vx: 4, vy: -6, g: 0, life: 0.8, maxLife: 0.8, color: '#fee761', size: 1, twinkle: true });
    } else if (cell && cell.base.startsWith('grass')) {
      // swaying grass fleck drifting on the breeze
      G.particles.push({ x, y, vx: 9, vy: -2, g: 0, life: 0.7, maxLife: 0.7, color: '#63c74d', size: 1, twinkle: true });
    }
  }
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Camera target: follow the player clamped to map bounds; maps smaller
// than the viewport get centered instead.
function camTarget() {
  const p = G.player;
  const mw = G.map.w * TILE, mh = G.map.h * TILE;
  const tx = mw >= VW ? clamp(p.x + 8 - VW / 2, 0, mw - VW) : -(VW - mw) / 2;
  const ty = mh >= VH ? clamp(p.y + 8 - VH / 2, 0, mh - VH) : -(VH - mh) / 2;
  return [tx, ty];
}

// --- draw ---------------------------------------------------------------

function draw() {
  const ctx = G.ctx;
  ctx.setTransform(G.zoom, 0, 0, G.zoom, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#181425';
  ctx.fillRect(0, 0, VW, VH);

  if (G.mode === 'title') {
    drawTitle(ctx);
    drawTransition(ctx);
    return;
  }
  if (!G.map) return;

  ctx.save();
  if (G.shake > 0) {
    ctx.translate(
      Math.round((Math.random() - 0.5) * G.shake),
      Math.round((Math.random() - 0.5) * G.shake));
  }

  drawWorld(ctx);
  drawParticles(ctx);
  drawFloats(ctx);
  ctx.restore();

  drawHud(ctx);

  switch (G.mode) {
    case 'dialogue': drawDialogue(ctx); break;
    case 'inventory': drawInventory(ctx); break;
    case 'quests': drawQuests(ctx); break;
    case 'shop': drawShop(ctx); break;
    case 'pause': drawPause(ctx); break;
    case 'gameover': drawGameover(ctx, G.ui.gameoverT); break;
  }
  drawTransition(ctx);
}

function drawWorld(ctx) {
  const map = G.map;
  const cx = Math.round(G.cam.x), cy = Math.round(G.cam.y);
  const x0 = Math.max(0, Math.floor(cx / TILE)), x1 = Math.min(map.w - 1, Math.ceil((cx + VW) / TILE));
  const y0 = Math.max(0, Math.floor(cy / TILE)), y1 = Math.min(map.h - 1, Math.ceil((cy + VH) / TILE));

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const cell = map.render[y][x];
      const fi = frameOf(cell.base, G.time);
      drawAnim(ctx, cell.base, fi, x * TILE - cx, y * TILE - cy);
    }
  }

  // depth-sorted drawables: tile overlays (trees etc), props, entities
  const drawables = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const ov = map.render[y][x].overlay;
    if (ov) drawables.push({ y: y * TILE + 15, f: () => drawAnim(ctx, ov, 0, x * TILE - cx, y * TILE - cy) });
  }
  for (const pr of map.props) {
    const px = pr.x * TILE, py = pr.y * TILE;
    if (px < cx - 16 || px > cx + VW || py < cy - 16 || py > cy + VH) continue;
    let name = null, fi = 0;
    if (pr.type === 'chest') { name = G.flags['chest_' + pr.id] ? 'chest_open' : 'chest_closed'; }
    else if (pr.type === 'sign') name = 'sign';
    else if (pr.type === 'torch') { name = 'torch'; fi = frameOf('torch', G.time + pr.x * 0.13); }
    else if (pr.type === 'barrel') name = 'barrel';
    else if (pr.type === 'fence') name = 'fence';
    else if (pr.type === 'gate') name = 'fence';
    if (name) drawables.push({ y: py + 14, f: () => drawAnim(ctx, name, fi, px - cx, py - cy) });
  }
  for (const pk of G.pickups) {
    const bobY = pk.kind === 'item' && pk.t > 0.5 ? Math.sin(G.time * 4 + pk.x) * 1.5 : 0;
    drawables.push({
      y: pk.y, f: () => {
        if (pk.kind === 'coin') drawAnim(ctx, 'coin', frameOf('coin', G.time + pk.x * 0.1), pk.x - 8 - cx, pk.y - 8 - cy);
        else if (pk.kind === 'heart') drawAnim(ctx, 'heart_full', 0, pk.x - 8 - cx, pk.y - 8 - cy);
        else drawAnim(ctx, ITEMS[pk.item].icon, 0, pk.x - 8 - cx, pk.y - 8 + bobY - cy);
      },
    });
  }
  for (const n of G.npcs) {
    drawables.push({
      y: n.y + 15, f: () => {
        const fi = frameOf(n.sprite, G.time + n.homeX * 0.1);
        drawAnim(ctx, n.sprite, fi, n.x - cx, n.y - cy);
        // quest marker
        const mark = questMarker(n);
        if (mark) drawText(ctx, mark, n.x + 6 - cx, n.y - 3 - cy + Math.round(Math.sin(G.time * 3) * 1.5), '#fee761');
      },
    });
  }
  for (const m of G.monsters) {
    drawables.push({ y: m.y + m.size - 1, f: () => drawMonster(ctx, m, cx, cy) });
  }
  drawables.push({ y: G.player.y + 15, f: () => drawPlayer(ctx, cx, cy) });

  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) d.f();

  // projectiles on top
  for (const pr of G.projectiles) {
    ctx.fillStyle = pr.boss ? '#b55088' : '#c0cbdc';
    ctx.fillRect(Math.round(pr.x - 1 - cx), Math.round(pr.y - 1 - cy), 3, 3);
    ctx.fillStyle = pr.boss ? '#68386c' : '#5a6988';
    ctx.fillRect(Math.round(pr.x - cx), Math.round(pr.y - cy), 1, 1);
  }
}

import { QUESTS, canTurnIn } from './quests.js';
function questMarker(n) {
  for (const [id, q] of Object.entries(QUESTS)) {
    if (canTurnIn(id) && q.giver === n.name) return '?';
  }
  if (n.id === 'elder' && (!G.quests.q_slimes || (G.quests.q_slimes?.state === 'done' && !G.quests.q_letter))) return '!';
  if (n.id === 'lila' && !G.quests.q_bats) return '!';
  if (n.id === 'pip' && !G.quests.q_gels) return '!';
  return null;
}

function drawPlayer(ctx, cx, cy) {
  const p = G.player;
  if (p.iframes > 0 && Math.floor(G.time * 14) % 2 && G.mode === 'play') {
    drawAnimFlash(ctx, 'player_hurt', 0, p.x - cx, p.y - cy, '#ffffff');
    return;
  }
  let name, fi = 0;
  if (p.attackT > 0) {
    name = 'player_attack_' + p.attackDir;
  } else {
    name = 'player_walk_' + p.dir;
    fi = p.moving ? [0, 1, 0, 2][Math.floor(p.animT * 7) % 4] : 0;
  }
  drawAnim(ctx, name, fi, p.x - cx, p.y - cy);
}

function drawMonster(ctx, m, cx, cy) {
  let name = m.anim;
  if (m.type === 'boss' && (m.telegraphT > 0 || m.lungeT > 0)) name = 'boss_attack';
  const fi = frameOf(name, G.time + m.homeX * 0.07);
  if (m.hurtT > 0 && Math.floor(G.time * 20) % 2) {
    drawAnimFlash(ctx, name, fi, m.x - cx, m.y - cy, '#ffffff', m.flip);
  } else if (m.telegraphT > 0 && Math.floor(G.time * 10) % 2) {
    drawAnimFlash(ctx, name, fi, m.x - cx, m.y - cy, '#ff0044', m.flip);
  } else {
    drawAnim(ctx, name, fi, m.x - cx, m.y - cy, m.flip);
  }
  // boss hp bar
  if (m.type === 'boss') {
    ctx.fillStyle = '#181425';
    ctx.fillRect(Math.round(m.x - 4 - cx), Math.round(m.y - 6 - cy), 40, 4);
    ctx.fillStyle = '#e43b44';
    ctx.fillRect(Math.round(m.x - 3 - cx), Math.round(m.y - 5 - cy), Math.round(38 * m.hp / m.maxHp), 2);
  }
}

window.EMBER = { G, changeMap };  // debug/testing handle
boot();
