// Inventory state + grid UI (keyboard and mouse).

import { G, VW, VH } from './state.js';
import { ITEMS } from './items.js';
import { input } from './input.js';
import { sfx } from './audio.js';
import { addFloat, sparkle } from './particles.js';
import { drawPanel, drawText, drawTextC, drawHeading } from './ui.js';
import { drawAnim } from './assets.js';
import { playerThrow } from './combat.js';

export const COLS = 6, ROWS = 4;
export const QUICK_SLOTS = 3;
export const USE_CD = 0.7;

const CONSUMABLE = { potion: 1, throw: 1, cure: 1, buff: 1 };
export function isConsumable(id) { return !!CONSUMABLE[ITEMS[id]?.type]; }

export function quickSlots() {
  const p = G.player;
  if (!p.quick) p.quick = new Array(QUICK_SLOTS).fill(null);
  return p.quick;
}

// A new kind of consumable claims the first free slot, so the bar fills
// itself as you find things and never needs opening a menu to be useful.
function autoAssign(id) {
  if (!isConsumable(id)) return;
  const q = quickSlots();
  if (q.includes(id)) return;
  const free = q.indexOf(null);
  if (free >= 0) q[free] = id;
}

export function assignQuick(i, id) {
  const q = quickSlots();
  const was = q.indexOf(id);
  if (was >= 0) q[was] = q[i];      // swap rather than duplicate
  q[i] = id;
  sfx('menu');
}

export function addItem(id, n = 1) {
  const inv = G.player.inv;
  const def = ITEMS[id];
  autoAssign(id);
  if (def.stack) {
    const slot = inv.find(s => s && s.id === id);
    if (slot) { slot.n += n; return true; }
  }
  for (let i = 0; i < n; i++) {
    if (inv.length >= COLS * ROWS) return false;
    inv.push({ id, n: 1 });
  }
  return true;
}

export function countItem(id) {
  return G.player.inv.reduce((a, s) => a + (s && s.id === id ? s.n : 0), 0);
}

export function removeItem(id, n = 1) {
  const inv = G.player.inv;
  for (let i = inv.length - 1; i >= 0 && n > 0; i--) {
    if (inv[i].id !== id) continue;
    const take = Math.min(n, inv[i].n);
    inv[i].n -= take; n -= take;
    if (inv[i].n <= 0) {
      inv.splice(i, 1);
      if (G.player.weapon === id && !inv.find(s => s.id === id)) G.player.weapon = null;
      if (G.player.armor === id && !inv.find(s => s.id === id)) G.player.armor = null;
    }
  }
}

export function hasItem(id) { return countItem(id) > 0; }

export function openInventory() {
  G.mode = 'inventory';
  G.ui.inv = { sel: 0, t: 0 };
  sfx('menu');
}

// One path for every consumable, whether it is used from the grid or from
// a quick slot.  They share one short cooldown so a fight cannot be won by
// mashing the whole bag at once.
export function useConsumable(id) {
  const p = G.player;
  const def = ITEMS[id];
  if (!def || !countItem(id)) { sfx('deny'); return false; }
  if (p.useCd > 0) { sfx('deny'); return false; }
  switch (def.type) {
    case 'potion':
      if (p.hp >= p.maxHp) { sfx('deny'); return false; }
      p.hp = Math.min(p.maxHp, p.hp + def.heal);
      sfx('heal');
      addFloat('+HP', p.x + 8, p.y - 4, '#63c74d');
      sparkle(p.x + 8, p.y + 6, 8, '#63c74d');
      break;
    case 'cure':
      if (!p.poison && p.poisonWard > 0) { sfx('deny'); return false; }
      p.poison = 0;
      p.poisonWard = 20;
      sfx('heal');
      addFloat('CURED', p.x + 8, p.y - 4, '#63c74d');
      break;
    case 'buff':
      p.hasteT = 8;
      sfx('upgrade');
      addFloat('SWIFT', p.x + 8, p.y - 4, '#2ce8f5');
      sparkle(p.x + 8, p.y + 6, 10, '#2ce8f5');
      break;
    case 'throw': {
      const a = p.dir === 'left' ? Math.PI : p.dir === 'right' ? 0
              : p.dir === 'up' ? -Math.PI / 2 : Math.PI / 2;
      playerThrow(id, a, def.dmg);
      sfx('swing');
      break;
    }
    default:
      sfx('deny');
      return false;
  }
  removeItem(id, 1);
  p.useCd = USE_CD;
  return true;
}

