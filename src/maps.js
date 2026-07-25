// World maps.  Grids are built programmatically: grass base + carved
// features.  Chars: . , : ; grass family | p path | w water | t tree
// r rock | W wall | U dungeon wall | V wood wall | R b roofs
// F wood floor | S stone floor | D door.

import { TILE } from './state.js';

const GRASS = new Set(['.', ',', ':', ';', 't', 'r']);
const SOLID = new Set(['t', 'r', 'w', 'W', 'U', 'V', 'R', 'b',
                       '[', ']', '{', '}', '=', '_', 'O']);

// Stable per-tile hash, for picking sprite variants and decals.
function hash2(x, y, salt = 0) {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) >>> 0;
  h = (h ^ (h >>> 13)) * 1274126177 >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// deterministic rng so maps are stable across visits
function rng(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function base(w, h, ch) {
  return Array.from({ length: h }, () => Array(w).fill(ch));
}
function rect(m, x, y, w, h, ch) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
    if (m[j] && m[j][i] !== undefined) m[j][i] = ch;
  }
}
function hline(m, y, x1, x2, ch) { rect(m, Math.min(x1, x2), y, Math.abs(x2 - x1) + 1, 1, ch); }
function vline(m, x, y1, y2, ch) { rect(m, x, Math.min(y1, y2), 1, Math.abs(y2 - y1) + 1, ch); }
function border(m, ch, thick = 2) {
  const h = m.length, w = m[0].length;
  rect(m, 0, 0, w, thick, ch); rect(m, 0, h - thick, w, thick, ch);
  rect(m, 0, 0, thick, h, ch); rect(m, w - thick, 0, thick, h, ch);
}
function scatterGrass(m, seed) {
  const r = rng(seed);
  for (const row of m) for (let i = 0; i < row.length; i++) {
    if (row[i] === '.') {
      const v = r();
      if (v < 0.16) row[i] = ',';
      else if (v < 0.26) row[i] = ':';
      else if (v < 0.30) row[i] = ';';
    }
  }
}
function scatter(m, ch, region, density, seed) {
  const r = rng(seed);
  const [x, y, w, h] = region;
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
    if (m[j] && GRASS.has(m[j][i]) && m[j][i] !== 't' && r() < density) m[j][i] = ch;
  }
}
// Facade: gabled roof with slope caps, an overhanging eave, a window row
// and a wall row with the door.
function building(m, x, y, w, roof) {
  const blue = roof === 'b';
  rect(m, x, y, w, 1, roof);
  m[y][x] = blue ? '{' : '[';
  m[y][x + w - 1] = blue ? '}' : ']';
  rect(m, x, y + 1, w, 1, blue ? '_' : '=');
  rect(m, x, y + 2, w, 2, 'W');
  const door = x + Math.floor(w / 2);
  m[y + 2][door - 2] = 'O';                                   // windows flank
  m[y + 2][door + 2] = 'O';                                   // the doorway
  m[y + 3][door] = 'D';
}
// Soften the hard rectangle of border trees into a ragged treeline.
function fringe(m, seed) {
  const h = m.length, w = m[0].length;
  scatter(m, 't', [1, 2, w - 2, 2], 0.4, seed);
  scatter(m, 't', [1, h - 4, w - 2, 2], 0.4, seed + 1);
  scatter(m, 't', [2, 1, 2, h - 2], 0.4, seed + 2);
  scatter(m, 't', [w - 4, 1, 2, h - 2], 0.4, seed + 3);
}

function pond(m, cx, cy, rx, ry) {
  for (let j = cy - ry; j <= cy + ry; j++) for (let i = cx - rx; i <= cx + rx; i++) {
    const dx = (i - cx) / rx, dy = (j - cy) / ry;
    if (dx * dx + dy * dy <= 1 && m[j] && m[j][i] !== undefined) m[j][i] = 'w';
  }
  // Drop single-tile spurs so the bank reads as a smooth curve.
  for (let pass = 0; pass < 2; pass++) {
    const doomed = [];
    for (let j = cy - ry - 1; j <= cy + ry + 1; j++) {
      for (let i = cx - rx - 1; i <= cx + rx + 1; i++) {
        if (!m[j] || m[j][i] !== 'w') continue;
        let n = 0;
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (m[j + oy] && m[j + oy][i + ox] === 'w') n++;
        }
        if (n < 2) doomed.push([i, j]);
      }
    }
    for (const [i, j] of doomed) m[j][i] = '.';
  }
}

// ---------------------------------------------------------------------------

