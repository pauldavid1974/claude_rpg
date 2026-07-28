// Skill tree: levels hand out points, the player spends them.  Three
// branches, five nodes deep, each node gated behind the one above it.
// Sage Mira will unlearn the lot for coin.

import { G, VW, VH } from './state.js';
import { input } from './input.js';
import { sfx } from './audio.js';
import {
  drawPanel, drawText, drawTextC, drawHeading,
  drawSquishButton, pressKey, pressAmount, inButton,
} from './ui.js';

export const POINTS_PER_LEVEL = 2;
export const RESPEC_COST = 50;
export const BASE_MAX_HP = 10;

export const BRANCHES = [
  {
    id: 'might', name: 'Might', color: '#e43b44',
    nodes: [
      { id: 'might1', cost: 1, name: 'Keen Edge',    desc: '+1 attack.' },
      { id: 'might2', cost: 1, name: 'Heavy Hands',  desc: 'Your blows break poise 25% faster.' },
      { id: 'might3', cost: 2, name: 'Butcher',      desc: '+1 attack.' },
      { id: 'might4', cost: 2, name: 'Deep Cuts',    desc: '+10% chance to land a critical hit.' },
      { id: 'might5', cost: 3, name: 'Executioner',  desc: 'Criticals hit for two and a half times.' },
    ],
  },
  {
    id: 'vigor', name: 'Vigor', color: '#63c74d',
    nodes: [
      { id: 'vigor1', cost: 1, name: 'Hardy',        desc: '+4 max health.' },
      { id: 'vigor2', cost: 1, name: 'Thick Skin',   desc: '+1 defence.' },
      { id: 'vigor3', cost: 2, name: 'Constitution', desc: '+4 max health.' },
      { id: 'vigor4', cost: 2, name: 'Second Wind',  desc: 'Potions restore half again as much.' },
      { id: 'vigor5', cost: 3, name: 'Ironclad',     desc: '+2 defence.' },
    ],
  },
  {
    id: 'swift', name: 'Swiftness', color: '#2ce8f5',
    nodes: [
      { id: 'swift1', cost: 1, name: 'Fleet',        desc: '+8% movement speed.' },
      { id: 'swift2', cost: 1, name: 'Nimble',       desc: 'Rolls come back 25% sooner.' },
      { id: 'swift3', cost: 2, name: 'Quick Hands',  desc: 'You swing 15% faster.' },
      { id: 'swift4', cost: 2, name: 'Ghost Step',   desc: 'Rolls carry 40% more invulnerability.' },
      { id: 'swift5', cost: 3, name: 'Windrunner',   desc: '+8% speed, and pockets refill 40% faster.' },
    ],
  },
];

const NODES = {};
for (const b of BRANCHES) b.nodes.forEach((n, i) => { NODES[n.id] = { ...n, branch: b, tier: i }; });

export function owns(id) { return !!(G.player.skills && G.player.skills[id]); }

// A node opens up once the one above it in the branch is learned.
export function available(id) {
  const n = NODES[id];
  if (!n || owns(id)) return false;
  if (n.tier > 0 && !owns(n.branch.nodes[n.tier - 1].id)) return false;
  return (G.player.sp || 0) >= n.cost;
}

export function locked(id) {
  const n = NODES[id];
  return n.tier > 0 && !owns(n.branch.nodes[n.tier - 1].id);
}

export function bonuses() {
  const s = (G.player && G.player.skills) || {};
  return {
    atk:      (s.might1 ? 1 : 0) + (s.might3 ? 1 : 0),
    poise:    s.might2 ? 1.25 : 1,
    crit:     0.05 + (s.might4 ? 0.10 : 0),
    critMult: s.might5 ? 2.5 : 2,
    maxHp:    (s.vigor1 ? 4 : 0) + (s.vigor3 ? 4 : 0),
    def:      (s.vigor2 ? 1 : 0) + (s.vigor5 ? 2 : 0),
    healMult: s.vigor4 ? 1.5 : 1,
    speed:    1 + (s.swift1 ? 0.08 : 0) + (s.swift5 ? 0.08 : 0),
    dodgeCd:  1 - (s.swift2 ? 0.25 : 0),
    atkSpeed: 1 - (s.swift3 ? 0.15 : 0),
    iframes:  1 + (s.swift4 ? 0.4 : 0),
    useCd:    1 - (s.swift5 ? 0.4 : 0),
  };
}

// Max health is derived, so a respec cannot leave it stranded.
export function refreshDerived(healToFull = false) {
  const p = G.player;
  if (!p) return;
  p.maxHp = BASE_MAX_HP + bonuses().maxHp;
  if (healToFull) p.hp = p.maxHp;
  p.hp = Math.max(1, Math.min(p.hp, p.maxHp));
}

export function spentPoints() {
  let n = 0;
  for (const id in (G.player.skills || {})) if (NODES[id]) n += NODES[id].cost;
  return n;
}

export function learn(id) {
  if (!available(id)) { sfx('deny'); return false; }
  const p = G.player;
  p.skills = p.skills || {};
  p.skills[id] = true;
  p.sp -= NODES[id].cost;
  refreshDerived();
  if (NODES[id].branch.id === 'vigor') p.hp = Math.min(p.maxHp, p.hp + 4);
  sfx('upgrade');
  G.banner = { text: NODES[id].name + ' learned', t: 2 };
  return true;
}

export function respec() {
  const p = G.player;
  p.sp = (p.sp || 0) + spentPoints();
  p.skills = {};
  refreshDerived();
  sfx('levelup');
}

// --- screen --------------------------------------------------------------

