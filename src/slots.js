// Save-slot picker and the end-of-run summary that leads into New Game+.

import { G, VW, VH } from './state.js';
import { input } from './input.js';
import { sfx } from './audio.js';
import {
  drawPanel, drawText, drawTextC, drawHeading,
  drawSquishButton, pressKey, pressAmount, inButton,
} from './ui.js';
import { SLOTS, slotSummary, clearSave } from './save.js';

const MAP_NAMES = {
  town1: 'Emberdale', town2: 'Ashvale', overworld: 'the road',
  store: 'the store', smithy: 'the smithy',
  elder_house: "Rowan's house", sage_house: "Mira's house",
  dungeon: 'the crypt', dungeon2: 'the gallery', dungeon3: "the King's hall",
};

export function clockOf(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  return h ? h + 'h ' + m + 'm' : m + 'm ' + (s % 60) + 's';
}

export function newStats() {
  return { kills: 0, gold: 0, deaths: 0, elites: 0, playtime: 0 };
}

// --- slot picker ---------------------------------------------------------

export function openSlots(intent) {
  G.mode = 'slots';
  G.ui.slots = { sel: 0, intent, t: 0, erase: false };
  sfx('menu');
}

function layout() {
  const pw = Math.min(210, VW - 8);
  const rowH = 22, gap = 4;
  const ph = 30 + SLOTS * (rowH + gap) + 26;
  const px = Math.round((VW - pw) / 2), py = Math.round((VH - ph) / 2);
  const rows = [];
  for (let i = 0; i < SLOTS; i++) {
    rows.push({ i, x: px + 10, y: py + 26 + i * (rowH + gap), w: pw - 20, h: rowH });
  }
  return { px, py, pw, ph, rows };
}

// Returns an action for main.js: {load:i} | {fresh:i} | 'back'
export function updateSlots(dt) {
  const st = G.ui.slots;
  st.t = Math.min(1, st.t + dt * 6);
  const L = layout();
  if (input.pressed.pause) { sfx('menu'); return 'back'; }
  if (input.pressed.up) { st.sel = (st.sel + SLOTS - 1) % SLOTS; sfx('menu'); }
  if (input.pressed.down) { st.sel = (st.sel + 1) % SLOTS; sfx('menu'); }
  if (input.pressed.quest) {                        // Q wipes the highlighted slot
    if (slotSummary(st.sel)) { clearSave(st.sel); sfx('break'); }
    else sfx('deny');
  }

  let choose = input.pressed.interact || input.pressed.attack ? st.sel : -1;
  let outside = input.mouse.clicked;
  for (const r of L.rows) {
    if (!inButton(r)) continue;
    outside = false;
    if (st.sel !== r.i) { st.sel = r.i; sfx('menu'); }
    if (input.mouse.clicked) choose = r.i;
  }
  if (choose >= 0) {
    pressKey('slot_' + choose);
    sfx('menu');
    return slotSummary(choose) && st.intent !== 'new'
      ? { load: choose } : { fresh: choose };
  }
  if (outside &&
      (input.mouse.x < L.px || input.mouse.x > L.px + L.pw ||
       input.mouse.y < L.py || input.mouse.y > L.py + L.ph)) {
    sfx('menu');
    return 'back';
  }
  return null;
}

export function drawSlots(ctx) {
  const st = G.ui.slots;
  const L = layout();
  ctx.save();
  ctx.translate(0, Math.round((1 - st.t) * -24));
  ctx.globalAlpha = st.t;
  drawPanel(ctx, L.px, L.py, L.pw, L.ph);
  drawHeading(ctx, st.intent === 'new' ? 'Start where?' : 'Saved runs', L.px + 10, L.py + 15);

  for (const r of L.rows) {
    const s = slotSummary(r.i);
    drawSquishButton(ctx, r.x, r.y, r.w, r.h, '',
      { hover: inButton(r), selected: st.sel === r.i, press: pressAmount('slot_' + r.i),
        tone: st.sel === r.i ? 'accent' : null });
    const ink = st.sel === r.i ? '#2a1c06' : s ? '#ffffff' : '#5a6988';
    const sub = st.sel === r.i ? '#4a3208' : '#8b9bb4';
    drawText(ctx, 'Slot ' + (r.i + 1), r.x + 7, r.y + 10, ink);
    if (s) {
      drawText(ctx, 'Lv' + s.level + (s.ngPlus ? '  NG+' + s.ngPlus : '') +
               (s.done ? '  finished' : ''), r.x + 50, r.y + 10, ink);
      drawText(ctx, (MAP_NAMES[s.map] || s.map) + '  ' + clockOf(s.playtime),
               r.x + 7, r.y + 19, sub);
    } else {
      drawText(ctx, 'empty - a new run starts here', r.x + 50, r.y + 10, sub);
    }
  }
  drawTextC(ctx, 'E: choose    Q: erase    Esc: back', VW / 2, L.py + L.ph - 8, '#8b9bb4');
  ctx.restore();
  ctx.globalAlpha = 1;
}