function overworld() {
  const m = base(44, 32, '.');
  border(m, 't');
  pond(m, 10, 8, 5, 3);
  // forest: south-east
  scatter(m, 't', [24, 18, 18, 12], 0.42, 77);
  scatter(m, 't', [28, 4, 14, 10], 0.25, 78);
  scatter(m, 'r', [2, 2, 40, 28], 0.02, 79);
  // roads: west gate -> crossroads -> east gate, north spur to crypt
  hline(m, 15, 0, 21, 'p');
  hline(m, 15, 21, 43, 'p');
  vline(m, 21, 0, 15, 'p');
  vline(m, 22, 0, 15, 'p');
  hline(m, 16, 0, 2, 'p'); hline(m, 16, 41, 43, 'p');
  // clearings so quest spots stay reachable
  rect(m, 30, 24, 5, 4, '.'); rect(m, 26, 6, 4, 3, '.');
  rect(m, 36, 8, 4, 3, '.'); rect(m, 33, 19, 3, 3, '.');
  fringe(m, 41);
  scatter(m, 't', [24, 18, 18, 12], 0.10, 88);   // thicken the deep forest
  scatterGrass(m, 5);
  return {
    music: 'overworld',
    grid: m,
    exits: [
      { x: 0, y: 14, w: 1, h: 4, to: 'town1', tx: 23, ty: 8 },
      { x: 43, y: 14, w: 1, h: 4, to: 'town2', tx: 2, ty: 8 },
      { x: 20, y: 0, w: 4, h: 1, to: 'dungeon', tx: 17, ty: 23 },
    ],
    npcs: [],
    monsters: [
      { type: 'slime', x: 8, y: 18 }, { type: 'slime', x: 12, y: 22 },
      { type: 'slime', x: 6, y: 25 }, { type: 'slime', x: 15, y: 19 },
      { type: 'slime', x: 10, y: 12 }, { type: 'slime', x: 17, y: 26 },
      { type: 'bat', x: 30, y: 20 }, { type: 'bat', x: 34, y: 25 },
      { type: 'bat', x: 28, y: 27 }, { type: 'bat', x: 38, y: 22 },
      { type: 'archer', x: 31, y: 8 }, { type: 'archer', x: 37, y: 12 },
      { type: 'skeleton', x: 19, y: 6 }, { type: 'skeleton', x: 25, y: 4 },
      { type: 'brute', x: 32, y: 25 },
    ],
    props: [
      { type: 'sign', x: 23, y: 14, text: 'W: Emberdale   E: Ashvale\nN: the Old Crypt. Beware.' },
      { type: 'sign', x: 2, y: 13, text: 'Emberdale, home of\nElder Rowan.' },
      { type: 'chest', id: 'ow_forest', x: 32, y: 26, loot: { gold: 40, items: ['potion'] } },
      { type: 'chest', id: 'ow_pond', x: 4, y: 4, loot: { gold: 15, items: ['gel'] } },
    ],
    pickups: [
      { id: 'herb1', item: 'herb', x: 27, y: 7 },
      { id: 'herb2', item: 'herb', x: 37, y: 9 },
      { id: 'herb3', item: 'herb', x: 34, y: 20 },
    ],
  };
}

function town1() {
  const m = base(26, 18, '.');
  border(m, 't');
  building(m, 3, 2, 6, 'R');    // general store, door (6,5)
  building(m, 15, 2, 6, 'b');   // elder's house, door (18,5)
  vline(m, 6, 6, 8, 'p');
  vline(m, 18, 6, 8, 'p');
  hline(m, 8, 3, 25, 'p');
  hline(m, 8, 24, 25, 'p');
  fringe(m, 61);
  scatterGrass(m, 9);
  return {
    music: 'town',
    grid: m,
    exits: [
      { x: 25, y: 7, w: 1, h: 3, to: 'overworld', tx: 2, ty: 15 },
      { x: 6, y: 5, w: 1, h: 1, to: 'store', tx: 6, ty: 7 },
      { x: 18, y: 5, w: 1, h: 1, to: 'elder_house', tx: 6, ty: 7 },
    ],
    npcs: [
      { id: 'elder', sprite: 'npc_elder', name: 'Elder Rowan', x: 16, y: 7, wander: 0 },
      { id: 'lila', sprite: 'npc_woman', name: 'Lila', x: 9, y: 10, wander: 1 },
      { id: 'pip', sprite: 'npc_kid', name: 'Pip', x: 13, y: 14, wander: 1 },
    ],
    monsters: [],
    props: [
      { type: 'sign', x: 8, y: 6, text: 'General Store\nPotions and provisions.' },
      { type: 'sign', x: 20, y: 6, text: "Elder Rowan's house." },
      { type: 'torch', x: 5, y: 5 }, { type: 'torch', x: 7, y: 5 },
      { type: 'barrel', x: 3, y: 6 },
    ],
    pickups: [],
  };
}