export function useQuick(i) {
  const id = quickSlots()[i];
  if (!id) { sfx('deny'); return false; }
  return useConsumable(id);
}

function useSelected() {
  const st = G.ui.inv;
  const slot = G.player.inv[st.sel];
  if (!slot) return;
  const def = ITEMS[slot.id];
  const p = G.player;
  if (def.type === 'weapon') {
    p.weapon = p.weapon === slot.id ? null : slot.id;
    sfx('menu');
  } else if (def.type === 'armor') {
    p.armor = p.armor === slot.id ? null : slot.id;
    sfx('menu');
  } else if (isConsumable(slot.id)) {
    useConsumable(slot.id);
  } else {
    sfx('deny');
  }
}

function dropSelected() {
  const st = G.ui.inv;
  const slot = G.player.inv[st.sel];
  if (!slot) return;
  const def = ITEMS[slot.id];
  if (def.type === 'quest') { sfx('deny'); return; }
  if (G.player.weapon === slot.id && countItem(slot.id) === 1) G.player.weapon = null;
  if (G.player.armor === slot.id && countItem(slot.id) === 1) G.player.armor = null;
  slot.n--;
  if (slot.n <= 0) G.player.inv.splice(st.sel, 1);
  const p = G.player;
  G.pickups.push({
    kind: 'item', item: slot.id, x: p.x + 8, y: p.y + 14,
    vx: (Math.random() - 0.5) * 50, vy: 25, t: -0.6,
  });
  sfx('menu');
}

export function updateInventory(dt) {
  const st = G.ui.inv;
  st.t = Math.min(1, st.t + dt * 6);
  if (input.pressed.inv || input.pressed.pause) { G.mode = 'play'; sfx('menu'); return; }
  if (input.pressed.left) { st.sel = (st.sel + COLS * ROWS - 1) % (COLS * ROWS); sfx('menu'); }
  if (input.pressed.right) { st.sel = (st.sel + 1) % (COLS * ROWS); sfx('menu'); }
  if (input.pressed.up) { st.sel = (st.sel + COLS * ROWS - COLS) % (COLS * ROWS); sfx('menu'); }
  if (input.pressed.down) { st.sel = (st.sel + COLS) % (COLS * ROWS); sfx('menu'); }
  if (input.pressed.interact) useSelected();
  if (input.pressed.attack) dropSelected();
  // 1-3 bind the selected consumable to a quick slot
  for (let i = 0; i < QUICK_SLOTS; i++) {
    if (!input.pressed['q' + (i + 1)]) continue;
    const slot = G.player.inv[st.sel];
    if (slot && isConsumable(slot.id)) assignQuick(i, slot.id);
    else sfx('deny');
  }
  // mouse: hover/click cells; click outside the panels closes
  const { mx, my, totalW, totalH, cells } = layout();
  let onCell = false;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (input.mouse.x >= c.x && input.mouse.x < c.x + 20 &&
        input.mouse.y >= c.y && input.mouse.y < c.y + 20) {
      st.sel = i;
      onCell = true;
      if (input.mouse.clicked) useSelected();
    }
  }
  if (input.mouse.clicked && !onCell &&
      (input.mouse.x < mx || input.mouse.x > mx + totalW ||
       input.mouse.y < my || input.mouse.y > my + totalH)) {
    G.mode = 'play'; sfx('menu');
  }
}