// --- run summary ---------------------------------------------------------

export function openSummary() {
  G.mode = 'summary';
  // default to carrying on: starting New Game+ wipes the world, so it has
  // to be chosen deliberately
  G.ui.summary = { t: 0, sel: 1 };
  sfx('quest');
}

function summaryLayout() {
  const pw = Math.min(206, VW - 8);
  const ph = 132;
  const px = Math.round((VW - pw) / 2), py = Math.round((VH - ph) / 2);
  const bw = Math.floor((pw - 24) / 2);
  return {
    px, py, pw, ph,
    btns: [
      { id: 'ng', label: 'New Game+', x: px + 10, y: py + ph - 24, w: bw, h: 16 },
      { id: 'stay', label: 'Keep playing', x: px + 14 + bw, y: py + ph - 24, w: bw, h: 16 },
    ],
  };
}

// Returns 'ng' | 'stay' | null
export function updateSummary(dt) {
  const st = G.ui.summary;
  st.t = Math.min(1, st.t + dt * 5);
  if (st.t < 0.8) return null;
  const L = summaryLayout();
  if (input.pressed.left || input.pressed.right) { st.sel = 1 - st.sel; sfx('menu'); }
  for (const b of L.btns) {
    if (!inButton(b)) continue;
    const i = L.btns.indexOf(b);
    if (st.sel !== i) { st.sel = i; sfx('menu'); }
    if (input.mouse.clicked) { pressKey('sum_' + b.id); sfx('menu'); return b.id; }
  }
  if (input.pressed.interact || input.pressed.attack) {
    sfx('menu');
    return L.btns[st.sel].id;
  }
  if (input.pressed.pause) { sfx('menu'); return 'stay'; }
  return null;
}

export function drawSummary(ctx) {
  const st = G.ui.summary;
  const L = summaryLayout();
  ctx.fillStyle = 'rgba(24,20,37,' + (0.75 * Math.min(1, st.t * 2)) + ')';
  ctx.fillRect(0, 0, VW, VH);
  ctx.save();
  ctx.globalAlpha = Math.min(1, st.t * 1.6);
  drawPanel(ctx, L.px, L.py, L.pw, L.ph);
  drawHeading(ctx, 'The amulet is home', L.px + 10, L.py + 16);
  const s = G.stats || {};
  const lines = [
    ['Time in Emberdale', clockOf(s.playtime || 0)],
    ['Enemies felled', '' + (s.kills || 0)],
    ['Elites broken', '' + (s.elites || 0)],
    ['Gold gathered', '' + (s.gold || 0)],
    ['Times you fell', '' + (s.deaths || 0)],
    ['Crypt records found', Object.keys(G.flags).filter(k => k.startsWith('note_')).length + ' of 4'],
    ['Level reached', 'Lv' + G.player.level + (G.ngPlus ? '   NG+' + G.ngPlus : '')],
  ];
  let y = L.py + 30;
  for (const [k, v] of lines) {
    drawText(ctx, k, L.px + 12, y, '#8b9bb4');
    drawText(ctx, v, L.px + L.pw - 12 - v.length * 4.3, y, '#ffffff');
    y += 10;
  }
  L.btns.forEach((b, i) => {
    drawSquishButton(ctx, b.x, b.y, b.w, b.h, b.label, {
      hover: inButton(b), press: pressAmount('sum_' + b.id),
      selected: st.sel === i,
      tone: st.sel === i ? 'accent' : null,
    });
  });
  ctx.restore();
  ctx.globalAlpha = 1;
}
