// Shop data and buy/sell UI.

import { G, VW, VH } from './state.js';
import { input } from './input.js';
import { sfx } from './audio.js';
import { ITEMS, sellPrice } from './items.js';
import { addItem, removeItem } from './inventory.js';
import { drawPanel, drawText, drawTextC } from './ui.js';
import { drawAnim } from './assets.js';

export const SHOPS = {
  general: {
    name: 'General Store',
    stock: ['potion', 'potion_big', 'leather'],
  },
  blacksmith: {
    name: "Edda's Smithy",
    stock: ['dagger', 'sword', 'greatsword', 'chain', 'plate'],
  },
};

export function openShop(id) {
  G.mode = 'shop';
  G.ui.shop = { id, tab: 'buy', sel: 0, t: 0, flash: 0 };
  sfx('menu');
}

function sellables() {
  return G.player.inv.filter(s => {
    const def = ITEMS[s.id];
    if (!def.price || def.type === 'quest') return false;
    return true;
  });
}

export function updateShop(dt) {
  const st = G.ui.shop;
  st.t = Math.min(1, st.t + dt * 6);
  if (st.flash > 0) st.flash -= dt;
  if (input.pressed.pause || input.pressed.inv) { G.mode = 'play'; sfx('menu'); return; }
  const list = st.tab === 'buy' ? SHOPS[st.id].stock : sellables();
  if (input.pressed.left || input.pressed.right) {
    st.tab = st.tab === 'buy' ? 'sell' : 'buy';
    st.sel = 0; sfx('menu');
  }
  if (input.pressed.up) { st.sel = Math.max(0, st.sel - 1); sfx('menu'); }
  if (input.pressed.down) { st.sel = Math.min(Math.max(0, list.length - 1), st.sel + 1); sfx('menu'); }
  if (input.pressed.interact || input.pressed.attack) {
    if (st.tab === 'buy') buy(list[st.sel]);
    else sell(list[st.sel]);
  }
  // mouse: rows + tab headers; click outside the panel leaves the shop
  const { x, y, w, rows, tabs } = layout(list);
  let onUi = false;
  for (const [i, r] of rows.entries()) {
    if (input.mouse.x >= r.x && input.mouse.x < r.x + r.w &&
        input.mouse.y >= r.y - 8 && input.mouse.y < r.y + 6) {
      st.sel = i;
      onUi = true;
      if (input.mouse.clicked) (st.tab === 'buy' ? buy(list[i]) : sell(list[i]));
    }
  }
  for (const t of tabs) {
    if (input.mouse.clicked && input.mouse.x >= t.x && input.mouse.x < t.x + 40 &&
        input.mouse.y >= t.y - 8 && input.mouse.y < t.y + 4) {
      st.tab = t.id; st.sel = 0; onUi = true; sfx('menu');
    }
  }
  if (input.mouse.clicked && !onUi &&
      (input.mouse.x < x || input.mouse.x > x + w ||
       input.mouse.y < y || input.mouse.y > y + 152)) {
    G.mode = 'play'; sfx('menu');
  }
}

function buy(id) {
  if (!id) return;
  const st = G.ui.shop;
  const def = ITEMS[id];
  if (G.player.gold < def.price) {
    sfx('deny');
    st.flash = 0.5;
    return;
  }
  if (!addItem(id, 1)) { sfx('deny'); st.flash = 0.5; st.flashMsg = 'Bag is full!'; return; }
  G.player.gold -= def.price;
  st.flashMsg = null;
  sfx('buy');
}

function sell(slot) {
  if (!slot) return;
  const st = G.ui.shop;
  const p = G.player;
  if ((p.weapon === slot.id || p.armor === slot.id) && slot.n === 1) {
    if (p.weapon === slot.id) p.weapon = null;
    if (p.armor === slot.id) p.armor = null;
  }
  p.gold += sellPrice(slot.id);
  removeItem(slot.id, 1);
  if (st.sel >= sellables().length) st.sel = Math.max(0, sellables().length - 1);
  sfx('buy');
}

function layout(list) {
  const w = 200;
  const x = Math.round((VW - w) / 2), y = Math.round((VH - 168) / 2);
  const rows = list.map((_, i) => ({ x: x + 10, y: y + 44 + i * 14, w: w - 20 }));
  const tabs = [{ id: 'buy', x: x + 12, y: y + 28 }, { id: 'sell', x: x + 58, y: y + 28 }];
  return { x, y, w, rows, tabs };
}

export function drawShop(ctx) {
  const st = G.ui.shop;
  const shop = SHOPS[st.id];
  const list = st.tab === 'buy' ? shop.stock : sellables();
  const { x, y, w, rows, tabs } = layout(list);
  const h = 152;
  ctx.save();
  ctx.translate(0, Math.round((1 - st.t) * -30));
  ctx.globalAlpha = st.t;
  drawPanel(ctx, x, y, w, h);
  drawText(ctx, shop.name.toUpperCase(), x + 10, y + 13, '#feae34');
  const goldCol = st.flash > 0 && Math.floor(st.flash * 10) % 2 ? '#e43b44' : '#fee761';
  drawAnim(ctx, 'coin', 0, x + w - 58, y + 4);
  drawText(ctx, '' + G.player.gold, x + w - 40, y + 13, goldCol);
  for (const t of tabs) {
    const on = st.tab === t.id;
    drawText(ctx, (on ? '[' : ' ') + t.id.toUpperCase() + (on ? ']' : ' '), t.x, t.y, on ? '#ffffff' : '#5a6988');
  }
  if (!list.length) drawText(ctx, 'nothing to sell', x + 12, y + 44, '#5a6988');
  for (let i = 0; i < list.length; i++) {
    const r = rows[i];
    const id = st.tab === 'buy' ? list[i] : list[i].id;
    const def = ITEMS[id];
    const price = st.tab === 'buy' ? def.price : sellPrice(id);
    const selected = i === st.sel;
    if (selected) {
      ctx.fillStyle = '#3a4466';
      ctx.fillRect(r.x - 4, r.y - 9, r.w + 8, 14);
    }
    drawAnim(ctx, def.icon, 0, r.x - 2, r.y - 9);
    const label = def.name + (st.tab === 'sell' && list[i].n > 1 ? ' x' + list[i].n : '');
    drawText(ctx, label, r.x + 16, r.y, selected ? '#ffffff' : '#c0cbdc');
    const afford = st.tab === 'sell' || G.player.gold >= price;
    drawText(ctx, price + 'g', r.x + r.w - 30, r.y, afford ? '#fee761' : '#e43b44');
  }
  const sel = list[st.sel];
  if (sel) {
    const id = st.tab === 'buy' ? sel : sel.id;
    drawText(ctx, ITEMS[id].desc || '', x + 10, y + h - 22, '#8b9bb4');
  }
  if (st.flashMsg) drawText(ctx, st.flashMsg, x + 10, y + h - 34, '#e43b44');
  else if (st.flash > 0) drawText(ctx, "Can't afford that!", x + 10, y + h - 34, '#e43b44');
  drawTextC(ctx, 'arrows: move/tab  E: confirm  Esc: leave', VW / 2, y + h + 10, '#8b9bb4');
  ctx.restore();
  ctx.globalAlpha = 1;
}