function layout() {
  const w = 168, h = 150;
  const dw = 128, gap = 4;
  // side by side when there is room, otherwise the detail panel stacks
  const stacked = VW < w + gap + dw + 12;
  const dh = stacked ? 74 : h;
  const totalW = stacked ? w : w + gap + dw;
  const totalH = stacked ? h + gap + dh : h;
  const mx = Math.round((VW - totalW) / 2);
  const my = Math.round((VH - totalH - 14) / 2);
  const dx = stacked ? mx : mx + w + gap;
  const dy = stacked ? my + h + gap : my;
  const cells = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    cells.push({ x: mx + 10 + c * 24, y: my + 30 + r * 24 });
  }
  return { mx, my, w, h, dx, dy, dw, dh, totalW, totalH, cells };
}

export function drawInventory(ctx) {
  const st = G.ui.inv;
  const { mx, my, w, h, dx, dy, dw, dh, totalH, cells } = layout();
  const slide = Math.round((1 - st.t) * -30);
  ctx.save();
  ctx.translate(0, slide);
  ctx.globalAlpha = st.t;
  drawPanel(ctx, mx, my, w, h);
  drawHeading(ctx, 'Inventory', mx + 10, my + 14);
  drawText(ctx, 'gold ' + G.player.gold, mx + 100, my + 12, '#fee761');
  const p = G.player;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    ctx.fillStyle = i === st.sel ? '#5a6988' : '#181425';
    ctx.fillRect(c.x, c.y, 20, 20);
    if (i === st.sel) {
      ctx.strokeStyle = '#feae34'; ctx.lineWidth = 1;
      ctx.strokeRect(c.x + 0.5, c.y + 0.5, 19, 19);
    }
    const slot = p.inv[i];
    if (slot) {
      drawAnim(ctx, ITEMS[slot.id].icon, 0, c.x + 2, c.y + 2);
      if (slot.n > 1) drawText(ctx, '' + slot.n, c.x + 12, c.y + 18, '#ffffff');
      if (p.weapon === slot.id || p.armor === slot.id) {
        drawText(ctx, 'E', c.x + 1, c.y + 7, '#63c74d');
      }
    }
  }
  // detail panel
  drawPanel(ctx, dx, dy, dw, dh);
  const slot = p.inv[st.sel];
  const stats = statsLine();
  if (slot) {
    const def = ITEMS[slot.id];
    drawText(ctx, def.name, dx + 8, dy + 14, '#ffffff');
    drawWrapped(ctx, def.desc || '', dx + 8, dy + 26, dw - 16, '#c0cbdc');
    const hint = def.type === 'weapon' || def.type === 'armor'
      ? (p.weapon === slot.id || p.armor === slot.id ? 'E/click: unequip' : 'E/click: equip')
      : isConsumable(slot.id) ? 'E/click: use' : '';
    if (hint) drawText(ctx, hint, dx + 8, dy + dh - 32, '#8b9bb4');
    if (isConsumable(slot.id)) {
      const at = quickSlots().indexOf(slot.id);
      drawText(ctx, at >= 0 ? '1-3: rebind (now ' + (at + 1) + ')' : '1-3: quick slot',
               dx + 8, dy + dh - 22, at >= 0 ? '#fee761' : '#8b9bb4');
    }
    if (def.type !== 'quest') drawText(ctx, 'Space: drop', dx + 8, dy + dh - 12, '#8b9bb4');
  } else {
    drawText(ctx, 'empty', dx + 8, dy + 14, '#5a6988');
  }
  drawText(ctx, 'LV ' + p.level + '  ATK ' + stats.atk + '  DEF ' + stats.def, mx + 10, my + h - 8, '#feae34');
  drawText(ctx, 'HP ' + p.hp + '/' + p.maxHp, mx + 108, my + h - 8, '#f6757a');
  drawTextC(ctx, 'I / Esc: close', VW / 2, my + totalH + 10, '#8b9bb4');
  ctx.restore();
  ctx.globalAlpha = 1;
}

import { playerStats } from './entities.js';
function statsLine() { return playerStats(); }

export function drawWrapped(ctx, text, x, y, w, color) {
  ctx.font = '7px monospace';
  const words = text.split(' ');
  let line = '', yy = y;
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > w && line) {
      drawText(ctx, line, x, yy, color);
      line = word; yy += 10;
    } else line = test;
  }
  if (line) drawText(ctx, line, x, yy, color);
  return yy;
}
