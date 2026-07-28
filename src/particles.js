// Pixel particles, one-shot sprite effects, floating texts.

import { G } from './state.js';
import { anim, drawAnim } from './assets.js';

export function spawnPix(x, y, color, n, spread, life, gravity = 0) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = Math.random() * spread;
    G.particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      g: gravity, life, maxLife: life, color, size: Math.random() < 0.3 ? 2 : 1,
    });
  }
}

export function sparkle(x, y, n, color) {
  for (let i = 0; i < n; i++) {
    G.particles.push({
      x: x + (Math.random() - 0.5) * 14, y: y + (Math.random() - 0.5) * 12,
      vx: 0, vy: -14 - Math.random() * 12, g: 0,
      life: 0.4 + Math.random() * 0.3, maxLife: 0.7, color, size: 1, twinkle: true,
    });
  }
}

export function dust(x, y) {
  G.particles.push({
    x: x + (Math.random() - 0.5) * 6, y,
    vx: (Math.random() - 0.5) * 10, vy: -6 - Math.random() * 6, g: 0,
    life: 0.3, maxLife: 0.3, color: '#c2856966', size: 1,
  });
}

// one-shot sprite animation (death bursts)
export function spawnEffect(name, x, y) {
  G.particles.push({ effect: name, x, y, life: 0.28, maxLife: 0.28 });
}

export function addFloat(text, x, y, color, big = false) {
  G.floats.push({ text, x, y, t: big ? 1.1 : 0.8, color, big });
}

export function updateParticles(dt) {
  for (let i = G.particles.length - 1; i >= 0; i--) {
    const p = G.particles[i];
    p.life -= dt;
    if (p.life <= 0) { G.particles.splice(i, 1); continue; }
    if (!p.effect) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += (p.g || 0) * dt;
    }
  }
  for (let i = G.floats.length - 1; i >= 0; i--) {
    const f = G.floats[i];
    f.t -= dt;
    f.y -= 18 * dt;
    if (f.t <= 0) G.floats.splice(i, 1);
  }
}

export function drawParticles(ctx) {
  for (const p of G.particles) {
    if (p.effect) {
      const a = anim(p.effect);
      const fi = Math.min(a.frames - 1, Math.floor((1 - p.life / p.maxLife) * a.frames));
      drawAnim(ctx, p.effect, fi, p.x - G.cam.x, p.y - G.cam.y);
    } else {
      if (p.twinkle && Math.floor(p.life * 20) % 2) continue;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x - G.cam.x), Math.round(p.y - G.cam.y), p.size, p.size);
    }
  }
}

export function drawFloats(ctx) {
  ctx.font = '7px monospace';
  ctx.textAlign = 'center';
  for (const f of G.floats) {
    ctx.globalAlpha = Math.min(1, f.t * 3);
    ctx.font = f.big ? 'bold 9px monospace' : '7px monospace';
    ctx.fillStyle = '#181425';
    ctx.fillText(f.text, Math.round(f.x - G.cam.x) + 1, Math.round(f.y - G.cam.y) + 1);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, Math.round(f.x - G.cam.x), Math.round(f.y - G.cam.y));
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}