export function openSkills() {
  G.mode = 'skills';
  G.ui.skills = { branch: G.ui.skills?.branch || 0, sel: 0, t: 0 };
  sfx('menu');
}

function layout() {
  const pw = Math.min(212, VW - 8);
  const ph = Math.min(150, VH - 12);
  const px = Math.round((VW - pw) / 2), py = Math.round((VH - ph) / 2);
  const tabW = Math.floor((pw - 20 - 8) / 3), tabH = 14;
  const tabs = BRANCHES.map((b, i) => ({
    label: b.name, branch: i, w: tabW, h: tabH,
    x: px + 10 + i * (tabW + 4), y: py + 20,
  }));
  const rowH = 15, gap = 3;
  const rows = [];
  for (let i = 0; i < 5; i++) {
    rows.push({ i, x: px + 10, y: py + 40 + i * (rowH + gap), w: pw - 20, h: rowH });
  }
  return { px, py, pw, ph, tabs, rows };
}

export function updateSkills(dt) {
  const st = G.ui.skills;
  st.t = Math.min(1, st.t + dt * 6);
  if (input.pressed.skills || input.pressed.pause || input.pressed.inv) {
    G.mode = 'play'; sfx('menu'); return;
  }
  const L = layout();
  const branch = BRANCHES[st.branch];
  if (input.pressed.left) { st.branch = (st.branch + 2) % 3; sfx('menu'); }
  if (input.pressed.right) { st.branch = (st.branch + 1) % 3; sfx('menu'); }
  if (input.pressed.up) { st.sel = (st.sel + 4) % 5; sfx('menu'); }
  if (input.pressed.down) { st.sel = (st.sel + 1) % 5; sfx('menu'); }
  if (input.pressed.interact) {
    if (learn(branch.nodes[st.sel].id)) pressKey('sk_' + st.sel);
  }

  for (const t of L.tabs) {
    if (!inButton(t)) continue;
    if (st.branch !== t.branch) { st.branch = t.branch; st.sel = 0; sfx('menu'); }
    if (input.mouse.clicked) pressKey('sktab_' + t.branch);
  }
  let onRow = false;
  for (const r of L.rows) {
    if (!inButton(r)) continue;
    onRow = true;
    if (st.sel !== r.i) { st.sel = r.i; sfx('menu'); }
    if (input.mouse.clicked && learn(BRANCHES[st.branch].nodes[r.i].id)) pressKey('sk_' + r.i);
  }
  if (input.mouse.clicked && !onRow &&
      (input.mouse.x < L.px || input.mouse.x > L.px + L.pw ||
       input.mouse.y < L.py || input.mouse.y > L.py + L.ph)) {
    G.mode = 'play'; sfx('menu');
  }
}

export function drawSkills(ctx) {
  const st = G.ui.skills;
  const L = layout();
  const branch = BRANCHES[st.branch];
  ctx.save();
  ctx.translate(0, Math.round((1 - st.t) * -24));
  ctx.globalAlpha = st.t;
  drawPanel(ctx, L.px, L.py, L.pw, L.ph);
  drawHeading(ctx, 'Skills', L.px + 10, L.py + 14);
  const sp = G.player.sp || 0;
  drawText(ctx, sp + ' pt' + (sp === 1 ? '' : 's'),
           L.px + L.pw - 34, L.py + 12, sp ? '#fee761' : '#5a6988');

  for (const t of L.tabs) {
    drawSquishButton(ctx, t.x, t.y, t.w, t.h, t.label, {
      selected: st.branch === t.branch, hover: inButton(t),
      press: pressAmount('sktab_' + t.branch),
      tone: st.branch === t.branch ? 'accent' : null,
    });
  }

  for (const r of L.rows) {
    const node = branch.nodes[r.i];
    const has = owns(node.id);
    const lock = locked(node.id);
    const can = available(node.id);
    // rank pip + name + cost, on a row that reads as a button when buyable
    drawSquishButton(ctx, r.x, r.y, r.w, r.h,
      '', { hover: inButton(r) && can, press: pressAmount('sk_' + r.i),
            selected: st.sel === r.i, tone: has ? 'accent' : null });
    ctx.fillStyle = has ? '#2a1c06' : lock ? '#3a4466' : branch.color;
    ctx.fillRect(r.x + 5, r.y + 5, 5, 5);
    drawText(ctx, node.name, r.x + 14, r.y + 11,
             has ? '#2a1c06' : lock ? '#5a6988' : can ? '#ffffff' : '#8b9bb4');
    drawText(ctx, has ? 'OWNED' : node.cost + 'pt', r.x + r.w - 30, r.y + 11,
             has ? '#2a1c06' : can ? '#fee761' : '#5a6988');
  }

  const node = branch.nodes[st.sel];
  const line = owns(node.id) ? node.desc
             : locked(node.id) ? 'Locked - learn ' + branch.nodes[st.sel - 1].name + ' first.'
             : node.desc;
  ctx.font = '7px monospace';
  const maxW = L.pw - 18;
  const wrapped = [];
  let cur = '';
  for (const word of line.split(' ')) {
    const test = cur ? cur + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && cur) { wrapped.push(cur); cur = word; }
    else cur = test;
  }
  if (cur) wrapped.push(cur);
  const dy = L.py + L.ph - 16 - (wrapped.length - 1) * 9;
  wrapped.forEach((w, i) => drawTextC(ctx, w, VW / 2, dy + i * 9, '#c0cbdc'));
  drawTextC(ctx, 'U / Esc: close', VW / 2, L.py + L.ph - 5, '#8b9bb4');
  ctx.restore();
  ctx.globalAlpha = 1;
}
