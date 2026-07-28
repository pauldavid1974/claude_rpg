// Boot, game loop, world update/draw, map changes, interactions.

import { G, VW, VH, TILE, setView, resetRun } from './state.js';
import {
  loadAssets, drawAnim, drawAnimFlash, drawActor, drawActorFlash, frameOf, anim,
} from './assets.js';
import { initInput, input, endFrame, pollGamepad } from './input.js';
import { initAudio, music, sfx, toggleMute, setMuted, setCombatMusic } from './audio.js';
import { buildMap, outsideCell, isSolidAt } from './maps.js';
import {
  createPlayer, updatePlayerMovement, updateMonster, updateNpc,
  spawnMonster, spawnNpc, feetBox, moveEntity, facePoint,
  startDodge, canDodge, monsterAttackBox, attackProfile, poisonPlayer, playerStats,
  feetBlockedAt, DODGE,
} from './entities.js';
import {
  startAttack, updateCombat, hitMonster, gainXp, moveset, attackBox,
  CHARGE_MIN, CHARGE_FULL,
} from './combat.js';
import { routeTo, feetCenter } from './pathfind.js';
import { drawLighting, drawGrade, drawShadow, isNight, dayPhase } from './lighting.js';
import { updateParticles, drawParticles, drawFloats, sparkle, dust, addFloat } from './particles.js';
import {
  openInventory, updateInventory, drawInventory, addItem, hasItem, removeItem,
  useQuick, useConsumable, countItem, QUICK_SLOTS,
} from './inventory.js';
import { openQuests, updateQuests, drawQuests, questAim } from './quests.js';
import { openSkills, updateSkills, drawSkills, refreshDerived, respec, RESPEC_COST } from './skills.js';
import { openSettings, updateSettings, drawSettings, loadSettings, settings } from './settings.js';
import * as skills from './skills.js';
import { updateDialogue, drawDialogue, talkTo, say, dialogueState } from './dialogue.js';
import { updateShop, drawShop, SHOPS } from './shops.js';
import {
  drawHud, drawTitle, updateTitle, drawPause, updatePause,
  drawGameover, drawTransition, drawText, pressKey, tickPresses,
  updateDanger, drawDanger, drawMinimap, drawCompass,
} from './ui.js';
import { saveGame, loadGame, clearSave, anySave, newestSlot } from './save.js';
import {
  openSlots, updateSlots, drawSlots, openSummary, updateSummary, drawSummary, newStats,
} from './slots.js';
import { ITEMS } from './items.js';

// --- boot ---------------------------------------------------------------

const canvas = document.getElementById('game');
G.canvas = canvas;
G.ctx = canvas.getContext('2d');
G.ctx.imageSmoothingEnabled = false;

// Render at an integer number of device pixels per game pixel, so the
// browser never resamples, and extend the internal viewport so the canvas
// fills the whole window: no letterboxing, no stretched pixels.
//
// Zoom is chosen so the visible slice of world stays in a sane band no
// matter the screen shape: never wider/taller than MAX (which is what
// made phones feel like watching from orbit), never tighter than MIN.
const TOTAL_NOTES = 4;   // crypt records hidden across the three floors
const SLOWMO_TIME = 1.0;

const MAX_VIEW_W = 340, MAX_VIEW_H = 240;
const MIN_VIEW_W = 150, MIN_VIEW_H = 110;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  // An embedder that has not sized its frame yet reports 0, which used to
  // hand the canvas a width of zero and leave it that way for good.
  const dw = Math.max(MIN_VIEW_W, Math.round((innerWidth || 0) * dpr));
  const dh = Math.max(MIN_VIEW_H, Math.round((innerHeight || 0) * dpr));
  let z = Math.max(1, Math.ceil(Math.max(dw / MAX_VIEW_W, dh / MAX_VIEW_H)));
  z = Math.max(1, Math.min(z, Math.floor(dw / MIN_VIEW_W), Math.floor(dh / MIN_VIEW_H)));
  const vw = Math.max(MIN_VIEW_W, Math.ceil(dw / z));
  const vh = Math.max(MIN_VIEW_H, Math.ceil(dh / z));
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
// Some embedders size the frame without firing a window resize.
if (window.ResizeObserver) {
  let last = '';
  new ResizeObserver(() => {
    const k = innerWidth + 'x' + innerHeight;
    if (k !== last) { last = k; resize(); }
  }).observe(document.documentElement);
}
resize();

// A blank canvas tells nobody anything.  If boot fails - a sheet that will
// not decode, storage that throws - say so on screen where it can be read
// and reported, rather than dying silently.
function fatal(err) {
  const ctx = G.ctx;
  const msg = String((err && err.message) || err || 'unknown error');
  try {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#181425';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#e43b44';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('Emberdale could not start', 16, 32);
    ctx.fillStyle = '#c0cbdc';
    ctx.font = '13px monospace';
    let y = 56;
    for (const line of msg.match(/.{1,60}(\s|$)|.{1,60}/g) || [msg]) {
      ctx.fillText(line.trim(), 16, y);
      y += 18;
    }
    ctx.fillStyle = '#8b9bb4';
    ctx.fillText('Reload to try again.', 16, y + 10);
  } catch (e) { /* nothing left to draw with */ }
  console.error('Emberdale boot failed:', err);
}

async function boot() {
  await loadAssets();
  await document.fonts.load('16px "Jacquard 12"').catch(() => {});
  initInput(() => {
    initAudio();
    if (G.muted) setMuted(true);
    music(G.mode === 'title' ? 'town' : G.map ? G.map.music : 'town');
  });
  loadSettings();
  const save = loadGame();
  G.ui.title = { sel: 0, hasSave: !!save };
  requestAnimationFrame(loop);
}

// --- map / run management -----------------------------------------------

