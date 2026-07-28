// Settings: volumes, difficulty, screen options, and a controls card.
// Everything here persists on its own so it survives a new game.

import { G, VW, VH } from './state.js';
import { input } from './input.js';
import { sfx, setMusicVolume, setSfxVolume } from './audio.js';
import {
  drawPanel, drawText, drawTextC, drawHeading,
  drawSquishButton, pressKey, pressAmount, inButton,
} from './ui.js';

const KEY = 'emberdale_settings_v1';

export const DIFFICULTY = [
  { name: 'Wanderer', taken: 0.7, hp: 0.85, desc: 'For the story. Enemies hit softer and fold sooner.' },
  { name: 'Knight',   taken: 1.0, hp: 1.0,  desc: 'The intended fight.' },
  { name: 'Warden',   taken: 1.5, hp: 1.3,  desc: 'Enemies hit hard and last. Telegraphs matter.' },
];

export const settings = {
  music: 8,        // 0-10
  sfxVol: 8,       // 0-10
  difficulty: 1,
  minimap: 1,
  shake: 1,
};

export function loadSettings() {
  try {
    Object.assign(settings, JSON.parse(localStorage.getItem(KEY) || '{}'));
  } catch (e) { /* defaults are fine */ }
  applySettings();
}

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
}

export function applySettings() {
  setMusicVolume(settings.music / 10);
  setSfxVolume(settings.sfxVol / 10);
  G.difficulty = DIFFICULTY[settings.difficulty] || DIFFICULTY[1];
  G.shakeOn = !!settings.shake;
  G.minimapOn = !!settings.minimap;
}

// --- screen --------------------------------------------------------------

const ROWS = [
  { id: 'music',      label: 'Music',      kind: 'level' },
  { id: 'sfxVol',     label: 'Effects',    kind: 'level' },
  { id: 'difficulty', label: 'Difficulty', kind: 'list', options: DIFFICULTY.map(d => d.name) },
  { id: 'minimap',    label: 'Minimap',    kind: 'toggle' },
  { id: 'shake',      label: 'Screen shake', kind: 'toggle' },
  { id: 'controls',   label: 'Controls',   kind: 'info' },
];

const CONTROLS = [
  'Move: WASD / arrows, or click where you want to go',
  'Attack: Space, or right-click. Hold past a swing to charge',
  'Roll: Shift, or the ROLL button. Pockets: 1 2 3',
  'Talk / use: E     Bag: I     Quests: Q     Skills: U',
];

export function openSettings() {
  G.mode = 'settings';
  G.ui.settings = { sel: 0, t: 0 };
  sfx('menu');
}

function layout() {
  const pw = Math.min(216, VW - 8);
  const rowH = 15, gap = 3;
  const ph = Math.min(VH - 8, 30 + ROWS.length * (rowH + gap) + 44);
  const px = Math.round((VW - pw) / 2), py = Math.round((VH - ph) / 2);
  const rows = ROWS.map((r, i) => ({
    ...r, i, x: px + 10, y: py + 26 + i * (rowH + gap), w: pw - 20, h: rowH,
  }));
  return { px, py, pw, ph, rows };
}

function valueOf(r) {
  if (r.kind === 'level') return settings[r.id] === 0 ? 'off' : settings[r.id] * 10 + '%';
  if (r.kind === 'list') return r.options[settings[r.id]];
  if (r.kind === 'toggle') return settings[r.id] ? 'on' : 'off';
  return '';
}

function nudge(r, dir) {
  if (r.kind === 'info') return false;
  if (r.kind === 'level') {
    settings[r.id] = Math.max(0, Math.min(10, settings[r.id] + dir));
  } else if (r.kind === 'list') {
    settings[r.id] = (settings[r.id] + r.options.length + dir) % r.options.length;
  } else {
    settings[r.id] = settings[r.id] ? 0 : 1;
  }
  applySettings();
  saveSettings();
  sfx('menu');
  return true;
}

export function updateSettings(dt) {
  const st = G.ui.settings;
  st.t = Math.min(1, st.t + dt * 6);
  const L = layout();
  if (input.pressed.pause || input.pressed.inv) { G.mode = 'pause'; sfx('menu'); return; }
  if (input.pressed.up) { st.sel = (st.sel + ROWS.length - 1) % ROWS.length; sfx('menu'); }
  if (input.pressed.down) { st.sel = (st.sel + 1) % ROWS.length; sfx('menu'); }
  if (input.pressed.left) nudge(L.rows[st.sel], -1);
  if (input.pressed.right) nudge(L.rows[st.sel], 1);
  if (input.pressed.interact) nudge(L.rows[st.sel], 1);

  let on = false;
  for (const r of L.rows) {
    if (!inButton(r)) continue;
    on = true;
    if (st.sel !== r.i) { st.sel = r.i; sfx('menu'); }
    if (input.mouse.clicked) {
      // clicking the left third steps down, the right third steps up
      const rel = (input.mouse.x - r.x) / r.w;
      if (nudge(r, rel < 0.55 && r.kind !== 'toggle' ? -1 : 1)) pressKey('set_' + r.i);
    }
  }
  if (input.mouse.clicked && !on &&
      (input.mouse.x < L.px || input.mouse.x > L.px + L.pw ||
       input.mouse.y < L.py || input.mouse.y > L.py + L.ph)) {
    G.mode = 'pause'; sfx('menu');
  }
}

export function drawSettings(ctx) {
  const st = G.ui.settings;
  const L = layout();
  ctx.save();
  ctx.translate(0, Math.round((1 - st.t) * -24));
  ctx.globalAlpha = st.t;
  drawPanel(ctx, L.px, L.py, L.pw, L.ph);
  drawHeading(ctx, 'Settings', L.px + 10, L.py + 15);

  for (const r of L.rows) {
    const selected = st.sel === r.i;
    drawSquishButton(ctx, r.x, r.y, r.w, r.h, '',
      { hover: inButton(r), selected, press: pressAmount('set_' + r.i) });
    drawText(ctx, r.label, r.x + 6, r.y + 11, selected ? '#ffffff' : '#c0cbdc');
    if (r.kind === 'level') {                    // ten pips, filled to level
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = i < settings[r.id] ? '#63c74d' : '#2c3454';
        ctx.fillRect(r.x + r.w - 76 + i * 5, r.y + 5, 3, 5);
      }
      drawText(ctx, valueOf(r), r.x + r.w - 24, r.y + 11, '#8b9bb4');
    } else if (r.kind !== 'info') {
      drawText(ctx, '< ' + valueOf(r) + ' >', r.x + r.w - 8 -
               (valueOf(r).length + 4) * 4.2, r.y + 11, selected ? '#fee761' : '#8b9bb4');
    }
  }

  const sel = ROWS[st.sel];
  let y = L.py + L.ph - 38;
  if (sel.id === 'controls') {
    y = L.py + L.ph - 8 - CONTROLS.length * 8;
    for (const line of CONTROLS) { drawTextC(ctx, line, VW / 2, y, '#8b9bb4'); y += 8; }
  } else {
    const hint = sel.id === 'difficulty' ? DIFFICULTY[settings.difficulty].desc
               : sel.id === 'minimap' ? 'A corner map of the floor you are on.'
               : sel.id === 'shake' ? 'Turn off if the camera jolt bothers you.'
               : 'Left and right adjust. Esc goes back.';
    drawTextC(ctx, hint, VW / 2, L.py + L.ph - 18, '#c0cbdc');
    drawTextC(ctx, 'Esc: back', VW / 2, L.py + L.ph - 7, '#8b9bb4');
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}