function town2() {
  const m = base(26, 18, '.');
  border(m, 't');
  building(m, 4, 2, 6, 'b');    // sage's house, door (7,5)
  building(m, 16, 2, 6, 'R');   // blacksmith, door (19,5)
  vline(m, 7, 6, 8, 'p');
  vline(m, 19, 6, 8, 'p');
  hline(m, 8, 0, 22, 'p');
  hline(m, 8, 0, 1, 'p');
  rect(m, 11, 12, 3, 2, 'w');   // little well pond
  fringe(m, 71);
  scatterGrass(m, 11);
  return {
    music: 'town',
    grid: m,
    exits: [
      { x: 0, y: 7, w: 1, h: 3, to: 'overworld', tx: 41, ty: 15 },
      { x: 7, y: 5, w: 1, h: 1, to: 'sage_house', tx: 6, ty: 7 },
      { x: 19, y: 5, w: 1, h: 1, to: 'smithy', tx: 6, ty: 7 },
    ],
    npcs: [
      { id: 'bram', sprite: 'npc_smith', name: 'Bram', x: 21, y: 7, wander: 0 },
      { id: 'kid2', sprite: 'npc_kid', name: 'Nell', x: 10, y: 11, wander: 1 },
    ],
    monsters: [],
    props: [
      { type: 'sign', x: 9, y: 6, text: "Sage Mira's house.\nKnock softly." },
      { type: 'sign', x: 17, y: 6, text: "Bram's Smithy\nSteel worth your gold." },
      { type: 'torch', x: 18, y: 5 }, { type: 'torch', x: 20, y: 5 },
      { type: 'barrel', x: 22, y: 6 }, { type: 'barrel', x: 3, y: 9 },
    ],
    pickups: [],
  };
}

function interior(kind) {
  const floor = kind === 'smithy' ? 'S' : 'F';
  const wall = kind === 'smithy' ? 'U' : 'V';
  const m = base(13, 9, floor);
  border(m, wall, 1);
  m[8][6] = 'D';
  return m;
}

function store() {
  const m = interior('store');
  return {
    music: 'town', grid: m,
    exits: [{ x: 6, y: 8, w: 1, h: 1, to: 'town1', tx: 6, ty: 6 }],
    npcs: [{ id: 'shopkeep', sprite: 'npc_woman', name: 'Marla', x: 6, y: 2, wander: 0, shop: 'general' }],
    monsters: [],
    props: [
      { type: 'barrel', x: 1, y: 1 }, { type: 'barrel', x: 2, y: 1 },
      { type: 'torch', x: 4, y: 1 }, { type: 'torch', x: 8, y: 1 },
    ],
    pickups: [],
  };
}

function smithy() {
  const m = interior('smithy');
  return {
    music: 'town', grid: m,
    exits: [{ x: 6, y: 8, w: 1, h: 1, to: 'town2', tx: 19, ty: 6 }],
    npcs: [{ id: 'smith2', sprite: 'npc_smith', name: 'Edda', x: 6, y: 2, wander: 0, shop: 'blacksmith' }],
    monsters: [],
    props: [
      { type: 'torch', x: 2, y: 1 }, { type: 'torch', x: 10, y: 1 },
      { type: 'barrel', x: 10, y: 6 },
    ],
    pickups: [],
  };
}

function elderHouse() {
  const m = interior('elder_house');
  return {
    music: 'town', grid: m,
    exits: [{ x: 6, y: 8, w: 1, h: 1, to: 'town1', tx: 18, ty: 6 }],
    npcs: [],
    monsters: [],
    props: [
      { type: 'torch', x: 3, y: 1 }, { type: 'torch', x: 9, y: 1 },
      { type: 'chest', id: 'elder_chest', x: 10, y: 2, loot: { gold: 10, items: ['potion'] } },
      { type: 'barrel', x: 2, y: 6 },
      { type: 'sign', x: 2, y: 2, text: 'Rowan keeps his notes tidy\nand his floor swept.' },
    ],
    pickups: [],
  };
}