export function changeMap(name, tx, ty) {
  resetRun();
  G.ui.goal = null;
  G.map = buildMap(name);
  G.mapName = name;
  for (const p of G.map.props) {
    if (p.type === 'chest') p.solid = true;
    if (p.type === 'sign') p.solid = true;
    if (p.type === 'barrel') { p.solid = true; p.hp = 2; }
    if (p.type === 'crack') { p.solid = true; p.hp = 3; }
    if (p.type === 'gate') p.solid = !G.flags.gateOpen;
  }
  G.map.props = G.map.props.filter(p =>
    !(p.type === 'gate' && G.flags.gateOpen) &&
    !G.flags['smashed_' + p.x + '_' + p.y + '_' + name]);
  // Elites are rolled per visit outside town, so the same road is never
  // quite the same road twice.
  const eliteChance = name === 'overworld' ? 0.14 : name.startsWith('dungeon') ? 0.20 : 0;
  for (const d of G.map.monsterDefs) {
    if (d.type === 'boss' && G.flags.bossDead) continue;
    const elite = d.elite || (d.type !== 'boss' && Math.random() < eliteChance);
    G.monsters.push(spawnMonster(d.type, d.x, d.y, elite));
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
  G.ngPlus = 0;
  G.stats = newStats();
  G.mode = 'play';
  refreshDerived(true);
  changeMap('town1', 12, 10);
  say('Elder Rowan', [
    'Welcome to Emberdale, traveler. Dark times - but you look capable.',
    'Find me by the blue-roofed house when you are ready to help.',
  ]);
}

function continueGame(save) {
  if (!save) { newGame(); return; }
  G.player = createPlayer();
  Object.assign(G.player, save.player);
  G.quests = save.quests || {};
  G.flags = save.flags || {};
  G.muted = !!save.muted;
  G.ngPlus = save.ngPlus || 0;
  G.stats = Object.assign(newStats(), save.stats || {});
  G.mode = 'play';
  refreshDerived();
  changeMap(save.mapName || 'town1', 12, 10);
  // a save without coordinates (or a corrupt one) keeps the map's spawn
  if (Number.isFinite(save.player.x) && Number.isFinite(save.player.y)) {
    G.player.x = save.player.x;
    G.player.y = save.player.y;
  }
}

// Everything you learned and carried comes with you; the world resets and
// hits harder.
function newGamePlus() {
  const p = G.player;
  G.ngPlus = (G.ngPlus || 0) + 1;
  G.quests = {};
  G.flags = {};
  p.hp = p.maxHp;
  G.mode = 'play';
  G.banner = { text: 'New Game+' + G.ngPlus + ' - Emberdale forgets, the crypt does not', t: 3.5 };
  changeMap('town1', 12, 10);
  saveGame();
}

function respawn() {
  const p = G.player;
  G.stats.deaths++;
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
      talkTo(n);
      return;
    }
  }
  // props
  for (const pr of G.map.props) {
    const px = pr.x * TILE + 8, py = pr.y * TILE + 8;
    if (Math.hypot(px - fp.x, py - fp.y) > 13) continue;
    interactProp(pr);
    return;
  }
}

