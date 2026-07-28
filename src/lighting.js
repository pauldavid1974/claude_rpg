// Atmosphere: contact shadows, a per-area light layer with flickering
// torch pools, colour grading and vignette.

import { G, VW, VH, TILE } from './state.js';

// Per-area mood. `dark` is the ambient shade laid over the scene, `warm`
// the strength of the additive glow around lights, `player` the radius of
// the light the player carries (0 = none).
const MOOD = {
  overworld:   { dark: 'rgba(16,20,48,0.14)', warm: 0.30, vignette: 0.30, player: 0,  grade: 'rgba(255,206,140,0.055)' },
  town1:       { dark: 'rgba(24,18,44,0.16)', warm: 0.42, vignette: 0.32, player: 0,  grade: 'rgba(255,196,120,0.075)' },
  town2:       { dark: 'rgba(24,18,44,0.16)', warm: 0.42, vignette: 0.32, player: 0,  grade: 'rgba(255,196,120,0.075)' },
  store:       { dark: 'rgba(14,10,28,0.50)', warm: 0.55, vignette: 0.42, player: 34, grade: 'rgba(255,186,110,0.10)' },
  smithy:      { dark: 'rgba(14,10,28,0.52)', warm: 0.60, vignette: 0.42, player: 34, grade: 'rgba(255,170,90,0.12)' },
  elder_house: { dark: 'rgba(14,10,28,0.50)', warm: 0.55, vignette: 0.42, player: 34, grade: 'rgba(255,186,110,0.10)' },
  sage_house:  { dark: 'rgba(14,12,32,0.50)', warm: 0.50, vignette: 0.42, player: 34, grade: 'rgba(190,200,255,0.08)' },
  dungeon:     { dark: 'rgba(4,6,20,0.88)',   warm: 0.62, vignette: 0.52, player: 58, grade: 'rgba(120,150,255,0.05)' },
};
const DEFAULT_MOOD = MOOD.overworld;

// The crypt floors share the entry hall's mood.
MOOD.dungeon2 = MOOD.dungeon;
MOOD.dungeon3 = MOOD.dungeon;

// --- day and night -------------------------------------------------------
// A slow cycle over the outdoor maps: bright noon, a long amber evening, a
// blue night that never gets dark enough to lose the player.  Interiors and
// the crypt ignore it.

export const DAY_LENGTH = 360;    // seconds for a full turn

// 0 = dawn, 0.25 = noon, 0.5 = dusk, 0.75 = midnight
export function dayPhase() {
  return ((G.time % DAY_LENGTH) / DAY_LENGTH + 0.12) % 1;
}

export function isNight() {
  const p = dayPhase();
  return p > 0.56 || p < 0.04;
}

// How much extra shade the sky is throwing, 0..1.
function nightAmount() {
  const p = dayPhase();
  // ramp down into dusk, hold, ramp back up at dawn
  if (p < 0.06) return 1 - p / 0.06;
  if (p < 0.44) return 0;
  if (p < 0.58) return (p - 0.44) / 0.14;
  if (p < 0.94) return 1;
  return 1 - (p - 0.94) / 0.06;
}

const OUTDOOR = { overworld: 1, town1: 1, town2: 1 };

function moodFor(name) {
  const base = MOOD[name] || DEFAULT_MOOD;
  if (!OUTDOOR[name]) return base;
  const n = nightAmount();
  if (n <= 0.001) return base;
  return {
    ...base,
    dark: `rgba(14,18,52,${(0.14 + 0.40 * n).toFixed(3)})`,
    warm: base.warm + 0.35 * n,
    vignette: base.vignette + 0.12 * n,
    player: base.player + 40 * n,
    grade: n > 0.5 ? `rgba(140,170,255,${(0.05 * n).toFixed(3)})` : base.grade,
  };
}

let lm = null, lctx = null;

function ensureLayer() {
  if (!lm || lm.width !== VW || lm.height !== VH) {
    lm = document.createElement('canvas');
    lm.width = VW; lm.height = VH;
    lctx = lm.getContext('2d');
  }
}

// Crisp pixel ellipse — no anti-aliased edges to spoil the pixel art.
export function pixelEllipse(ctx, cx, cy, rx, ry, color) {
  ctx.fillStyle = color;
  const iy = Math.round(ry);
  for (let y = -iy; y <= iy; y++) {
    const k = 1 - (y / ry) * (y / ry);
    if (k <= 0) continue;
    const w = Math.round(rx * Math.sqrt(k));
    if (w <= 0) continue;
    ctx.fillRect(Math.round(cx) - w, Math.round(cy) + y, w * 2, 1);
  }
}

// Contact shadow under an entity, sized to its footprint.
export function drawShadow(ctx, cx, cy, rx, ry = rx * 0.42, alpha = 0.28) {
  pixelEllipse(ctx, cx, cy, rx, ry, `rgba(10,8,20,${alpha})`);
}

function torchLights(cx, cy) {
  const lights = [];
  const t = G.time;
  for (const pr of G.map.props) {
    if (pr.type !== 'torch') continue;
    const x = pr.x * TILE + 8 - cx, y = pr.y * TILE + 7 - cy;
    if (x < -80 || y < -80 || x > VW + 80 || y > VH + 80) continue;
    // two out-of-phase waves keep the flicker from looking like a pulse
    const f = 1 + Math.sin(t * 9 + pr.x * 1.7) * 0.05 + Math.sin(t * 21.3 + pr.y) * 0.03;
    lights.push({ x, y, r: 52 * f, color: [255, 186, 92] });
  }
  return lights;
}

export function drawLighting(ctx, cx, cy) {
  const mood = moodFor(G.mapName);
  const lights = torchLights(cx, cy);
  if (mood.player) {
    const p = G.player;
    lights.push({
      x: p.x + 8 - cx, y: p.y + 10 - cy,
      r: mood.player * (1 + Math.sin(G.time * 3) * 0.02),
      color: [255, 226, 170], player: true,
    });
  }

  // 1. ambient shade, with light pools erased out of it
  if (mood.dark) {
    ensureLayer();
    lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, VW, VH);
    lctx.fillStyle = mood.dark;
    lctx.fillRect(0, 0, VW, VH);
    lctx.globalCompositeOperation = 'destination-out';
    for (const l of lights) {
      const g = lctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.45, 'rgba(255,255,255,0.72)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      lctx.fillStyle = g;
      lctx.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    lctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(lm, 0, 0);
  }

  // 2. additive glow so lights actually feel like they emit
  if (mood.warm) {
    ctx.globalCompositeOperation = 'lighter';
    for (const l of lights) {
      const a = (l.player ? 0.35 : 1) * mood.warm;
      const [r, gg, b] = l.color;
      const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r * 0.85);
      g.addColorStop(0, `rgba(${r},${gg},${b},${0.30 * a})`);
      g.addColorStop(0.5, `rgba(${r},${gg},${b},${0.10 * a})`);
      g.addColorStop(1, `rgba(${r},${gg},${b},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

// Screen-space finish: colour grade then vignette.
export function drawGrade(ctx) {
  const mood = moodFor(G.mapName);
  if (mood.grade) {
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = mood.grade;
    ctx.fillRect(0, 0, VW, VH);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (mood.vignette) {
    const r = Math.hypot(VW, VH) / 2;
    const g = ctx.createRadialGradient(VW / 2, VH / 2, r * 0.42, VW / 2, VH / 2, r);
    g.addColorStop(0, 'rgba(8,6,18,0)');
    g.addColorStop(1, `rgba(8,6,18,${mood.vignette})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);
  }
}