function sageHouse() {
  const m = interior('sage_house');
  return {
    music: 'town', grid: m,
    exits: [{ x: 6, y: 8, w: 1, h: 1, to: 'town2', tx: 7, ty: 6 }],
    npcs: [{ id: 'sage', sprite: 'npc_elder', name: 'Sage Mira', x: 6, y: 3, wander: 0 }],
    monsters: [],
    props: [
      { type: 'torch', x: 2, y: 1 }, { type: 'torch', x: 10, y: 1 },
      { type: 'barrel', x: 10, y: 6 },
      { type: 'sign', x: 2, y: 3, text: 'Shelves of dried herbs\nand older secrets.' },
    ],
    pickups: [],
  };
}

function dungeon() {
  const m = base(36, 26, 'U');
  rect(m, 14, 18, 8, 7, 'S');            // entry hall
  rect(m, 4, 14, 10, 8, 'S');            // west room
  rect(m, 22, 12, 10, 9, 'S');           // east room
  rect(m, 6, 3, 10, 8, 'S');             // northwest room
  rect(m, 14, 6, 12, 3, 'S');            // north corridor
  rect(m, 17, 3, 6, 12, 'S');            // boss approach
  rect(m, 13, 2, 10, 8, 'S');            // boss room
  rect(m, 14, 14, 8, 5, 'S');            // link entry->approach
  hline(m, 16, 8, 16, 'S'); hline(m, 17, 8, 16, 'S');
  hline(m, 14, 24, 28, 'S'); hline(m, 15, 24, 28, 'S');
  vline(m, 10, 10, 14, 'S'); vline(m, 11, 10, 14, 'S');
  rect(m, 17, 22, 2, 4, 'S');            // entrance passage south
  return {
    music: 'danger', grid: m,
    exits: [{ x: 16, y: 25, w: 4, h: 1, to: 'overworld', tx: 21, ty: 2 }],
    npcs: [],
    monsters: [
      { type: 'skeleton', x: 8, y: 17 }, { type: 'skeleton', x: 10, y: 20 },
      { type: 'skeleton', x: 26, y: 15 }, { type: 'skeleton', x: 24, y: 19 },
      { type: 'bat', x: 16, y: 20 }, { type: 'bat', x: 28, y: 13 },
      { type: 'bat', x: 8, y: 6 },
      { type: 'archer', x: 12, y: 5 }, { type: 'archer', x: 29, y: 18 },
      { type: 'brute', x: 9, y: 8 }, { type: 'brute', x: 19, y: 12 },
      { type: 'boss', x: 17, y: 4 },
    ],
    props: [
      { type: 'torch', x: 15, y: 17 }, { type: 'torch', x: 20, y: 17 },
      { type: 'torch', x: 16, y: 9 }, { type: 'torch', x: 21, y: 9 },
      { type: 'torch', x: 13, y: 1 }, { type: 'torch', x: 22, y: 1 },
      { type: 'gate', id: 'crypt_gate', x: 19, y: 10 }, { type: 'gate', id: 'crypt_gate2', x: 20, y: 10 },
      { type: 'chest', id: 'dg_chest', x: 5, y: 15, loot: { gold: 60, items: ['potion_big'] } },
      { type: 'sign', x: 18, y: 21, text: 'Turn back. The Bone King\ndoes not share his hall.' },
    ],
    pickups: [],
  };
}

const BUILDERS = {
  overworld, town1, town2, store, smithy,
  elder_house: elderHouse, sage_house: sageHouse, dungeon,
};

// ---------------------------------------------------------------------------
// Autotiling + collision + render info.

const TILE_SPRITES = {
  '.': 'grass_1', ',': 'grass_2', ':': 'grass_3', ';': 'grass_flowers',
  'F': 'floor_wood', 'S': 'floor_stone', 'D': 'door',
  'W': 'wall_stone', 'U': 'wall_dungeon', 'V': 'wall_wood', 'O': 'wall_window',
  'R': 'roof_red', 'b': 'roof_blue',
  '[': 'roof_red_l', ']': 'roof_red_r', '=': 'roof_eave',
  '{': 'roof_blue_l', '}': 'roof_blue_r', '_': 'roof_eave_blue',
};
const OVERLAYS = { 'r': 'stone' };
const TREES = ['tree', 'tree', 'tree', 'tree_pine', 'tree_pine', 'tree_small', 'bush'];

// Scatter decals over open ground so large areas stop reading as tiled.
// Weighted: quiet ground cover is common, landmarks like logs are rare.
const GRASS_DECALS = [
  ['dec_tuft', 34], ['dec_pebbles', 16], ['dec_flowers_white', 16],
  ['dec_flowers_red', 8], ['dec_mushrooms', 6], ['dec_log', 3],
];
const STONE_DECALS = [['dec_cracks', 60], ['dec_rubble', 40]];

