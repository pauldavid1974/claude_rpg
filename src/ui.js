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

export function updateTitle() {
  const st = G.ui.title;
  const opts = st.hasSave ? ['Continue', 'New Game'] : ['New Game'];
  if (input.pressed.up || input.pressed.down) {
    st.sel = (st.sel + 1) % opts.length; sfx('menu');
  }
  if (input.pressed.interact || input.pressed.attack) {
    sfx('menu');
    return opts[st.sel];
  }
  return null;
}

export function drawTitle(ctx) {
  const st = G.ui.title;
  ctx.fillStyle = '#181425';
  ctx.fillRect(0, 0, VW, VH);
  // decorative strip of sprites
  const t = G.time;
  drawAnim(ctx, 'slime_idle', frameOf('slime_idle', t), 60, 96);
  drawAnim(ctx, 'skeleton_walk', frameOf('skeleton_walk', t), 230, 94);
  drawAnim(ctx, 'bat_fly', frameOf('bat_fly', t), 260, 60 + Math.sin(t * 2) * 4);
  drawAnim(ctx, 'player_walk_down', frameOf('player_walk_down', t), 152, 92);
  drawAnim(ctx, 'torch', frameOf('torch', t), 40, 60);
  drawAnim(ctx, 'torch', frameOf('torch', t + 0.3), 268, 92);
  drawBigText(ctx, 'E M B E R D A L E', VW / 2, 40, '#feae34');
  drawTextC(ctx, 'a tiny action rpg', VW / 2, 52, '#8b9bb4');
  const opts = st.hasSave ? ['Continue', 'New Game'] : ['New Game'];
  opts.forEach((o, i) => {
    const on = st.sel === i;
    drawTextC(ctx, (on ? '> ' : '') + o + (on ? ' <' : ''), VW / 2, 122 + i * 12, on ? '#fee761' : '#c0cbdc');
  });
  drawTextC(ctx, 'move WASD/arrows  attack Space/J  interact E/Enter', VW / 2, 152, '#5a6988');
  drawTextC(ctx, 'bag I  quests Q  pause Esc  mute M', VW / 2, 162, '#5a6988');
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
