// HUD, panels, title/pause/gameover screens, banner, screen transition.

import { G, VW, VH } from './state.js';
import { drawAnim, anim, frameOf, sheetImage } from './assets.js';
import { input } from './input.js';
import { sfx } from './audio.js';
import { xpNeed } from './combat.js';

export function drawText(ctx, text, x, y, color = '#ffffff') {
  ctx.font = '7px monospace';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  ctx.fillText(text, Math.round(x), Math.round(y));
}

export function drawTextC(ctx, text, cx, y, color = '#ffffff') {
  ctx.font = '7px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.fillText(text, Math.round(cx), Math.round(y));
  ctx.textAlign = 'left';
}

// Panel heading in the display face.
export function drawHeading(ctx, text, x, y, color = '#fee761') {
  ctx.font = '15px "Jacquard 12"';
  ctx.fillStyle = '#181425';
  ctx.fillText(text, Math.round(x) + 1, Math.round(y) + 1);
  ctx.fillStyle = color;
  ctx.fillText(text, Math.round(x), Math.round(y));
  ctx.font = '7px monospace';
}

export function drawBigText(ctx, text, cx, y, color = '#ffffff') {
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#181425';
  ctx.fillText(text, Math.round(cx) + 1, Math.round(y) + 1);
  ctx.fillStyle = color;
  ctx.fillText(text, Math.round(cx), Math.round(y));
  ctx.textAlign = 'left';
}

// 9-slice panel from the 48x48 panel sprite (16px corners).
export function drawPanel(ctx, x, y, w, h) {
  const a = anim('panel');
  const img = sheetImage('panel');
  const C = 16;
  const draw = (sx, sy, sw, sh, dx, dy, dw, dh) => {
    ctx.drawImage(img, sx, sy + a.row * 48, sw, sh, Math.round(dx), Math.round(dy), dw, dh);
  };
  draw(0, 0, C, C, x, y, C, C);
  draw(48 - C, 0, C, C, x + w - C, y, C, C);
  draw(0, 48 - C, C, C, x, y + h - C, C, C);
  draw(48 - C, 48 - C, C, C, x + w - C, y + h - C, C, C);
  draw(C, 0, 48 - 2 * C, C, x + C, y, w - 2 * C, C);
  draw(C, 48 - C, 48 - 2 * C, C, x + C, y + h - C, w - 2 * C, C);
  draw(0, C, C, 48 - 2 * C, x, y + C, C, h - 2 * C);
  draw(48 - C, C, C, 48 - 2 * C, x + w - C, y + C, C, h - 2 * C);
  draw(C, C, 48 - 2 * C, 48 - 2 * C, x + C, y + C, w - 2 * C, h - 2 * C);
}

// --- HUD ---------------------------------------------------------------

// Press feedback: a squash-then-overshoot bounce plus a gleam that
// sweeps across the face. `e` runs 0 -> 1 over the press.
function pressScale(e) {
  if (e < 0.35) return 1 - 0.14 * (e / 0.35);
  if (e < 0.7) return 0.86 + 0.22 * ((e - 0.35) / 0.35);
  return 1.08 - 0.08 * ((e - 0.7) / 0.3);
}