function pickWeighted(table, r) {
  const total = table.reduce((a, e) => a + e[1], 0);
  let v = r * total;
  for (const [name, w] of table) {
    v -= w;
    if (v <= 0) return name;
  }
  return table[0][0];
}

function decalFor(ch, x, y) {
  const r = hash2(x, y, 7);
  if (GRASS.has(ch) && ch !== 't' && ch !== 'r' && ch !== 'f') {
    if (r < 0.20) return pickWeighted(GRASS_DECALS, hash2(x, y, 11));
  } else if (ch === 'S') {
    if (r < 0.12) return pickWeighted(STONE_DECALS, hash2(x, y, 11));
  } else if (ch === 'p') {
    if (r < 0.06) return 'dec_pebbles';
  }
  return null;
}

function isGrassFamily(ch) { return GRASS.has(ch) || ch === undefined; }

function edgeName(prefix, plain, n, s, e, w) {
  if (n && w) return prefix + '_nw';
  if (n && e) return prefix + '_ne';
  if (s && w) return prefix + '_sw';
  if (s && e) return prefix + '_se';
  if (n) return prefix + '_n';
  if (s) return prefix + '_s';
  if (e) return prefix + '_e';
  if (w) return prefix + '_w';
  return plain;
}

export function buildMap(name) {
  const def = BUILDERS[name]();
  const grid = def.grid;
  const h = grid.length, w = grid[0].length;
  const at = (x, y) => (grid[y] && grid[y][x] !== undefined) ? grid[y][x] : undefined;
  const render = [];   // {base, overlay} per tile; names are anim names
  const solid = [];
  for (let y = 0; y < h; y++) {
    render.push([]); solid.push([]);
    for (let x = 0; x < w; x++) {
      const ch = grid[y][x];
      let base, overlay = null;
      if (ch === 'p') {
        base = edgeName('path_edge', 'path',
          isGrassFamily(at(x, y - 1)), isGrassFamily(at(x, y + 1)),
          isGrassFamily(at(x + 1, y)), isGrassFamily(at(x - 1, y)));
      } else if (ch === 'w') {
        const openWater = ['water', 'water_b', 'water_c'][Math.floor(hash2(x, y, 13) * 3)];
        base = edgeName('shore', openWater,
          isGrassFamily(at(x, y - 1)), isGrassFamily(at(x, y + 1)),
          isGrassFamily(at(x + 1, y)), isGrassFamily(at(x - 1, y)));
      } else if (ch === 't') {
        base = ['grass_1', 'grass_2', 'grass_3'][Math.floor(hash2(x, y, 3) * 3)];
        overlay = TREES[Math.floor(hash2(x, y, 5) * TREES.length)];
      } else if (OVERLAYS[ch]) {
        base = 'grass_1';
        overlay = OVERLAYS[ch];
      } else {
        base = TILE_SPRITES[ch];
      }
      // nudge scenery off the tile grid so stands of trees look planted,
      // not tiled; collision stays on the tile itself
      const ox = overlay ? Math.round(hash2(x, y, 17) * 5) - 2 : 0;
      const oy = overlay ? Math.round(hash2(x, y, 19) * 4) - 2 : 0;
      render[y].push({ base, overlay, ox, oy, decal: decalFor(ch, x, y) });
      solid[y].push(SOLID.has(ch));
    }
  }
  return {
    name, w, h,
    music: def.music,
    grid, render, solid,
    exits: def.exits, npcDefs: def.npcs, monsterDefs: def.monsters,
    props: def.props, pickupDefs: def.pickups,
  };
}

// Cell to draw beyond the map edge: same kind of ground as the nearest
// border tile, but re-rolled at the real coordinates so the surrounding
// forest keeps varying instead of repeating one row.
export function outsideCell(map, x, y) {
  const cx = Math.max(0, Math.min(map.w - 1, x));
  const cy = Math.max(0, Math.min(map.h - 1, y));
  const edge = map.render[cy][cx];
  if (!edge.overlay) return edge;
  return {
    base: ['grass_1', 'grass_2', 'grass_3'][Math.floor(hash2(x, y, 3) * 3)],
    overlay: TREES[Math.floor(hash2(x, y, 5) * TREES.length)],
    ox: Math.round(hash2(x, y, 17) * 5) - 2,
    oy: Math.round(hash2(x, y, 19) * 4) - 2,
    decal: null,
  };
}

export function isSolidAt(map, px, py) {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return true;
  return map.solid[ty][tx];
}
