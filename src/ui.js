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

export function drawHud(ctx) {
  const p = G.player;
  // hearts (each heart = 2 hp)
  const hearts = Math.ceil(p.maxHp / 2);
  const wob = p.hurtWobble > 0 ? p.hurtWobble : 0;
  if (p.hurtWobble > 0) p.hurtWobble -= 1 / 60;
  for (let i = 0; i < hearts; i++) {
    const hp2 = p.hp - i * 2;
    const name = hp2 >= 2 ? 'heart_full' : hp2 === 1 ? 'heart_half' : 'heart_empty';
    const jitter = wob > 0 ? Math.round(Math.sin(G.time * 40 + i) * wob * 3) : 0;
    drawAnim(ctx, name, 0, 4 + i * 11, 2 + jitter);
  }
  // gold
  drawAnim(ctx, 'coin', frameOf('coin', G.time), 2, 14);
  drawText(ctx, '' + p.gold, 18, 25, '#fee761');
  // level + xp bar
  drawText(ctx, 'LV' + p.level, 4, 37, '#c0cbdc');
  ctx.fillStyle = '#262b44';
  ctx.fillRect(26, 32, 40, 4);
  ctx.fillStyle = '#63c74d';
  ctx.fillRect(26, 32, Math.round(40 * Math.min(1, p.xp / xpNeed(p.level))), 4);

  if (G.banner) {
    G.banner.t -= 1 / 60;
    if (G.banner.t <= 0) G.banner = null;
    else {
      const a = Math.min(1, G.banner.t * 2);
      ctx.globalAlpha = a;
      const w = G.banner.text.length * 5 + 20;
      drawPanel(ctx, (VW - w) / 2, 6, w, 18);
      drawTextC(ctx, G.banner.text, VW / 2, 18, '#fee761');
      ctx.globalAlpha = 1;
    }
  }
  if (G.muted) drawText(ctx, 'MUTED (M)', VW - 54, 10, '#5a6988');
}

// --- screens -----------------------------------------------------------

import { setMusicEnabled } from './audio.js';

function titleOptions(st) {
  const opts = st.hasSave ? ['Continue', 'New Game'] : ['New Game'];
  opts.push('Music: ' + (G.musicOn ? 'On' : 'Off'));
  return opts;
}