function drawButton(ctx, x, y, w, h, label, hover, press) {
  const e = press > 0 ? 1 - press / BTN_PRESS : 0;
  const s = press > 0 ? pressScale(e) : (hover ? 1.04 : 1);
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.scale(s, s);
  ctx.translate(-w / 2, -h / 2);

  const lit = hover || press > 0;
  ctx.fillStyle = '#181425';                       // drop shadow
  ctx.fillRect(1, 2, w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);  // face
  g.addColorStop(0, lit ? '#4a5578' : '#333c5c');
  g.addColorStop(1, lit ? '#2b3350' : '#1e2540');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = lit ? '#8b9bb4' : '#5a6988';     // top bevel
  ctx.fillRect(1, 1, w - 2, 1);
  ctx.fillStyle = '#12142a';                       // bottom shade
  ctx.fillRect(1, h - 2, w - 2, 1);
  ctx.strokeStyle = lit ? '#feae34' : '#181425';   // border
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  ctx.fillStyle = '#181425';                       // corner nibbles
  for (const [cx, cy] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) ctx.fillRect(cx, cy, 1, 1);

  ctx.font = '7px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#181425';
  ctx.fillText(label, w / 2, h / 2 + 3.5);
  ctx.fillStyle = lit ? '#fee761' : '#c0cbdc';
  ctx.fillText(label, w / 2, h / 2 + 2.5);
  ctx.textAlign = 'left';

  if (press > 0) {                                 // gleam sweeping across
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.55 * (1 - e);
    ctx.fillStyle = '#fee761';
    const sx = -w * 0.7 + e * w * 2.2;
    ctx.beginPath();
    ctx.moveTo(sx, h); ctx.lineTo(sx + h * 0.8, 0);
    ctx.lineTo(sx + h * 0.8 + w * 0.22, 0); ctx.lineTo(sx + w * 0.22, h);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

export const BTN_PRESS = 0.3;

export function drawHud(ctx) {
  const p = G.player;
  const touch = document.body.classList.contains('touch');
  const narrow = VW < 250;
  ctx.font = '7px monospace';

  // --- measure the buttons first; they own the top-right --------------
  const bh = touch ? 17 : 13;
  const labels = narrow
    ? [['inv', 'BAG'], ['quest', 'QST'], ['pause', 'MENU']]
    : [['inv', 'BAG'], ['quest', 'QUESTS'], ['pause', 'MENU']];
  const btns = [];
  let bx = VW - 3;
  for (let i = labels.length - 1; i >= 0; i--) {
    const [id, label] = labels[i];
    const w = label.length * 5 + (touch ? 12 : 9);
    bx -= w + 3;
    btns.unshift({ id, label, x: bx, y: 3, w, h: bh });
  }

  // --- stats block, tucked into the corner ----------------------------
  // Hearts stay clear of the buttons; the stat line below them may use
  // the full width, giving a small stepped plate.
  const hearts = Math.ceil(p.maxHp / 2);
  const pitch = 10;
  const roomTop = Math.max(pitch + 4, bx - 4);
  const perRow = Math.max(1, Math.floor((roomTop - 3) / pitch));
  const hRows = Math.ceil(hearts / perRow);
  const heartsW = 3 + Math.min(hearts, perRow) * pitch;
  const heartsH = 3 + hRows * pitch;

  const goldTxt = '' + p.gold, lvTxt = 'LV' + p.level;
  const goldW = ctx.measureText(goldTxt).width;
  const lvW = ctx.measureText(lvTxt).width;
  const barW = 18;
  let statsW = 11 + goldW + 5 + lvW + 4 + barW + 3;
  const showBar = statsW <= VW - 6;
  if (!showBar) statsW = 11 + goldW + 5 + lvW + 3;

  ctx.fillStyle = 'rgba(10,8,22,0.74)';
  ctx.fillRect(0, 0, heartsW, heartsH);
  ctx.fillRect(0, heartsH, statsW, 14);
  ctx.fillStyle = 'rgba(90,105,136,0.35)';           // lip along the edges
  ctx.fillRect(heartsW, 0, 1, heartsH);
  ctx.fillRect(statsW, heartsH, 1, 14);
  ctx.fillRect(0, heartsH + 14, statsW + 1, 1);
  ctx.fillRect(heartsW, heartsH - 1, Math.max(0, statsW - heartsW), 1);

  const wob = p.hurtWobble > 0 ? p.hurtWobble : 0;
  if (p.hurtWobble > 0) p.hurtWobble -= 1 / 60;
  for (let i = 0; i < hearts; i++) {
    const hp2 = p.hp - i * 2;
    const name = hp2 >= 2 ? 'heart_full' : hp2 === 1 ? 'heart_half' : 'heart_empty';
    const jitter = wob > 0 ? Math.round(Math.sin(G.time * 40 + i) * wob * 3) : 0;
    // sprite has 2px of padding above the heart shape
    drawAnim(ctx, name, 0, 1 + (i % perRow) * pitch - 2,
             Math.floor(i / perRow) * pitch + jitter);
  }

  const base = heartsH + 10;                          // stat line baseline
  drawAnim(ctx, 'coin', frameOf('coin', G.time), -3, base - 11);
  drawText(ctx, goldTxt, 11, base, '#fee761');
  const lvX = 11 + goldW + 5;
  drawText(ctx, lvTxt, lvX, base, '#c0cbdc');
  if (showBar) {
    const barX = lvX + lvW + 4;
    ctx.fillStyle = '#181425';
    ctx.fillRect(barX, base - 5, barW, 4);
    ctx.fillStyle = '#63c74d';
    ctx.fillRect(barX + 1, base - 4,
      Math.round((barW - 2) * Math.min(1, p.xp / xpNeed(p.level))), 2);
  }

  // --- buttons on top --------------------------------------------------
  G.ui.hudButtons = [];
  G.ui.btnPress = G.ui.btnPress || {};
  for (const b of btns) {
    const hover = input.mouse.x >= b.x && input.mouse.x < b.x + b.w &&
                  input.mouse.y >= b.y && input.mouse.y < b.y + b.h;
    drawButton(ctx, b.x, b.y, b.w, b.h, b.label, hover, G.ui.btnPress[b.id] || 0);
    G.ui.hudButtons.push(b);
  }

  if (G.banner) {
    G.banner.t -= 1 / 60;
    if (G.banner.t <= 0) G.banner = null;
    else {
      ctx.globalAlpha = Math.min(1, G.banner.t * 2);
      const w = Math.min(G.banner.text.length * 5 + 20, VW - 8);
      drawPanel(ctx, (VW - w) / 2, heartsH + 20, w, 18);
      drawTextC(ctx, G.banner.text, VW / 2, heartsH + 32, '#fee761');
      ctx.globalAlpha = 1;
    }
  }
  if (G.muted) drawText(ctx, 'MUTED', 3, VH - 3, '#5a6988');
}

// --- screens -----------------------------------------------------------

import { setMusicEnabled } from './audio.js';

function titleOptions(st) {
  const opts = st.hasSave ? ['Continue', 'New Game'] : ['New Game'];
  opts.push('Music: ' + (G.musicOn ? 'On' : 'Off'));
  return opts;
}

// Shrink a line until it fits the available width.
function fitFont(ctx, text, size, maxW, minSize = 10) {
  while (size > minSize) {
    ctx.font = size + 'px "Jacquard 12"';
    if (ctx.measureText(text).width <= maxW) break;
    size--;
  }
  return size;
}

// The title screen sizes its type to the viewport, so it reads the same
// on a phone as on a desktop instead of running off both edges.
function titleLayout(ctx, opts) {
  const avail = VW - 20;
  const titleSize = fitFont(ctx, 'Emberdale', Math.min(46, Math.round(VW * 0.20)), avail, 16);
  const subSize = Math.max(8, Math.round(titleSize * 0.38));
  let menuSize = Math.max(10, Math.round(titleSize * 0.42));
  for (const o of opts) menuSize = fitFont(ctx, o, menuSize, avail - 40, 8);
  const rowH = menuSize + 8;
  const menuY = Math.round(VH * 0.66);
  let arrow = 0;
  ctx.font = menuSize + 'px "Jacquard 12"';
  for (const o of opts) arrow = Math.max(arrow, ctx.measureText(o).width / 2 + menuSize * 0.7);
  return { titleSize, subSize, menuSize, rowH, menuY, arrow,
           titleY: Math.round(VH * 0.40) };
}

export function updateTitle() {
  const st = G.ui.title;
  const opts = titleOptions(st);
  if (input.pressed.up) { st.sel = (st.sel + opts.length - 1) % opts.length; sfx('menu'); }
  if (input.pressed.down) { st.sel = (st.sel + 1) % opts.length; sfx('menu'); }
  let activate = input.pressed.interact || input.pressed.attack;
  const L = titleLayout(G.ctx, opts);
  opts.forEach((o, i) => {
    const cy = L.menuY + i * L.rowH;
    if (input.mouse.x > VW / 2 - L.arrow - 10 && input.mouse.x < VW / 2 + L.arrow + 10 &&
        input.mouse.y > cy - L.menuSize && input.mouse.y < cy + L.rowH - L.menuSize) {
      if (st.sel !== i) { st.sel = i; sfx('menu'); }
      if (input.mouse.clicked) activate = true;
    }
  });
  if (activate) {
    sfx('menu');
    const o = opts[st.sel];
    if (o.startsWith('Music')) {
      setMusicEnabled(!G.musicOn);
      return null;
    }
    return o;
  }
  return null;
}

// --- title backdrop: parallax moonlit valley ---------------------------

let stars = null;
let starsW = 0;

function initStars() {
  stars = [];
  starsW = VW;
  let s = 12345;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 110; i++) {
    stars.push({ x: rnd() * VW, y: rnd() * rnd() * (VH * 0.58), big: rnd() < 0.12, ph: rnd() * 7 });
  }
}

// ridge height, periodic in x so layers wrap seamlessly
function ridge(x, base, a1, a2, a3) {
  const u = x / VW * Math.PI * 2;
  return base + a1 * Math.sin(u * 2 + 1.7) + a2 * Math.sin(u * 5 + 0.4) + a3 * Math.sin(u * 11 + 3.1);
}

function fillRidge(ctx, drift, base, a1, a2, a3, color) {
  ctx.fillStyle = color;
  for (let x = 0; x < VW; x++) {
    const y = Math.round(ridge(((x + drift) % VW + VW) % VW, base, a1, a2, a3));
    ctx.fillRect(x, y, 1, VH - y);
  }
}

function drawValley(ctx) {
  const t = G.time;
  // sky bands, darkest at the top
  const bands = [
    ['#0b0d1a', 0], ['#12142a', VH * 0.23], ['#1a1e3c', VH * 0.43],
    ['#252b52', VH * 0.57], ['#303a66', VH * 0.64],
  ];
  for (let i = 0; i < bands.length; i++) {
    const y = Math.round(bands[i][1]);
    const y2 = Math.round(i + 1 < bands.length ? bands[i + 1][1] : VH * 0.70);
    ctx.fillStyle = bands[i][0];
    ctx.fillRect(0, y, VW, y2 - y);
  }
  // stars twinkle
  if (!stars || starsW !== VW) initStars();
  for (const st of stars) {
    const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 0.9 + st.ph));
    ctx.globalAlpha = tw;
    ctx.fillStyle = '#c0cbdc';
    ctx.fillRect(Math.round(st.x), Math.round(st.y), 1, 1);
    if (st.big) {
      ctx.globalAlpha = tw * 0.5;
      ctx.fillRect(Math.round(st.x) - 1, Math.round(st.y), 3, 1);
      ctx.fillRect(Math.round(st.x), Math.round(st.y) - 1, 1, 3);
    }
  }
  ctx.globalAlpha = 1;
  // moon with soft glow
  const mx = VW - 42, my = VH * 0.15;
  for (const [r, a] of [[30, 0.05], [22, 0.08], [17, 0.13]]) {
    ctx.globalAlpha = a;
    ctx.fillStyle = '#c0cbdc';
    ctx.beginPath(); ctx.arc(mx, my, r, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#e6ebf2';
  ctx.beginPath(); ctx.arc(mx, my, 13, 0, 7); ctx.fill();
  ctx.fillStyle = '#c0cbdc';
  for (const [cx, cy, cr] of [[mx - 4, my - 3, 3], [mx + 5, my + 2, 2], [mx - 1, my + 6, 2]]) {
    ctx.beginPath(); ctx.arc(cx, cy, cr, 0, 7); ctx.fill();
  }
  // parallax ridges: far drifts least, near drifts most
  const sway = Math.sin(t * 0.07);
  fillRidge(ctx, sway * 8, VH - 84, 12, 6, 2, '#1b1e33');
  fillRidge(ctx, sway * 20, VH - 58, 8, 4, 2, '#242a49');
  // drifting mist
  ctx.fillStyle = '#8b9bb4';
  for (let i = 0; i < 3; i++) {
    ctx.globalAlpha = 0.055;
    const w = 150 + i * 40;
    const x = ((t * (5 + i * 3) + i * 140) % (VW + w)) - w;
    ctx.fillRect(Math.round(x), Math.round(VH - 54 + i * 8), w, 5);
  }
  ctx.globalAlpha = 1;
  // foreground meadow + treeline, fastest layer
  fillRidge(ctx, sway * 34, VH - 18, 4, 3, 1, '#101223');
  const toff = sway * 34;
  ctx.fillStyle = '#101223';
  for (let i = 0; i * 24 < VW + 24; i++) {
    const x = Math.round(((i * 24 - toff) % (VW + 24) + VW + 24) % (VW + 24)) - 12;
    const y = Math.round(ridge(((x + toff) % VW + VW) % VW, VH - 18, 4, 3, 1));
    ctx.fillRect(x + 3, y - 3, 3, 4);
    ctx.fillRect(x + 2, y - 1, 5, 2);
    ctx.fillRect(x + 4, y - 5, 1, 3);
  }
}

export function drawTitle(ctx) {
  const st = G.ui.title;
  drawValley(ctx);
  const opts = titleOptions(st);
  const L = titleLayout(ctx, opts);
  ctx.textAlign = 'center';

  ctx.font = L.titleSize + 'px "Jacquard 12"';
  const off = Math.max(1, Math.round(L.titleSize / 24));
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#feae34';
  ctx.fillText('Emberdale', VW / 2 + off, L.titleY + off / 2);
  ctx.fillText('Emberdale', VW / 2 - off, L.titleY - off);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#181425';
  ctx.fillText('Emberdale', VW / 2 + off, L.titleY + off);
  ctx.fillStyle = '#fee761';
  ctx.fillText('Emberdale', VW / 2, L.titleY);

  ctx.font = L.subSize + 'px "Jacquard 12"';
  ctx.fillStyle = '#8b9bb4';
  ctx.fillText('a tiny action rpg', VW / 2, L.titleY + L.subSize + 6);

  ctx.font = L.menuSize + 'px "Jacquard 12"';
  opts.forEach((o, i) => {
    const on = st.sel === i;
    const y = L.menuY + i * L.rowH;
    ctx.fillStyle = '#181425';
    ctx.fillText(o, VW / 2 + 1, y + 1);
    ctx.fillStyle = on ? '#fee761' : '#8b9bb4';
    ctx.fillText(o, VW / 2, y);
    if (on) {
      ctx.fillText('>', VW / 2 - L.arrow, y);
      ctx.fillText('<', VW / 2 + L.arrow, y);
    }
  });
  ctx.textAlign = 'left';
}

export function updatePause() {
  const st = G.ui.pause;
  const opts = ['Resume', G.muted ? 'Unmute' : 'Mute', 'Restart (new game)'];
  if (input.pressed.up) { st.sel = (st.sel + opts.length - 1) % opts.length; sfx('menu'); }
  if (input.pressed.down) { st.sel = (st.sel + 1) % opts.length; sfx('menu'); }
  if (input.pressed.pause) return 'Resume';
  let activate = input.pressed.interact || input.pressed.attack;
  const py = (VH - 80) / 2;
  opts.forEach((o, i) => {
    const cy = py + 36 + i * 12;
    if (input.mouse.x > VW / 2 - 60 && input.mouse.x < VW / 2 + 60 &&
        input.mouse.y > cy - 8 && input.mouse.y < cy + 4) {
      if (st.sel !== i) { st.sel = i; sfx('menu'); }
      if (input.mouse.clicked) activate = true;
    }
  });
  if (activate) {
    sfx('menu');
    return opts[st.sel];
  }
  return null;
}

export function drawPause(ctx) {
  ctx.fillStyle = 'rgba(24,20,37,0.7)';
  ctx.fillRect(0, 0, VW, VH);
  const st = G.ui.pause;
  const pw = Math.min(130, VW - 16);
  const px = (VW - pw) / 2, py = (VH - 80) / 2;
  drawPanel(ctx, px, py, pw, 78);
  drawBigText(ctx, 'PAUSED', VW / 2, py + 18, '#feae34');
  const opts = ['Resume', G.muted ? 'Unmute' : 'Mute', 'Restart (new game)'];
  opts.forEach((o, i) => {
    const on = st.sel === i;
    drawTextC(ctx, (on ? '> ' : '') + o, VW / 2, py + 36 + i * 12, on ? '#fee761' : '#c0cbdc');
  });
}

export function drawGameover(ctx, t) {
  ctx.fillStyle = `rgba(24,20,37,${Math.min(0.85, t)})`;
  ctx.fillRect(0, 0, VW, VH);
  if (t > 0.5) {
    drawBigText(ctx, 'YOU FELL', VW / 2, VH / 2 - 12, '#e43b44');
    drawTextC(ctx, 'The road back is paid in gold...', VW / 2, VH / 2 + 6, '#8b9bb4');
    if (t > 1.2 && Math.floor(G.time * 2) % 2) {
      drawTextC(ctx, 'press E to wake up in Emberdale', VW / 2, VH / 2 + 28, '#ffffff');
    }
  }
}

export function drawTransition(ctx) {
  if (!G.transition) return;
  const tr = G.transition;
  const a = tr.phase === 'out' ? tr.t : 1 - tr.t;
  ctx.fillStyle = `rgba(24,20,37,${Math.min(1, a)})`;
  ctx.fillRect(0, 0, VW, VH);
}