function interactProp(pr) {
  const px = pr.x * TILE + 8, py = pr.y * TILE + 8;
  {
    if (pr.type === 'sign') {
      say(null, [pr.text]);
      return;
    }
    if (pr.type === 'note') {
      // scraps left by the masons who sealed the crypt; finding them all
      // is its own small reward
      const first = !G.flags['note_' + pr.id];
      G.flags['note_' + pr.id] = true;
      sfx('pickup');
      const found = Object.keys(G.flags).filter(k => k.startsWith('note_')).length;
      say('A water-stained scrap', [pr.text],
          first ? { onDone: () => { G.banner = { text: 'Crypt record ' + found + ' of ' + TOTAL_NOTES, t: 2.2 };
                                    saveGame(); } } : {});
      return;
    }
    if (pr.type === 'crack') {
      say(null, ['Fitted stone, but the mortar is split top to bottom.\nIt would come down under a hard blow.']);
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
  pollGamepad();
  const now = ts / 1000;
  let dt = Math.min(0.05, now - (last || now));
  const dtReal = dt;
  last = now;
  G.time += dt;

  if (G.hitstop > 0) {
    G.hitstop -= dt;
    dt = 0;
  } else if (G.slowmo > 0) {
    // the killing blow on a boss: the world crawls for a beat
    G.slowmo -= dtReal;
    dt *= 0.25 + 0.55 * Math.max(0, 1 - G.slowmo / SLOWMO_TIME);
  }

  switch (G.mode) {
    case 'title': {
      const act = updateTitle();
      // a first-time player should not have to pick a slot they do not have
      if (act === 'New Game') { if (anySave()) openSlots('new'); else { G.slot = 0; newGame(); } }
      else if (act === 'Continue') {
        G.slot = Math.max(0, newestSlot());
        continueGame(loadGame(G.slot));
      } else if (act === 'Saved runs') openSlots('load');
      break;
    }
    case 'slots': {
      const act = updateSlots(dt);
      if (act === 'back') { G.mode = 'title'; G.ui.title.hasSave = anySave(); }
      else if (act && act.load !== undefined) { G.slot = act.load; continueGame(loadGame(G.slot)); }
      else if (act && act.fresh !== undefined) { G.slot = act.fresh; newGame(); }
      break;
    }
    case 'summary': {
      const act = updateSummary(dt);
      if (act === 'ng') newGamePlus();
      else if (act === 'stay') G.mode = 'play';
      break;
    }
    case 'play': updatePlay(dt); break;
    case 'dialogue': updateDialogue(dt); updateWorldAmbient(dt); break;
    case 'inventory': updateInventory(dt); break;
    case 'quests': updateQuests(dt); break;
    case 'skills': updateSkills(dt); break;
    case 'settings': updateSettings(dt); break;
    case 'shop': updateShop(dt); break;
    case 'pause': {
      const act = updatePause();
      if (act === 'Resume') { G.mode = 'play'; sfx('menu'); }
      else if (act === 'Settings') openSettings();
      else if (act === 'Mute' || act === 'Unmute') { toggleMute(); saveGame(); }
      else if (act === 'Restart (new game)') newGame();
      break;
    }
    case 'gameover': {
      G.ui.gameoverT += dt;
      if (G.ui.gameoverT > 1.2 &&
          (input.pressed.interact || input.pressed.attack || input.mouse.clicked)) respawn();
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
  tickPresses(dtReal);
  updateDanger(dtReal);
  if (G.mode !== 'play') G.ui.goal = null;   // menus/dialogue cancel mouse goals

  try {
    draw();
  } catch (err) {
    fatal(err);
    drawFailed = true;
  }
  endFrame();
}

let drawFailed = false;

// HUD buttons (bag/quests/menu) let the game be played mouse-only.
function hudButtonClick() {
  for (const b of G.ui.hudButtons || []) {
    if (input.mouse.x >= b.x && input.mouse.x < b.x + b.w &&
        input.mouse.y >= b.y && input.mouse.y < b.y + b.h) {
      pressKey('hud_' + b.id);
      if (b.id === 'inv') openInventory();
      else if (b.id === 'quest') openQuests();
      else if (b.id === 'skills') openSkills();
      else if (b.id === 'dodge') dodgeNow();
      else if (b.id.startsWith('quick')) useQuick(+b.id.slice(5));
      else { G.mode = 'pause'; G.ui.pause = { sel: 0 }; sfx('menu'); }
      return true;
    }
  }
  return false;
}

// Keep holding attack after a swing and the next one winds up: release a
// full charge for a heavy blow that shatters guards.
function updateCharge(dt) {
  const p = G.player;
  const held = input.held.attack || input.mouse.rheld;
  if (held && p.attackT <= 0 && p.dodgeT <= 0 && G.mode === 'play') {
    p.chargeT += dt;
    if (p.chargeT >= CHARGE_MIN) {
      if (!p.chargeRang) { p.chargeRang = true; sfx('charge'); }
      if (Math.random() < dt * 34) {
        const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 4;
        G.particles.push({
          x: p.x + 8 + Math.cos(a) * r, y: p.y + 9 + Math.sin(a) * r,
          vx: -Math.cos(a) * 26, vy: -Math.sin(a) * 26, g: 0,
          life: 0.3, maxLife: 0.3, color: '#fee761', size: 1, twinkle: true,
        });
      }
    }
    return;
  }
  if (p.chargeT > 0) {
    const full = p.chargeT >= CHARGE_MIN;
    p.chargeT = 0;
    p.chargeRang = false;
    if (full && p.attackT <= 0 && p.dodgeT <= 0) startAttack(true);
  }
}

// Roll the way you're heading: the keyboard vector if there is one, else
// away along the facing.  Cancels any click-to-move goal.
function dodgeNow() {
  const p = G.player;
  let dx = 0, dy = 0;
  if (input.held.left) dx -= 1;
  if (input.held.right) dx += 1;
  if (input.held.up) dy -= 1;
  if (input.held.down) dy += 1;
  if (!dx && !dy) {
    const goal = G.ui.goal;
    if (goal && goal.path && goal.path.length) {
      const fc = feetCenter(p);
      dx = goal.path[0].x - fc.x; dy = goal.path[0].y - fc.y;
    } else {
      dx = p.dir === 'left' ? -1 : p.dir === 'right' ? 1 : 0;
      dy = p.dir === 'up' ? -1 : p.dir === 'down' ? 1 : 0;
    }
  }
  if (!dx && !dy) dy = 1;
  if (startDodge(Math.atan2(dy, dx))) G.ui.goal = null;
}

function monsterAtCursor(wx, wy) {
  for (const m of G.monsters) {
    if (wx >= m.x - 2 && wx <= m.x + m.size + 2 && wy >= m.y - 2 && wy <= m.y + m.size + 2) return m;
  }
  return null;
}

// --- mouse movement goals ----------------------------------------------

// Where a goal wants the player to end up, and how close counts as there.
function goalTarget(goal) {
  if (goal.type === 'point') return { x: goal.x, y: goal.y, reach: 4 };
  if (goal.type === 'monster') {
    const m = goal.ref;
    if (!G.monsters.includes(m)) return null;
    return { x: m.x + m.size / 2, y: m.y + m.size / 2, reach: 20 + m.size / 2 };
  }
  const r = goal.ref;
  if (goal.type === 'npc') return { x: r.x + 8, y: r.y + 12, reach: 22 };
  if (!G.map.props.includes(r)) return null;
  return { x: r.x * TILE + 8, y: r.y * TILE + 12, reach: 22 };
}

function repath(goal) {
  const t = goalTarget(goal);
  if (!t) return false;
  const fc = feetCenter(G.player);
  goal.path = routeTo(fc.x, fc.y, t.x, t.y);
  goal.repathT = goal.type === 'monster' ? 0.3 : 0.15;
  // Clicking a tree or a wall still walks you as close as the route gets,
  // so snap the goal (and its marker) to where we can actually stand.
  if (goal.path && goal.type === 'point') {
    const end = goal.path[goal.path.length - 1];
    goal.x = end.x; goal.y = end.y;
  }
  return !!goal.path;
}

function setGoal(goal) {
  goal.repathT = 0;
  goal.stuck = 0;
  G.ui.goal = repath(goal) ? goal : null;
}

// Advance past waypoints already reached and return the one to steer for.
function nextWaypoint(goal, fc) {
  const path = goal.path;
  if (!path) return null;
  while (path.length > 1 && Math.hypot(path[0].x - fc.x, path[0].y - fc.y) < 5) path.shift();
  if (path.length === 1 && Math.hypot(path[0].x - fc.x, path[0].y - fc.y) < 2) return null;
  return path[0] || null;
}

function arriveAtGoal(goal, t) {
  facePoint(t.x, t.y);
  if (goal.type === 'monster') {
    startAttack();          // keep swinging until it dies or we're redirected
    goal.path = null;
    return;
  }
  G.ui.goal = null;
  if (goal.type === 'npc') talkTo(goal.ref);
  else if (goal.type === 'prop') interactProp(goal.ref);
}

function updatePlay(dt) {
  const p = G.player;
  if (input.pressed.pause) { G.mode = 'pause'; G.ui.pause = { sel: 0 }; sfx('menu'); return; }
  if (input.pressed.inv) { openInventory(); return; }
  if (input.pressed.quest) { openQuests(); return; }
  if (input.pressed.skills) { openSkills(); return; }
  if (input.pressed.interact) { tryInteract(); if (G.mode !== 'play') return; }
  if (input.pressed.attack) startAttack();
  if (input.pressed.dodge) dodgeNow();
  updateCharge(dt);
  for (let i = 0; i < QUICK_SLOTS; i++) {
    if (input.pressed['q' + (i + 1)]) { pressKey('hud_quick' + i); useQuick(i); }
  }

  // --- mouse controls -------------------------------------------------
  // A click sets a movement goal the player walks to on their own, routed
  // around obstacles by A*: a ground point, a monster (approach and
  // attack), or an NPC/prop (approach and interact).
  const wx = G.cam.x + input.mouse.x, wy = G.cam.y + input.mouse.y;
  const fc = feetCenter(p);
  if (input.mouse.clicked) {
    if (hudButtonClick()) return;
    const npc = G.npcs.find(n => wx >= n.x - 2 && wx <= n.x + 18 && wy >= n.y - 2 && wy <= n.y + 18);
    const prop = !npc && G.map.props.find(pr =>
      wx >= pr.x * TILE - 2 && wx <= pr.x * TILE + 18 && wy >= pr.y * TILE - 2 && wy <= pr.y * TILE + 18);
    const mon = !npc && !prop && monsterAtCursor(wx, wy);
    if (npc) setGoal({ type: 'npc', ref: npc });
    else if (prop) setGoal({ type: 'prop', ref: prop });
    else if (mon) setGoal({ type: 'monster', ref: mon });
    else {
      setGoal({ type: 'point', x: wx, y: wy, follow: true });
      dust(wx, wy);   // little puff marks the walk target
    }
  }
  if (input.mouse.rclicked) {   // right-click: swing toward the cursor
    facePoint(wx, wy);
    startAttack();
  }
  const goal = G.ui.goal;
  if (goal && goal.follow) {
    if (input.mouse.held) {
      // dragging: retarget continuously, but only re-route a few times a
      // second so A* isn't run every frame
      goal.x = wx; goal.y = wy;
      goal.repathT -= dt;
      if (goal.repathT <= 0) repath(goal);
    } else {
      goal.follow = false;
    }
  }

  // movement: keyboard vector, or follow the mouse goal's route
  let mvx = 0, mvy = 0;
  if (input.held.left) mvx -= 1;
  if (input.held.right) mvx += 1;
  if (input.held.up) mvy -= 1;
  if (input.held.down) mvy += 1;
  if (!mvx && !mvy) { mvx = input.axis.x; mvy = input.axis.y; }
  if (mvx || mvy) {
    G.ui.goal = null;   // keyboard overrides the mouse goal
  } else if (goal) {
    const t = goalTarget(goal);
    if (!t) {
      G.ui.goal = null;
    } else if (Math.hypot(t.x - fc.x, t.y - fc.y) <= t.reach) {
      arriveAtGoal(goal, t);
      if (G.mode !== 'play') return;
    } else {
      // moving targets need periodic re-routing
      if (goal.type === 'monster') {
        goal.repathT -= dt;
        if (goal.repathT <= 0) repath(goal);
      }
      const wp = nextWaypoint(goal, fc);
      if (wp) {
        mvx = wp.x - fc.x;
        mvy = wp.y - fc.y;
      } else if (!repath(goal)) {
        G.ui.goal = null;   // nowhere to go
      }
    }
  }

  const wasX = p.x, wasY = p.y;
  if (!G.transition) updatePlayerMovement(dt, mvx, mvy);

  // if we somehow stop making progress, re-route once, then give up
  if (G.ui.goal && (mvx || mvy)) {
    if (Math.hypot(p.x - wasX, p.y - wasY) < 8 * dt) {
      G.ui.goal.stuck = (G.ui.goal.stuck || 0) + dt;
      if (G.ui.goal.stuck > 0.35) {
        G.ui.goal.stuck = 0;
        if (G.ui.goal.retried || !repath(G.ui.goal)) G.ui.goal = null;
        else G.ui.goal.retried = true;
      }
    } else {
      G.ui.goal.stuck = 0;
      G.ui.goal.retried = false;
    }
  }

  // player knockback
  if (p.kbx || p.kby) {
    moveEntity(p, p.kbx * dt, p.kby * dt);
    p.kbx *= Math.pow(0.001, dt); p.kby *= Math.pow(0.001, dt);
    if (Math.abs(p.kbx) < 4) p.kbx = 0;
    if (Math.abs(p.kby) < 4) p.kby = 0;
  }

  // footsteps: the ground under your boots decides how they sound
  if (p.moving && p.stepT <= 0) {
    p.stepT = 0.24;
    sfx(surfaceStep(p), 0.13);
    dust(p.x + 8, p.y + 15);
  }

  updateAggro(dt);
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

  G.stats.playtime += dt;
  G.saveTimer += dt;
  if (G.saveTimer > 10) { G.saveTimer = 0; saveGame(); }
}

function updateWorldAmbient(dt) {
  updateParticles(dt);
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 18);

  // woodsmoke drifting off the chimneys
  for (const pr of G.map.props) {
    if (pr.type !== 'chimney' || Math.random() > dt * 9) continue;
    const x = pr.x * TILE + 8, y = pr.y * TILE - 9;
    if (x < G.cam.x - 16 || x > G.cam.x + VW + 16 ||
        y < G.cam.y - 24 || y > G.cam.y + VH + 16) continue;
    G.particles.push({
      x: x + (Math.random() - 0.5) * 3, y,
      vx: 5 + Math.random() * 7, vy: -9 - Math.random() * 5, g: -2,
      life: 1.4 + Math.random() * 1.2, maxLife: 2.6,
      color: Math.random() < 0.5 ? '#c0cbdc' : '#8b9bb4', size: Math.random() < 0.4 ? 2 : 1,
    });
  }
  // embers lifting off every torch in view
  for (const pr of G.map.props) {
    if (pr.type !== 'torch' || Math.random() > dt * 3) continue;
    const x = pr.x * TILE + 8, y = pr.y * TILE + 6;
    if (x < G.cam.x - 16 || x > G.cam.x + VW + 16 ||
        y < G.cam.y - 16 || y > G.cam.y + VH + 16) continue;
    G.particles.push({
      x: x + (Math.random() - 0.5) * 3, y,
      vx: (Math.random() - 0.5) * 6, vy: -12 - Math.random() * 10, g: 4,
      life: 0.7 + Math.random() * 0.4, maxLife: 1.1,
      color: Math.random() < 0.4 ? '#fee761' : '#f77622', size: 1, twinkle: true,
    });
  }
  // dust drifting through the crypt
  if (G.mapName === 'dungeon' && Math.random() < dt * 8) {
    G.particles.push({
      x: G.cam.x + Math.random() * VW, y: G.cam.y + Math.random() * VH,
      vx: 3 + Math.random() * 5, vy: 4 + Math.random() * 4, g: 0,
      life: 1.6, maxLife: 1.6, color: '#8b9bb4', size: 1, twinkle: true,
    });
  }

  // water shimmer: occasional cyan glints on visible water
  if (Math.random() < dt * 4) {
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
  // Look a little the way you are heading, and in a fight sit between the
  // player and whatever is closest, so both stay comfortably on screen.
  let fx = p.x + 8, fy = p.y + 8;
  const lead = Math.min(VW, VH) * 0.10;
  if (p.moving || p.dodgeT > 0) {
    fx += (p.dir === 'left' ? -lead : p.dir === 'right' ? lead : 0);
    fy += (p.dir === 'up' ? -lead : p.dir === 'down' ? lead : 0);
  }
  const foe = G.ui.nearFoe;
  if (foe && G.monsters.includes(foe)) {
    const w = 0.28;
    fx += ((foe.x + foe.size / 2) - (p.x + 8)) * w;
    fy += ((foe.y + foe.size / 2) - (p.y + 8)) * w;
  }
  const tx = mw >= VW ? clamp(fx - VW / 2, 0, mw - VW) : -(VW - mw) / 2;
  const ty = mh >= VH ? clamp(fy - VH / 2, 0, mh - VH) : -(VH - mh) / 2;
  return [tx, ty];
}

// The ground under the player, for footstep flavour.
function surfaceStep(p) {
  const tx = Math.floor((p.x + 8) / TILE), ty = Math.floor((p.y + 13) / TILE);
  const row = G.map.grid[ty];
  const ch = row ? row[tx] : '.';
  if (ch === 'S' || ch === 'W' || ch === 'U' || ch === 'p') return 'step_stone';
  if (ch === 'F' || ch === 'D' || ch === 'V') return 'step_wood';
  if (ch === 'w') return 'step_water';
  return 'step_grass';
}

// Who is currently interested in you, and are we in a fight at all?
function updateAggro(dt) {
  const p = G.player;
  let best = null, bestD = 1e9;
  for (const m of G.monsters) {
    const d = Math.hypot(m.x + m.size / 2 - (p.x + 8), m.y + m.size / 2 - (p.y + 8));
    if (d < bestD) { bestD = d; best = m; }
  }
  const range = best && best.type === 'boss' ? 190 : 96;
  const engaged = !!best && bestD < range;
  G.ui.nearFoe = engaged ? best : null;
  // a short tail so the music does not flicker as things wander in and out
  G.ui.combatT = engaged ? 2.2 : Math.max(0, (G.ui.combatT || 0) - dt);
  setCombatMusic(G.ui.combatT > 0);
}

// --- draw ---------------------------------------------------------------

function draw() {
  if (drawFailed) return;                 // the message is already on screen
  const ctx = G.ctx;
  ctx.setTransform(G.zoom, 0, 0, G.zoom, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#181425';
  ctx.fillRect(0, 0, VW, VH);

  if (G.mode === 'title' || G.mode === 'slots') {
    drawTitle(ctx);
    if (G.mode === 'slots') drawSlots(ctx);
    drawTransition(ctx);
    return;
  }
  if (!G.map) return;

  ctx.save();
  if (G.shake > 0 && G.shakeOn !== false) {
    ctx.translate(
      Math.round((Math.random() - 0.5) * G.shake),
      Math.round((Math.random() - 0.5) * G.shake));
  }

  const camX = Math.round(G.cam.x), camY = Math.round(G.cam.y);
  drawWorld(ctx);
  drawParticles(ctx);
  drawLighting(ctx, camX, camY);
  drawFloats(ctx);
  ctx.restore();
  drawGrade(ctx);
  drawDanger(ctx);

  drawHud(ctx);

  switch (G.mode) {
    case 'dialogue': drawDialogue(ctx); break;
    case 'inventory': drawInventory(ctx); break;
    case 'quests': drawQuests(ctx); break;
    case 'skills': drawSkills(ctx); break;
    case 'settings': drawSettings(ctx); break;
    case 'summary': drawSummary(ctx); break;
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

  // Ground pass. Anything past the map edge repeats the nearest border
  // tile, so a map smaller than the screen fades into more forest or more
  // wall instead of a black void.
  const vx0 = Math.floor(cx / TILE), vx1 = Math.ceil((cx + VW) / TILE);
  const vy0 = Math.floor(cy / TILE), vy1 = Math.ceil((cy + VH) / TILE);
  for (let y = vy0; y <= vy1; y++) {
    for (let x = vx0; x <= vx1; x++) {
      const inside = x >= 0 && y >= 0 && x < map.w && y < map.h;
      const cell = inside ? map.render[y][x] : outsideCell(map, x, y);
      const dx = x * TILE - cx, dy = y * TILE - cy;
      drawAnim(ctx, cell.base, frameOf(cell.base, G.time), dx, dy);
      if (cell.decal) drawAnim(ctx, cell.decal, 0, dx, dy);
      if (!inside && cell.overlay) {
        drawShadow(ctx, dx + 9, dy + 15, 7, 3, 0.32);
        drawAnim(ctx, cell.overlay, 0, dx + cell.ox, dy + cell.oy);
      }
    }
  }

  // contact shadows go down before anything standing on the ground
  for (const pr of map.props) {
    const sx = pr.x * TILE + 8 - cx, sy = pr.y * TILE + 15 - cy;
    if (sx < -24 || sy < -24 || sx > VW + 24 || sy > VH + 24) continue;
    if (pr.type === 'torch' || pr.type === 'gate' || pr.type === 'chimney') continue;
    drawShadow(ctx, sx, sy, pr.type === 'sign' ? 4 : 6);
  }
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const cell = map.render[y][x];
    const ov = cell.overlay;
    if (!ov) continue;
    const sx = x * TILE + cell.ox - cx, sy = y * TILE + cell.oy - cy;
    if (ov.startsWith('tree')) drawShadow(ctx, sx + 9, sy + 15, 7, 3, 0.32);
    else if (ov === 'bush') drawShadow(ctx, sx + 8, sy + 13, 6, 2.5, 0.30);
    else if (ov === 'stone') drawShadow(ctx, sx + 8, sy + 14, 6, 2.5, 0.30);
  }
  // wind-up markers sit on the ground, under everything that stands on it
  for (const m of G.monsters) {
    if (m.atkPhase === 'none') continue;
    drawTelegraph(ctx, m, cx, cy);
  }

  for (const n of G.npcs) drawShadow(ctx, n.x + 8 - cx, n.y + 15 - cy, 5);
  for (const m of G.monsters) {
    if (m.x < cx - 48 || m.x > cx + VW + 48 || m.y < cy - 64 || m.y > cy + VH + 48) continue;
    if (m.type === 'bat') { drawShadow(ctx, m.x + 8 - cx, m.y + 20 - cy, 4, 1.6, 0.20); continue; }
    drawShadow(ctx, m.x + m.size / 2 - cx, m.y + m.size - 2 - cy, m.size * 0.32);
  }
  drawShadow(ctx, G.player.x + 8 - cx, G.player.y + 15 - cy, 5);

  // depth-sorted drawables: tile overlays (trees etc), props, entities
  const drawables = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const cell = map.render[y][x];
    if (!cell.overlay) continue;
    const sx = x * TILE + cell.ox - cx, sy = y * TILE + cell.oy - cy;
    drawables.push({ y: y * TILE + cell.oy + 15, f: () => drawAnim(ctx, cell.overlay, 0, sx, sy) });
  }
  for (const pr of map.props) {
    const px = pr.x * TILE, py = pr.y * TILE;
    if (px < cx - 16 || px > cx + VW || py < cy - 16 || py > cy + VH) continue;
    let name = null, fi = 0;
    if (pr.type === 'chest') { name = G.flags['chest_' + pr.id] ? 'chest_open' : 'chest_closed'; }
    else if (pr.type === 'sign') name = 'sign';
    else if (pr.type === 'torch') { name = 'torch'; fi = frameOf('torch', G.time + pr.x * 0.13); }
    else if (pr.type === 'barrel') name = 'barrel';
    else if (pr.type === 'gate') name = 'gate_bars';
    else if (pr.type === 'chimney') {
      // drawn proud of its tile so the stack rises past the ridge
      drawAnim(ctx, 'chimney', 0, px - cx, py - 11 - cy);
      continue;
    }
    else if (pr.type === 'crack') name = 'cracked_wall';
    else if (pr.type === 'note') name = 'note';
    else if (pr.type === 'spikes') {
      // flush with the floor, so it draws with the ground, not the crowd
      drawAnim(ctx, 'spikes', pr.stage || 0, px - cx, py - cy);
      continue;
    }
    const jig = pr.shakeT > 0 ? Math.round(Math.sin(G.time * 60) * 2) : 0;
    if (name) drawables.push({ y: py + 14, f: () => drawAnim(ctx, name, fi, px - cx + jig, py - cy) });
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
        drawActor(ctx, n.sprite, fi, n.x - cx, n.y - cy);
        drawQuestMarker(ctx, n, cx, cy);
      },
    });
  }
  for (const m of G.monsters) {
    // anything well off screen costs nothing to skip
    if (m.x < cx - 48 || m.x > cx + VW + 48 || m.y < cy - 64 || m.y > cy + VH + 48) continue;
    drawables.push({ y: m.y + m.size - 1, f: () => drawMonster(ctx, m, cx, cy) });
  }
  drawables.push({ y: G.player.y + 15, f: () => drawPlayer(ctx, cx, cy) });

  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) d.f();

  if (G.mode === 'play' || G.mode === 'dialogue') drawCompass(ctx, cx, cy);

  // click-to-move destination marker
  const goal = G.ui.goal;
  if (goal && goal.type === 'point') {
    const r = 3 + Math.sin(G.time * 8) * 1.2;
    ctx.strokeStyle = '#fee761';
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(Math.round(goal.x - cx) + 0.5, Math.round(goal.y - cy) + 0.5, r, 0, 7);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // projectiles on top
  for (const pr of G.projectiles) {
    if (pr.ally) {
      const px = Math.round(pr.x - cx), py = Math.round(pr.y - cy);
      if (pr.kind === 'bomb') {
        ctx.fillStyle = '#262b44';
        ctx.beginPath(); ctx.arc(px, py, 3, 0, 7); ctx.fill();
        ctx.fillStyle = Math.floor(G.time * 20) % 2 ? '#fee761' : '#f77622';
        ctx.fillRect(px + 1, py - 5, 1, 1);
      } else {
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(pr.spin);
        ctx.fillStyle = '#c0cbdc';
        ctx.fillRect(-3, -1, 6, 1);
        ctx.fillStyle = '#feae34';
        ctx.fillRect(-3, 0, 2, 1);
        ctx.restore();
      }
      continue;
    }
    ctx.fillStyle = pr.boss ? '#b55088' : '#c0cbdc';
    ctx.fillRect(Math.round(pr.x - 1 - cx), Math.round(pr.y - 1 - cy), 3, 3);
    ctx.fillStyle = pr.boss ? '#68386c' : '#5a6988';
    ctx.fillRect(Math.round(pr.x - cx), Math.round(pr.y - cy), 1, 1);
  }
}

import { QUESTS, canTurnIn } from './quests.js';
function questMarker(n) {
  for (const [id, q] of Object.entries(QUESTS)) {
    if (canTurnIn(id) && q.giver === n.name) return 'mark_done';
  }
  if (n.id === 'elder' && (!G.quests.q_slimes || (G.quests.q_slimes?.state === 'done' && !G.quests.q_letter))) return 'mark_new';
  if (n.id === 'lila' && !G.quests.q_bats) return 'mark_new';
  if (n.id === 'pip' && !G.quests.q_gels) return 'mark_new';
  return null;
}

// Sits above the head, wherever the head happens to be - the sprite's own
// height decides that, so it stays put if a character is ever redrawn at a
// different size.
function drawQuestMarker(ctx, n, cx, cy) {
  const mark = questMarker(n);
  if (!mark) return;
  const a = anim(n.sprite);
  const top = n.y + (16 - a.h);                       // top of the sprite
  const bob = Math.round(Math.sin(G.time * 3 + n.homeX * 0.1) * 1.5);
  const mx = Math.round(n.x + 8 - cx) - 8;
  const my = Math.round(top - 17 - cy) + bob;
  ctx.save();                                         // a little glow behind
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.16 + 0.06 * Math.sin(G.time * 4);
  ctx.fillStyle = '#feae34';
  ctx.beginPath();
  ctx.ellipse(mx + 8, my + 8, 7, 8, 0, 0, 7);
  ctx.fill();
  ctx.restore();
  drawAnim(ctx, mark, 0, mx, my);
}

// A wind-up paints the ground it is about to cover: an outline that fills
// from the middle out, going gold on the last beat before the strike.
// Roll out of it, or eat it.
function drawTelegraph(ctx, m, cx, cy) {
  const A = attackProfile(m);
  if (!A || (m.atkPhase !== 'wind' && m.atkPhase !== 'strike')) return;
  const b = monsterAttackBox(m);
  const ex = Math.round(b.x + b.w / 2 - cx), ey = Math.round(b.y + b.h / 2 - cy + 3);
  const rx = b.w / 2 + 2, ry = b.h / 2 * 0.62 + 1;
  ctx.save();
  if (m.atkPhase === 'wind') {
    const k = Math.max(0, Math.min(1, 1 - m.atkT / A.wind));
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#e43b44';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(ex + 0.5, ey + 0.5, rx, ry, 0, 0, 7); ctx.stroke();
    ctx.globalAlpha = 0.22 + 0.34 * k;
    ctx.fillStyle = k > 0.82 ? '#fee761' : '#e43b44';
    ctx.beginPath(); ctx.ellipse(ex, ey, rx * k, ry * k, 0, 0, 7); ctx.fill();
  } else {
    const k = Math.max(0, m.atkT / A.strike);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.55 * k;
    ctx.fillStyle = '#ffe9b0';
    ctx.beginPath(); ctx.ellipse(ex, ey, rx * (1.1 + 0.3 * (1 - k)), ry * 1.1, 0, 0, 7); ctx.fill();
  }
  ctx.restore();
}

function drawPlayer(ctx, cx, cy) {
  const p = G.player;
  if (p.chargeT >= CHARGE_MIN * 0.55 && p.attackT <= 0) {
    const k = Math.min(1, (p.chargeT - CHARGE_MIN * 0.55) / (CHARGE_FULL - CHARGE_MIN * 0.55));
    const full = p.chargeT >= CHARGE_MIN;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.2 + 0.35 * k;
    ctx.strokeStyle = full ? '#fee761' : '#feae34';
    ctx.lineWidth = 1;
    const r = 13 - 4 * k + (full ? Math.sin(G.time * 18) * 0.8 : 0);
    ctx.beginPath();
    ctx.arc(Math.round(p.x - cx) + 8, Math.round(p.y - cy) + 9, r, 0, 7);
    ctx.stroke();
    ctx.restore();
  }
  // the roll: quarter-turn tumble, so the pixels stay exact
  if (p.dodgeT > 0) {
    const k = 1 - p.dodgeT / DODGE.time;
    // spin about the sprite's own centre, whatever size it is
    const a = anim('player_walk_' + p.dir);
    ctx.save();
    ctx.translate(Math.round(p.x - cx) + 8, Math.round(p.y - cy) + 16 - a.h / 2);
    ctx.rotate(Math.floor(k * 5) % 4 * Math.PI / 2);
    ctx.translate(-a.w / 2, -a.h / 2);
    drawAnim(ctx, 'player_walk_' + p.dir, 1, 0, 0);
    ctx.restore();
    return;
  }
  if (p.iframes > 0 && Math.floor(G.time * 14) % 2 && G.mode === 'play') {
    drawActorFlash(ctx, 'player_hurt', 0, p.x - cx, p.y - cy, '#ffffff');
    return;
  }
  let name, fi = 0;
  if (p.attackT > 0) {
    name = 'player_attack_' + p.attackDir;
    fi = p.attackT > 0.18 ? 0 : 1;    // wind-up, then the strike
  } else {
    name = 'player_walk_' + p.dir;
    fi = p.moving ? Math.floor(p.animT * 9) % 4 : 0;
  }
  drawActor(ctx, name, fi, p.x - cx, p.y - cy);
}

function drawMonster(ctx, m, cx, cy) {
  // elites wear their colour on the ground, so you can read the room
  if (m.elite) {
    const ex = Math.round(m.x + m.size / 2 - cx);
    const ey = Math.round(m.y + m.size - 2 - cy);
    const r = m.size * 0.45 + Math.sin(G.time * 3 + m.homeX) * 0.8;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.30;
    ctx.strokeStyle = m.eliteColor;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(ex, ey, r, r * 0.45, 0, 0, 7); ctx.stroke();
    ctx.globalAlpha = 0.13;
    ctx.fillStyle = m.eliteColor;
    ctx.beginPath(); ctx.ellipse(ex, ey, r, r * 0.45, 0, 0, 7); ctx.fill();
    ctx.restore();
  }
  let name = m.anim;
  if (m.type === 'boss' && (m.telegraphT > 0 || m.lungeT > 0 || m.atkPhase !== 'none')) name = 'boss_attack';
  const fi = frameOf(name, G.time + m.homeX * 0.07);
  // wind-up rears back, the strike lunges through
  let ox = 0, oy = 0;
  if (m.atkPhase === 'wind') {
    const k = 1 - m.atkT / (attackProfile(m).wind || 1);
    ox = -Math.cos(m.atkAng) * 2 * k;
    oy = -Math.sin(m.atkAng) * 2 * k;
  } else if (m.atkPhase === 'strike') {
    ox = Math.cos(m.atkAng) * 2;
    oy = Math.sin(m.atkAng) * 2;
  } else if (m.staggerT > 0) {
    ox = Math.sin(G.time * 34) * 1.5;      // reeling
    oy = -1;
  }
  const dx = m.x + ox - cx, dy = m.y + oy - cy;
  if (m.hurtT > 0 && Math.floor(G.time * 20) % 2) {
    drawActorFlash(ctx, name, fi, dx, dy, '#ffffff', m.flip);
  } else if (m.staggerT > 0 && Math.floor(G.time * 16) % 2) {
    drawActorFlash(ctx, name, fi, dx, dy, '#fee761', m.flip);
  } else if ((m.telegraphT > 0 || m.atkPhase === 'wind') && Math.floor(G.time * 12) % 2) {
    drawActorFlash(ctx, name, fi, dx, dy, '#ff0044', m.flip);
  } else {
    drawActor(ctx, name, fi, dx, dy, m.flip);
  }
  if (m.staggerT > 0) {                     // stars over a broken guard
    for (let i = 0; i < 3; i++) {
      const a = G.time * 5 + i * 2.1;
      ctx.fillStyle = '#fee761';
      ctx.fillRect(Math.round(dx + m.size / 2 + Math.cos(a) * 5),
                   Math.round(dy - 3 + Math.sin(a) * 2), 1, 1);
    }
  }
  // Ordinary enemies show a bar once you have hurt them, and it fades if
  // you leave them alone.
  if (m.type !== 'boss' && m.hp < m.maxHp) {
    m.barT = 2.2;
  } else if (m.barT > 0) {
    m.barT -= 1 / 60;
  }
  if (m.type !== 'boss' && (m.barT > 0 || m.elite)) {
    const w = Math.max(10, Math.round(m.size * 0.8));
    const bx = Math.round(m.x + (m.size - w) / 2 - cx), by = Math.round(m.y - 4 - cy);
    ctx.globalAlpha = m.elite ? 1 : Math.min(1, m.barT * 2);
    ctx.fillStyle = '#12142a';
    ctx.fillRect(bx - 1, by - 1, w + 2, 4);
    ctx.fillStyle = m.elite ? m.eliteColor : '#e43b44';
    ctx.fillRect(bx, by, Math.round(w * Math.max(0, m.hp / m.maxHp)), 2);
    if (m.poiseMax) {                        // guard, under the health
      ctx.fillStyle = m.staggerT > 0 ? '#fee761' : '#5a6988';
      ctx.fillRect(bx, by + 2, Math.round(w * Math.max(0, m.poise / m.poiseMax)), 1);
    }
    ctx.globalAlpha = 1;
  }
  // boss hp bar, with the phase thresholds marked on it
  if (m.type === 'boss') {
    const bx = Math.round(m.x - 4 - cx), by = Math.round(m.y - 6 - cy);
    ctx.fillStyle = '#181425';
    ctx.fillRect(bx, by, 40, 4);
    ctx.fillStyle = m.phaseT > 0 ? '#fee761' : '#e43b44';
    ctx.fillRect(bx + 1, by + 1, Math.round(38 * m.hp / m.maxHp), 2);
    ctx.fillStyle = '#181425';
    ctx.fillRect(bx + 1 + Math.round(38 * 0.33), by + 1, 1, 2);
    ctx.fillRect(bx + 1 + Math.round(38 * 0.66), by + 1, 1, 2);
    if (m.phaseT > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5 * m.phaseT;
      ctx.strokeStyle = '#b55088';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(Math.round(m.x + m.size / 2 - cx), Math.round(m.y + m.size / 2 - cy),
              10 + (1.1 - m.phaseT) * 46, 0, 7);
      ctx.stroke();
      ctx.restore();
    }
  }
  // elite name floats above once you are close enough to care
  if (m.elite && Math.hypot(m.x - G.player.x, m.y - G.player.y) < 70) {
    drawText(ctx, m.eliteName, Math.round(m.x + m.size / 2 - cx) -
             m.eliteName.length * 2, Math.round(m.y - 6 - cy), m.eliteColor);
  }
}

window.EMBER = {  // debug/testing handle
  G, changeMap, dialogueState, spawnMonster, startDodge, hitMonster,
  addItem, countItem, useQuick, useConsumable, poisonPlayer, SHOPS,
  skills, gainXp, playerStats, startAttack, moveset, attackBox,
  isSolidAt, routeTo, isBlockedAt: feetBlockedAt, questAim, settings, openSummary,
  isNight, dayPhase,
};
boot().catch(fatal);
addEventListener('unhandledrejection', (e) => fatal(e.reason));
