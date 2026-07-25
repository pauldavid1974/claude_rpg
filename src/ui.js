// HUD, panels, title/pause/gameover screens, banner, screen transition.

import { G, VW, VH } from './state.js';
import { drawAnim, anim, frameOf, sheetImage } from './assets.js';
import { input } from './input.js';
import { sfx } from './audio.js';
import { xpNeed } from './combat.js';
import { DODGE } from './entities.js';
import { quickSlots, countItem, USE_CD } from './inventory.js';
import { ITEMS } from './items.js';
import { duckMusic } from './audio.js';

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

// --- squishy buttons ---------------------------------------------------
// One widget for every button in the game: HUD, dialogue choices, pause
// and title menus. Rounded, and it squashes wide then springs tall when
// pressed before settling back.

export const BTN_PRESS = 0.32;

export function pressKey(id) {
  G.ui.press = G.ui.press || {};
  G.ui.press[id] = BTN_PRESS;
}

export function pressAmount(id) {
  return (G.ui.press && G.ui.press[id]) || 0;
}

export function tickPresses(dt) {
  const P = G.ui.press;
  if (!P) return;
  for (const k in P) if (P[k] > 0) P[k] = Math.max(0, P[k] - dt);
}

// squash wide -> spring tall -> settle
function squish(e) {
  if (e < 0.28) { const k = e / 0.28; return [1 + 0.20 * k, 1 - 0.20 * k]; }
  if (e < 0.62) { const k = (e - 0.28) / 0.34; return [1.20 - 0.32 * k, 0.80 + 0.34 * k]; }
  const k = (e - 0.62) / 0.38;
  return [0.88 + 0.12 * k, 1.14 - 0.14 * k];
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// state: { hover, press (0..BTN_PRESS), selected, font, size, tone }
export function drawSquishButton(ctx, x, y, w, h, label, state = {}) {
  const press = state.press || 0;
  const e = press > 0 ? 1 - press / BTN_PRESS : 0;
  const [sx, sy] = press > 0 ? squish(e)
                 : (state.hover || state.selected) ? [1.035, 1.035] : [1, 1];
  const lit = state.hover || state.selected || press > 0;
  const r = Math.max(3, Math.min(h / 2.2, 6));

  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.scale(sx, sy);
  ctx.translate(-w / 2, -h / 2);

  ctx.fillStyle = 'rgba(12,10,26,0.6)';               // soft drop shadow
  roundRect(ctx, 1, 2.5, w, h, r); ctx.fill();

  const g = ctx.createLinearGradient(0, 0, 0, h);     // face
  if (state.tone === 'accent') {
    g.addColorStop(0, lit ? '#ffd166' : '#d99326');
    g.addColorStop(1, lit ? '#e08b1d' : '#a4650f');
  } else {
    g.addColorStop(0, lit ? '#4e5a80' : '#333c5c');
    g.addColorStop(1, lit ? '#2c3454' : '#1d2440');
  }
  ctx.fillStyle = g;
  roundRect(ctx, 0, 0, w, h, r); ctx.fill();

  ctx.save();                                          // glossy top half
  roundRect(ctx, 0, 0, w, h, r); ctx.clip();
  const gl = ctx.createLinearGradient(0, 0, 0, h * 0.55);
  gl.addColorStop(0, 'rgba(255,255,255,0.16)');
  gl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gl;
  ctx.fillRect(0, 0, w, h * 0.55);
  if (press > 0) {                                     // gleam sweep
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 * (1 - e);
    ctx.fillStyle = '#fee761';
    const gx = -w * 0.7 + e * w * 2.2;
    ctx.beginPath();
    ctx.moveTo(gx, h); ctx.lineTo(gx + h * 0.8, 0);
    ctx.lineTo(gx + h * 0.8 + w * 0.24, 0); ctx.lineTo(gx + w * 0.24, h);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();

  if (state.cooldown > 0) {                            // unavailable: drain down
    ctx.save();
    roundRect(ctx, 0, 0, w, h, r); ctx.clip();
    ctx.fillStyle = 'rgba(8,7,18,0.62)';
    ctx.fillRect(0, 0, w, h * Math.min(1, state.cooldown));
    ctx.restore();
  }

  ctx.lineWidth = 1;                                   // rim
  ctx.strokeStyle = lit ? '#feae34' : '#12142a';
  roundRect(ctx, 0.5, 0.5, w - 1, h - 1, r); ctx.stroke();

  const fs = state.size || 7;
  ctx.font = state.font || (fs + 'px monospace');
  ctx.textAlign = 'center';
  // Centre on the glyph box, not the em box - the display face and the
  // 7px mono face sit very differently on the baseline.
  const m = ctx.measureText(label);
  const asc = m.actualBoundingBoxAscent || fs * 0.7;
  const desc = m.actualBoundingBoxDescent || 0;
  const by = Math.round(h / 2 + (asc - desc) / 2);
  // dark text on gold wants a light emboss; light text wants a dark one
  ctx.fillStyle = state.tone === 'accent' ? 'rgba(255,240,205,0.55)' : 'rgba(12,10,26,0.85)';
  ctx.fillText(label, w / 2, by + 1);
  ctx.fillStyle = state.tone === 'accent' ? '#2a1c06'
                : lit ? '#fee761' : '#c0cbdc';
  ctx.fillText(label, w / 2, by);
  ctx.textAlign = 'left';
  ctx.restore();
}

// Hit test in unscaled space, so the squish never moves the target.
export function inButton(b) {
  return input.mouse.x >= b.x && input.mouse.x < b.x + b.w &&
         input.mouse.y >= b.y && input.mouse.y < b.y + b.h;
}

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
  const pitch = 8;
  const roomTop = Math.max(pitch + 4, bx - 4);
  const perRow = Math.max(1, Math.floor((roomTop - 3) / pitch));
  // Past a dozen hearts the row becomes a wall of pips - show a bar instead.
  const asBar = hearts > 12 || hearts > perRow * 2;
  const barFullW = Math.min(Math.max(46, perRow * 4), roomTop - 6);
  const hRows = asBar ? 1 : Math.ceil(hearts / perRow);
  const heartsW = asBar ? barFullW + 13 : 3 + Math.min(hearts, perRow) * pitch;
  const heartsH = asBar ? 12 : 3 + hRows * pitch;

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
  const jit = wob > 0 ? Math.round(Math.sin(G.time * 40) * wob * 3) : 0;
  if (asBar) {
    const frac = Math.max(0, p.hp / p.maxHp);
    const bx0 = 10, by0 = 3 + jit, bw = barFullW, bhh = 6;
    drawAnim(ctx, 'heart_s_full', 0, 1, by0 - 1);
    ctx.fillStyle = '#12142a';
    ctx.fillRect(bx0 - 1, by0 - 1, bw + 2, bhh + 2);
    ctx.fillStyle = '#3a2030';
    ctx.fillRect(bx0, by0, bw, bhh);
    const fillW = Math.round(bw * frac);
    const gr = ctx.createLinearGradient(0, by0, 0, by0 + bhh);
    gr.addColorStop(0, frac > 0.35 ? '#ff6b6b' : '#ffae57');
    gr.addColorStop(1, frac > 0.35 ? '#c42430' : '#e04a1c');
    ctx.fillStyle = gr;
    ctx.fillRect(bx0, by0, fillW, bhh);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(bx0, by0, fillW, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.30)';               // notch every 5 hearts
    for (let i = 10; i < p.maxHp; i += 10) {
      ctx.fillRect(bx0 + Math.round(bw * (i / p.maxHp)), by0, 1, bhh);
    }
    drawText(ctx, p.hp + '/' + p.maxHp, bx0 + 3, by0 + bhh - 1, '#ffe9e0');
  } else {
    for (let i = 0; i < hearts; i++) {
      const hp2 = p.hp - i * 2;
      const name = hp2 >= 2 ? 'heart_s_full' : hp2 === 1 ? 'heart_s_half' : 'heart_s_empty';
      const jitter = wob > 0 ? Math.round(Math.sin(G.time * 40 + i) * wob * 3) : 0;
      drawAnim(ctx, name, 0, 2 + (i % perRow) * pitch,
               3 + Math.floor(i / perRow) * pitch + jitter);
    }
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
  for (const b of btns) {
    const hover = inButton(b);
    drawSquishButton(ctx, b.x, b.y, b.w, b.h, b.label,
                     { hover, press: pressAmount('hud_' + b.id) });
    G.ui.hudButtons.push(b);
  }

  // Roll button, so a dodge is reachable with a mouse or a thumb as well
  // as with Shift.  Drains as it cools down.
  if (G.mode === 'play') {
    const rw = touch ? 34 : 28, rh = touch ? 20 : 16;
    const rb = { id: 'dodge', label: 'ROLL', x: VW - rw - 4, y: VH - rh - 4, w: rw, h: rh };
    const cd = p.dodgeCd > 0 ? Math.min(1, p.dodgeCd / (DODGE.time + DODGE.cd)) : 0;
    drawSquishButton(ctx, rb.x, rb.y, rb.w, rb.h, rb.label, {
      hover: inButton(rb), press: pressAmount('hud_dodge'),
      cooldown: cd, tone: cd ? null : 'accent',
    });
    G.ui.hudButtons.push(rb);
    drawQuickBar(ctx, p, touch);
  }

  drawStatusPips(ctx, p);

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

// --- quick slots -------------------------------------------------------
// Three pockets along the bottom-left: 1/2/3 on a keyboard, or tap them.
// They share one cooldown, drawn as a wipe across all three.

function drawQuickBar(ctx, p, touch) {
  const q = quickSlots();
  const s = touch ? 22 : 18, gap = 3;
  const y = VH - s - 4;
  const cd = p.useCd > 0 ? Math.min(1, p.useCd / USE_CD) : 0;
  for (let i = 0; i < q.length; i++) {
    const x = 4 + i * (s + gap);
    const b = { id: 'quick' + i, x, y, w: s, h: s };
    const id = q[i];
    const n = id ? countItem(id) : 0;
    const hover = inButton(b);
    ctx.fillStyle = 'rgba(10,8,22,0.78)';
    roundRect(ctx, x, y, s, s, 4); ctx.fill();
    if (id && n) {
      drawAnim(ctx, ITEMS[id].icon, 0, x + (s - 16) / 2, y + (s - 16) / 2);
      drawText(ctx, '' + n, x + s - 8, y + s - 2, '#ffffff');
    }
    if (cd > 0) {
      ctx.save();
      roundRect(ctx, x, y, s, s, 4); ctx.clip();
      ctx.fillStyle = 'rgba(8,7,18,0.6)';
      ctx.fillRect(x, y, s, s * cd);
      ctx.restore();
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = hover && id && n ? '#feae34' : 'rgba(90,105,136,0.55)';
    roundRect(ctx, x + 0.5, y + 0.5, s - 1, s - 1, 4); ctx.stroke();
    const pr = pressAmount('hud_quick' + i);
    if (pr > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = pr / BTN_PRESS * 0.5;
      ctx.fillStyle = '#fee761';
      roundRect(ctx, x, y, s, s, 4); ctx.fill();
      ctx.restore();
    }
    drawText(ctx, '' + (i + 1), x + 2, y + 7, '#8b9bb4');
    G.ui.hudButtons.push(b);
  }
}

// Small badges for temporary states, above the quick bar.
function drawStatusPips(ctx, p) {
  const pips = [];
  if (p.poison > 0) pips.push(['PSN', '#63c74d', p.poison]);
  if (p.hasteT > 0) pips.push(['SWIFT', '#2ce8f5', p.hasteT]);
  if (p.poisonWard > 0) pips.push(['WARD', '#c0cbdc', p.poisonWard]);
  let y = VH - (G.mode === 'play' ? 30 : 8);
  for (const [label, color, t] of pips) {
    const w = label.length * 5 + 8;
    ctx.fillStyle = 'rgba(10,8,22,0.72)';
    roundRect(ctx, 4, y - 8, w, 10, 3); ctx.fill();
    ctx.globalAlpha = t < 3 && Math.floor(G.time * 6) % 2 ? 0.45 : 1;
    drawText(ctx, label, 8, y, color);
    ctx.globalAlpha = 1;
    y -= 12;
  }
}

// --- danger --------------------------------------------------------------
// Low health takes over the screen: a red pulse on every heartbeat, and at
// the last sliver the beat quickens, the colour drains out and the music
// pulls back.

export function updateDanger(dt) {
  const p = G.player;
  const D = G.ui.danger || (G.ui.danger = { beat: 0, pulse: 0, level: 0 });
  if (!p) { D.level = 0; D.pulse = 0; duckMusic(1); return; }
  const frac = p.maxHp ? p.hp / p.maxHp : 1;
  const alive = G.mode === 'play' || G.mode === 'dialogue';
  D.level = !alive || p.hp <= 0 ? 0 : (p.hp <= 2 || frac <= 0.12) ? 2 : frac <= 0.35 ? 1 : 0;
  if (D.level) {
    D.beat -= dt;
    if (D.beat <= 0) {
      D.beat = D.level === 2 ? 0.6 : 1.0;
      D.pulse = 1;
      sfx('heartbeat');
    }
  } else {
    D.beat = 0;
  }
  D.pulse = Math.max(0, D.pulse - dt * 2.4);
  duckMusic(D.level === 2 ? 0.45 : 1);
}

export function drawDanger(ctx) {
  const D = G.ui.danger;
  if (!D || !D.level) return;
  if (D.level === 2) {                    // colour drains first...
    ctx.save();
    ctx.globalCompositeOperation = 'saturation';
    ctx.globalAlpha = 0.5 + D.pulse * 0.2;
    ctx.fillStyle = 'hsl(0,0%,50%)';
    ctx.fillRect(0, 0, VW, VH);
    ctx.restore();
  }
  const base = D.level === 2 ? 0.40 : 0.16;   // ...so the red still reads
  const a = base + D.pulse * (D.level === 2 ? 0.34 : 0.20);
  const g = ctx.createRadialGradient(
    VW / 2, VH / 2, Math.min(VW, VH) * (0.30 - D.pulse * 0.07),
    VW / 2, VH / 2, Math.max(VW, VH) * 0.66);
  g.addColorStop(0, 'rgba(228,59,68,0)');
  g.addColorStop(1, `rgba(190,22,34,${a})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VW, VH);
}

// --- screens -----------------------------------------------------------

import { setMusicEnabled } from './audio.js';

function titleOptions(st) {
  const opts = st.hasSave ? ['Continue', 'New Game'] : ['New Game'];
  opts.push('Music: ' + (G.musicOn ? 'On' : 'Off'));
  return opts;
}

// Shrink a line until it fits the available width.
function fitFont(ctx, text, size, maxW, minSize = 8) {
  while (size > minSize) {
    ctx.font = size + 'px "Jacquard 12"';
    if (ctx.measureText(text).width <= maxW) break;
    size--;
  }
  return size;
}

// The title screen is a measured vertical stack - title, subtitle, menu -
// scaled down until the whole block fits the viewport and centred as a
// unit. Sizing off width alone made short landscape windows overlap the
// subtitle with the menu and push the last option off the bottom.
function titleLayout(ctx, opts) {
  const availW = VW - 24;
  const availH = VH - 14;
  let size = fitFont(ctx, 'Emberdale', Math.min(46, Math.round(VW * 0.20)), availW, 13);

  for (;;) {
    const subSize = Math.max(7, Math.round(size * 0.38));
    let menuSize = Math.max(8, Math.round(size * 0.40));
    for (const o of opts) menuSize = fitFont(ctx, o, menuSize, availW - 40, 7);
    const rowH = Math.round(menuSize * 1.55);
    const gapSub = Math.round(size * 0.22);
    const gapMenu = Math.round(size * 0.6);
    const total = size + gapSub + subSize + gapMenu + opts.length * rowH;

    if (total <= availH || size <= 13) {
      const top = Math.max(4, Math.round((VH - total) * 0.42));
      ctx.font = menuSize + 'px "Jacquard 12"';
      let bw = 0;
      for (const o of opts) bw = Math.max(bw, ctx.measureText(o).width);
      bw = Math.min(VW - 16, Math.ceil(bw + menuSize * 1.9));
      const bh = Math.max(11, Math.round(rowH * 0.84));
      const menuTop = top + size + gapSub + subSize + gapMenu;
      return {
        titleSize: size, subSize, menuSize, rowH,
        titleY: top + size,
        subY: top + size + gapSub + subSize,
        btns: opts.map((o, i) => ({
          label: o, w: bw, h: bh,
          x: Math.round((VW - bw) / 2),
          y: Math.round(menuTop + i * rowH),
        })),
      };
    }
    size--;
  }
}

export function updateTitle() {
  const st = G.ui.title;
  const opts = titleOptions(st);
  if (input.pressed.up) { st.sel = (st.sel + opts.length - 1) % opts.length; sfx('menu'); }
  if (input.pressed.down) { st.sel = (st.sel + 1) % opts.length; sfx('menu'); }
  let activate = input.pressed.interact || input.pressed.attack;
  const L = titleLayout(G.ctx, opts);
  L.btns.forEach((b, i) => {
    if (inButton(b)) {
      if (st.sel !== i) { st.sel = i; sfx('menu'); }
      if (input.mouse.clicked) activate = true;
    }
  });
  if (activate) {
    pressKey('title_' + st.sel);
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
  ctx.fillStyle = '#181425';
  ctx.fillText('a tiny action rpg', VW / 2 + 1, L.subY + 1);
  ctx.fillStyle = '#8b9bb4';
  ctx.fillText('a tiny action rpg', VW / 2, L.subY);

  ctx.textAlign = 'left';
  G.ui.titleButtons = L.btns;
  L.btns.forEach((b, i) => {
    drawSquishButton(ctx, b.x, b.y, b.w, b.h, b.label, {
      selected: st.sel === i,
      hover: inButton(b),
      press: pressAmount('title_' + i),
      font: L.menuSize + 'px "Jacquard 12"',
      size: L.menuSize,
      tone: st.sel === i ? 'accent' : null,
    });
  });
}

function pauseOptions() {
  return ['Resume', G.muted ? 'Unmute' : 'Mute',
          'Music: ' + (G.musicOn ? 'On' : 'Off'), 'Restart (new game)'];
}

function pauseLayout(opts) {
  const bh = 15, gap = 4;
  const pw = Math.min(146, VW - 12);
  const ph = 28 + opts.length * (bh + gap) + 4;
  const px = Math.round((VW - pw) / 2), py = Math.round((VH - ph) / 2);
  const bw = pw - 22;
  return {
    px, py, pw, ph,
    btns: opts.map((o, i) => ({
      label: o, x: px + 11, y: py + 26 + i * (bh + gap), w: bw, h: bh,
    })),
  };
}

export function updatePause() {
  const st = G.ui.pause;
  const opts = pauseOptions();
  if (st.sel >= opts.length) st.sel = 0;
  if (input.pressed.up) { st.sel = (st.sel + opts.length - 1) % opts.length; sfx('menu'); }
  if (input.pressed.down) { st.sel = (st.sel + 1) % opts.length; sfx('menu'); }
  if (input.pressed.pause) return 'Resume';
  let activate = input.pressed.interact || input.pressed.attack;
  const L = pauseLayout(opts);
  L.btns.forEach((b, i) => {
    if (inButton(b)) {
      if (st.sel !== i) { st.sel = i; sfx('menu'); }
      if (input.mouse.clicked) activate = true;
    }
  });
  if (activate) {
    pressKey('pause_' + st.sel);
    sfx('menu');
    const o = opts[st.sel];
    if (o.startsWith('Music')) { setMusicEnabled(!G.musicOn); return null; }
    return o;
  }
  return null;
}

export function drawPause(ctx) {
  ctx.fillStyle = 'rgba(24,20,37,0.7)';
  ctx.fillRect(0, 0, VW, VH);
  const st = G.ui.pause;
  const opts = pauseOptions();
  const L = pauseLayout(opts);
  drawPanel(ctx, L.px, L.py, L.pw, L.ph);
  drawBigText(ctx, 'PAUSED', VW / 2, L.py + 18, '#feae34');
  G.ui.pauseButtons = L.btns;
  L.btns.forEach((b, i) => {
    drawSquishButton(ctx, b.x, b.y, b.w, b.h, b.label, {
      selected: st.sel === i,
      hover: inButton(b),
      press: pressAmount('pause_' + i),
      tone: st.sel === i ? 'accent' : null,
    });
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
