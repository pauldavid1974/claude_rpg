// Inventory state + grid UI (keyboard and mouse).

import { G } from './state.js';
import { ITEMS } from './items.js';
import { input } from './input.js';
import { sfx } from './audio.js';
import { addFloat } from './particles.js';
import { drawPanel, drawText, drawTextC } from './ui.js';
import { drawAnim } from './assets.js';

export const COLS = 6, ROWS = 4;

export function addItem(id, n = 1) {
  const inv = G.player.inv;
  const def = ITEMS[id];
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
  } else if (def.type === 'potion') {
    if (p.hp >= p.maxHp) { sfx('deny'); return; }
    p.hp = Math.min(p.maxHp, p.hp + def.heal);
    removeItem(slot.id, 1);
    sfx('heal');
    addFloat('+HP', p.x + 8, p.y - 4, '#63c74d');
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
  // mouse
  const { mx, my, cells } = layout();
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (input.mouse.x >= c.x && input.mouse.x < c.x + 20 &&
        input.mouse.y >= c.y && input.mouse.y < c.y + 20) {
      st.sel = i;
      if (input.mouse.clicked) useSelected();
    }
  }
}

function layout() {
  const w = 168, h = 150;
  const mx = 12, my = 15;
  const cells = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    cells.push({ x: mx + 10 + c * 24, y: my + 30 + r * 24 });
  }
  return { mx, my, w, h, cells };
}

export function drawInventory(ctx) {
  const st = G.ui.inv;
  const { mx, my, w, h, cells } = layout();
  const slide = Math.round((1 - st.t) * -30);
  ctx.save();
  ctx.translate(0, slide);
  ctx.globalAlpha = st.t;
  drawPanel(ctx, mx, my, w, h);
  drawText(ctx, 'INVENTORY', mx + 10, my + 12, '#feae34');
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
  const dx = mx + w + 4, dw = 128;
  drawPanel(ctx, dx, my, dw, h);
  const slot = p.inv[st.sel];
  const stats = statsLine();
  if (slot) {
    const def = ITEMS[slot.id];
    drawText(ctx, def.name, dx + 8, my + 14, '#ffffff');
    drawWrapped(ctx, def.desc || '', dx + 8, my + 26, dw - 16, '#c0cbdc');
    const hint = def.type === 'weapon' || def.type === 'armor'
      ? (p.weapon === slot.id || p.armor === slot.id ? 'E/click: unequip' : 'E/click: equip')
      : def.type === 'potion' ? 'E/click: drink' : '';
    if (hint) drawText(ctx, hint, dx + 8, my + 62, '#8b9bb4');
    if (def.type !== 'quest') drawText(ctx, 'Space: drop', dx + 8, my + 72, '#8b9bb4');
  } else {
    drawText(ctx, 'empty', dx + 8, my + 14, '#5a6988');
  }
  drawText(ctx, 'LV ' + p.level + '  ATK ' + stats.atk + '  DEF ' + stats.def, dx + 8, my + h - 30, '#feae34');
  drawText(ctx, 'HP ' + p.hp + '/' + p.maxHp, dx + 8, my + h - 18, '#f6757a');
  drawTextC(ctx, 'I / Esc: close', 160, my + h + 10, '#8b9bb4');
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
