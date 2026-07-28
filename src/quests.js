// Quest definitions, progress tracking, and the quest log UI.

import { G, VW, VH, TILE } from './state.js';
import { input } from './input.js';
import { sfx } from './audio.js';
import { drawPanel, drawText, drawTextC, drawHeading } from './ui.js';

export const QUESTS = {
  q_slimes: {
    name: 'Pest Control', giver: 'Elder Rowan', main: true,
    desc: 'Slay 5 slimes in the western fields.',
    kill: 'slime', need: 5, at: { map: 'overworld', x: 10, y: 20 },
    reward: { gold: 30, items: ['potion'], xp: 10 },
  },
  q_letter: {
    name: 'A Sealed Letter', giver: 'Elder Rowan', main: true,
    desc: 'Deliver Rowan\'s letter to Sage Mira in Ashvale, east along the road.',
    deliver: 'letter', need: 1, at: { map: 'sage_house', x: 6, y: 5 },
    reward: { gold: 20, xp: 10 },
  },
  q_herbs: {
    name: 'Moonherb Ritual', giver: 'Sage Mira', main: true,
    desc: 'Gather 3 moonherbs from the eastern forest clearings.',
    collect: 'herb', need: 3, at: { map: 'overworld', x: 34, y: 20 },
    reward: { gold: 35, items: ['potion'], xp: 15 },
  },
  q_bones: {
    name: 'Bones for a Key', giver: 'Sage Mira', main: true,
    desc: 'Bring Mira 3 old bones. Skeletons roam the north road and the crypt.',
    collect: 'bone', need: 3, at: { map: 'overworld', x: 22, y: 5 },
    reward: { gold: 25, items: ['key'], xp: 15 },
  },
  q_boss: {
    name: 'The Bone King', giver: 'Sage Mira', main: true,
    desc: 'Unlock the crypt gate, slay the Bone King, and carry the Ember Amulet back to Elder Rowan.',
    kill: 'boss', need: 1, at: { map: 'dungeon3', x: 14, y: 5 },
    reward: { gold: 200, items: ['potion_big'], xp: 60 },
  },
  q_bats: {
    name: 'Bat Trouble', giver: 'Lila',
    desc: 'Lila\'s chickens are terrified. Drive off 4 bats from the forest.',
    kill: 'bat', need: 4, at: { map: 'overworld', x: 32, y: 24 },
    reward: { gold: 40, items: ['potion'], xp: 12 },
  },
  q_gels: {
    name: 'Wobbly Snacks', giver: 'Pip',
    desc: 'Pip swears slime gel tastes like candy. Bring 2 slime gels.',
    collect: 'gel', need: 2, at: { map: 'overworld', x: 12, y: 22 },
    reward: { gold: 25, xp: 8 },
  },
};

export function isActive(id) { return G.quests[id]?.state === 'active'; }
export function isDone(id) { return G.quests[id]?.state === 'done'; }

export function startQuest(id) {
  G.quests[id] = { state: 'active', n: 0 };
  sfx('quest');
  G.banner = { text: 'New quest: ' + QUESTS[id].name, t: 2.5 };
}

export function onKill(type) {
  for (const [id, q] of Object.entries(QUESTS)) {
    if (q.kill === type && isActive(id)) {
      const st = G.quests[id];
      if (st.n < q.need) {
        st.n++;
        if (st.n >= q.need) {
          G.banner = { text: QUESTS[id].name + ': complete! Return to ' + q.giver, t: 2.5 };
          sfx('quest');
        }
      }
    }
  }
}

import { countItem, removeItem, addItem } from './inventory.js';
import { gainXp } from './combat.js';

export function questProgress(id) {
  const q = QUESTS[id], st = G.quests[id];
  if (!st) return 0;
  if (q.kill) return Math.min(q.need, st.n);
  if (q.collect || q.deliver) return Math.min(q.need, countItem(q.collect || q.deliver));
  return 0;
}

export function canTurnIn(id) {
  return isActive(id) && questProgress(id) >= QUESTS[id].need;
}

export function turnIn(id) {
  const q = QUESTS[id];
  if (q.collect || q.deliver) removeItem(q.collect || q.deliver, q.need);
  G.quests[id].state = 'done';
  const r = q.reward;
  if (r.gold) G.player.gold += r.gold;
  if (r.items) for (const it of r.items) addItem(it, 1);
  if (r.xp) gainXp(r.xp);
  sfx('quest');
  G.banner = { text: 'Quest complete: ' + q.name + '  +' + (r.gold || 0) + 'g', t: 3 };
}

// --- quest log UI ------------------------------------------------------

export function openQuests() {
  G.mode = 'quests';
  G.ui.quest = { t: 0 };
  sfx('menu');
}

export function updateQuests(dt) {
  G.ui.quest.t = Math.min(1, G.ui.quest.t + dt * 6);
  if (input.pressed.quest || input.pressed.pause || input.pressed.interact || input.mouse.clicked) {
    G.mode = 'play'; sfx('menu');
  }
}