export function updateTitle() {
  const st = G.ui.title;
  const opts = titleOptions(st);
  if (input.pressed.up) { st.sel = (st.sel + opts.length - 1) % opts.length; sfx('menu'); }
  if (input.pressed.down) { st.sel = (st.sel + 1) % opts.length; sfx('menu'); }
  if (input.pressed.interact || input.pressed.attack) {
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

function initStars() {
  stars = [];
  let s = 12345;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 80; i++) {
    stars.push({ x: rnd() * VW, y: rnd() * rnd() * 105, big: rnd() < 0.12, ph: rnd() * 7 });
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

const HOUSES = [
  { x: 38, w: 13, h: 9 }, { x: 55, w: 11, h: 8 }, { x: 70, w: 16, h: 10 },
  { x: 91, w: 12, h: 8 }, { x: 107, w: 14, h: 9 },
];

function drawValley(ctx) {
  const t = G.time;
  // sky bands, darkest at the top
  const bands = [['#0b0d1a', 0], ['#12142a', 42], ['#1a1e3c', 78], ['#252b52', 102], ['#303a66', 116]];
  for (let i = 0; i < bands.length; i++) {
    const [c, y] = bands[i];
    const y2 = i + 1 < bands.length ? bands[i + 1][1] : 124;
    ctx.fillStyle = c;
    ctx.fillRect(0, y, VW, y2 - y);
  }
  // stars twinkle
  if (!stars) initStars();
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
  const mx = 250, my = 34;
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
  fillRidge(ctx, sway * 8, 96, 12, 6, 2, '#1b1e33');
  fillRidge(ctx, sway * 20, 122, 8, 4, 2, '#242a49');
  // the town, nestled on the valley floor
  ctx.save();
  ctx.translate(Math.round(sway * 4), 0);
  const base = 148;
  ctx.fillStyle = 'rgba(254,174,52,0.03)';                 // communal warm glow, soft falloff
  ctx.fillRect(24, base - 24, 114, 28);
  ctx.fillRect(36, base - 18, 90, 22);
  ctx.fillRect(48, base - 12, 66, 16);
  for (const h of HOUSES) {
    ctx.fillStyle = '#12142a';
    ctx.fillRect(h.x, base - h.h, h.w, h.h);               // walls
    ctx.fillStyle = '#1e1830';
    ctx.fillRect(h.x - 1, base - h.h - 2, h.w + 2, 3);     // eaves
    ctx.fillRect(h.x + 1, base - h.h - 4, h.w - 2, 2);     // roof ridge
    ctx.fillStyle = '#feae34';
    ctx.globalAlpha = 0.16;
    ctx.fillRect(h.x + 2, base - h.h + 2, 6, 5);           // window glow
    ctx.globalAlpha = 1;
    ctx.fillRect(h.x + 3, base - h.h + 3, 2, 2);           // lit window
    if (h.w > 12) ctx.fillRect(h.x + h.w - 5, base - h.h + 3, 2, 2);
  }
  // chapel tower
  ctx.fillStyle = '#12142a';
  ctx.fillRect(124, base - 18, 7, 18);
  ctx.fillRect(126, base - 22, 3, 4);
  ctx.fillStyle = '#fee761';
  ctx.fillRect(127, base - 15, 1, 2);
  // chimney smoke
  for (let i = 0; i < 4; i++) {
    const yy = (t * 5 + i * 7) % 24;
    ctx.globalAlpha = 0.22 * (1 - yy / 24);
    ctx.fillStyle = '#8b9bb4';
    ctx.fillRect(Math.round(76 + Math.sin(t + yy * 0.3 + i) * 2), Math.round(base - 12 - yy), 2, 2);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  // drifting mist
  ctx.fillStyle = '#8b9bb4';
  for (let i = 0; i < 3; i++) {
    ctx.globalAlpha = 0.055;
    const w = 150 + i * 40;
    const x = ((t * (5 + i * 3) + i * 140) % (VW + w)) - w;
    ctx.fillRect(Math.round(x), 126 + i * 8, w, 5);
  }
  ctx.globalAlpha = 1;
  // foreground meadow + treeline, fastest layer
  fillRidge(ctx, sway * 34, 162, 4, 3, 1, '#101223');
  const toff = sway * 34;
  ctx.fillStyle = '#101223';
  for (let i = 0; i < 15; i++) {
    const x = Math.round(((i * 24 - toff) % (VW + 24) + VW + 24) % (VW + 24)) - 12;
    const y = Math.round(ridge(((x + toff) % VW + VW) % VW, 162, 4, 3, 1));
    ctx.fillRect(x + 3, y - 3, 3, 4);
    ctx.fillRect(x + 2, y - 1, 5, 2);
    ctx.fillRect(x + 4, y - 5, 1, 3);
  }
}

export function drawTitle(ctx) {
  const st = G.ui.title;
  drawValley(ctx);
  // title in the display face, with a soft golden glow
  ctx.textAlign = 'center';
  ctx.font = '38px "Jacquard 12"';
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#feae34';
  ctx.fillText('Emberdale', VW / 2 + 1, 52);
  ctx.fillText('Emberdale', VW / 2 - 1, 50);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#181425';
  ctx.fillText('Emberdale', VW / 2 + 2, 53);
  ctx.fillStyle = '#fee761';
  ctx.fillText('Emberdale', VW / 2, 51);
  ctx.font = '16px "Jacquard 12"';
  ctx.fillStyle = '#8b9bb4';
  ctx.fillText('a tiny action rpg', VW / 2, 66);
  // menu
  const opts = titleOptions(st);
  ctx.font = '16px "Jacquard 12"';
  opts.forEach((o, i) => {
    const on = st.sel === i;
    ctx.fillStyle = '#181425';
    ctx.fillText(o, VW / 2 + 1, 118 + i * 15);
    ctx.fillStyle = on ? '#fee761' : '#8b9bb4';
    ctx.fillText(o, VW / 2, 117 + i * 15);
    if (on) {
      ctx.fillText('>', VW / 2 - 40, 117 + i * 15);
      ctx.fillText('<', VW / 2 + 40, 117 + i * 15);
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
  if (input.pressed.interact || input.pressed.attack) {
    sfx('menu');
    return opts[st.sel];
  }
  return null;
}

export function drawPause(ctx) {
  ctx.fillStyle = 'rgba(24,20,37,0.7)';
  ctx.fillRect(0, 0, VW, VH);
  const st = G.ui.pause;
  drawPanel(ctx, 100, 50, 120, 76);
  drawBigText(ctx, 'PAUSED', VW / 2, 68, '#feae34');
  const opts = ['Resume', G.muted ? 'Unmute' : 'Mute', 'Restart (new game)'];
  opts.forEach((o, i) => {
    const on = st.sel === i;
    drawTextC(ctx, (on ? '> ' : '') + o, VW / 2, 86 + i * 12, on ? '#fee761' : '#c0cbdc');
  });
}

export function drawGameover(ctx, t) {
  ctx.fillStyle = `rgba(24,20,37,${Math.min(0.85, t)})`;
  ctx.fillRect(0, 0, VW, VH);
  if (t > 0.5) {
    drawBigText(ctx, 'YOU FELL', VW / 2, 80, '#e43b44');
    drawTextC(ctx, 'The road back is paid in gold...', VW / 2, 98, '#8b9bb4');
    if (t > 1.2 && Math.floor(G.time * 2) % 2) {
      drawTextC(ctx, 'press E to wake up in Emberdale', VW / 2, 120, '#ffffff');
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