export function drawQuests(ctx) {
  const t = G.ui.quest.t;
  ctx.save();
  ctx.translate(0, Math.round((1 - t) * -30));
  ctx.globalAlpha = t;
  const w = Math.min(220, VW - 12), h = Math.min(156, VH - 34);
  const x = Math.round((VW - w) / 2), y = Math.round((VH - h - 12) / 2);
  drawPanel(ctx, x, y, w, h);
  drawHeading(ctx, 'Quest Log', x + 10, y + 15);
  let yy = y + 28;
  const entries = Object.entries(QUESTS).filter(([id]) => G.quests[id]);
  if (!entries.length) drawText(ctx, 'No quests yet. Talk to the villagers.', x + 10, yy, '#8b9bb4');
  for (const [id, q] of entries) {
    if (yy > y + h - 18) break;
    const st = G.quests[id];
    const done = st.state === 'done';
    const color = done ? '#5a6988' : q.main ? '#fee761' : '#ffffff';
    let label = (q.main ? '* ' : '- ') + q.name;
    if (done) label += '  [done]';
    else if (q.need > 1) label += '  ' + questProgress(id) + '/' + q.need;
    else if (canTurnIn(id)) label += '  [return]';
    drawText(ctx, label, x + 10, yy, color);
    yy += 9;
    if (!done) {
      yy = drawDesc(ctx, q.desc, x + 18, yy, w - 30) + 10;
    } else yy += 2;
  }
  drawTextC(ctx, 'Q / Esc: close', VW / 2, y + h + 10, '#8b9bb4');
  ctx.restore();
  ctx.globalAlpha = 1;
}

import { drawWrapped } from './inventory.js';
function drawDesc(ctx, text, x, y, w) { return drawWrapped(ctx, text, x, y, w, '#8b9bb4'); }

// --- where the errand wants you next ------------------------------------
// The compass needs a point on the floor you are standing on: either the
// objective itself, or the doorway that leads toward it.

const NEIGHBOURS = {
  town1: ['overworld', 'store', 'elder_house'],
  store: ['town1'],
  elder_house: ['town1'],
  overworld: ['town1', 'town2', 'dungeon'],
  town2: ['overworld', 'smithy', 'sage_house'],
  smithy: ['town2'],
  sage_house: ['town2'],
  dungeon: ['overworld', 'dungeon2'],
  dungeon2: ['dungeon', 'dungeon3'],
  dungeon3: ['dungeon2'],
};

const GIVER_MAP = {
  'Elder Rowan': 'town1', 'Sage Mira': 'sage_house', 'Lila': 'town1', 'Pip': 'town1',
};
const GIVER_NPC = {
  'Elder Rowan': 'elder', 'Sage Mira': 'sage', 'Lila': 'lila', 'Pip': 'pip',
};

// Breadth-first over the map graph; returns the next map to head for.
function nextHop(from, to) {
  if (from === to) return null;
  const seen = { [from]: true };
  const queue = (NEIGHBOURS[from] || []).map(n => [n, n]);
  while (queue.length) {
    const [node, first] = queue.shift();
    if (node === to) return first;
    if (seen[node]) continue;
    seen[node] = true;
    for (const n of NEIGHBOURS[node] || []) if (!seen[n]) queue.push([n, first]);
  }
  return null;
}

// The exit on this map that heads for `dest`, in world pixels.
function exitToward(dest) {
  const hop = nextHop(G.mapName, dest);
  if (!hop) return null;
  for (const e of G.map.exits) {
    if (e.to !== hop) continue;
    return { x: (e.x + e.w / 2) * TILE, y: (e.y + e.h / 2) * TILE, color: '#8b9bb4' };
  }
  return null;
}

export function questAim() {
  // main-line quests first, then side quests, in definition order
  const ids = Object.keys(QUESTS).filter(id => isActive(id));
  ids.sort((a, b) => (QUESTS[b].main ? 1 : 0) - (QUESTS[a].main ? 1 : 0));
  for (const id of ids) {
    const q = QUESTS[id];
    // ready to hand in: head for whoever gave it
    if (canTurnIn(id)) {
      const gmap = GIVER_MAP[q.giver];
      if (!gmap) continue;
      if (gmap === G.mapName) {
        const n = G.npcs.find(n => n.id === GIVER_NPC[q.giver]);
        if (n) return { x: n.x + 8, y: n.y + 8, color: '#63c74d' };
      }
      const e = exitToward(gmap);
      if (e) return { ...e, color: '#63c74d' };
      continue;
    }
    if (!q.at) continue;
    if (q.at.map === G.mapName) {
      return { x: q.at.x * TILE + 8, y: q.at.y * TILE + 8, color: '#fee761' };
    }
    const e = exitToward(q.at.map);
    if (e) return e;
  }
  return null;
}
