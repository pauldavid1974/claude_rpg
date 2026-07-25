// A* tile pathfinding for click-to-move, with line-of-sight smoothing so
// routes read as natural walks rather than tile-center stair-steps.
//
// Coordinates here are "feet centre" world pixels: the centre of the
// player's collision box, i.e. (sprite.x + 8, sprite.y + 12).

import { G, TILE } from './state.js';
import { feetBlockedAt } from './entities.js';

export function feetCenter(e) {
  return { x: e.x + 8, y: e.y + 12 };
}

export function tileOf(x, y) {
  return { x: Math.floor(x / TILE), y: Math.floor(y / TILE) };
}

// Centre of the tile, in feet-centre space: standing here puts the whole
// collision box inside the tile.
export function tileCenter(tx, ty) {
  return { x: tx * TILE + 8, y: ty * TILE + 12 };
}

export function tileWalkable(tx, ty) {
  const map = G.map;
  if (!map || tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return false;
  if (map.solid[ty][tx]) return false;
  const c = tileCenter(tx, ty);
  return !feetBlockedAt(c.x, c.y);
}

// Nearest walkable tile to (tx, ty), searched in expanding rings.
export function nearestWalkable(tx, ty, maxR = 6) {
  if (tileWalkable(tx, ty)) return { x: tx, y: ty };
  for (let r = 1; r <= maxR; r++) {
    let best = null, bestD = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = tx + dx, y = ty + dy;
        if (!tileWalkable(x, y)) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = { x, y }; }
      }
    }
    if (best) return best;
  }
  return null;
}

// Can the collision box slide straight from a to b without hitting anything?
export function losClear(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const steps = Math.ceil(Math.hypot(dx, dy) / 3);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (feetBlockedAt(ax + dx * t, ay + dy * t)) return false;
  }
  return true;
}

// --- binary heap keyed on f score --------------------------------------

class Heap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  push(node) {
    const a = this.items;
    a.push(node);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

const DIAG = Math.SQRT2;

// A* over tiles, 8-way. Diagonal steps require both orthogonal neighbours
// to be clear, since movement resolves each axis separately.
function astar(sx, sy, gx, gy, maxNodes = 6000) {
  const map = G.map;
  const W = map.w;
  const idx = (x, y) => y * W + x;
  const goalI = idx(gx, gy);
  const gScore = new Map();
  const came = new Map();
  const open = new Heap();
  const closed = new Set();
  const h = (x, y) => {
    const dx = Math.abs(x - gx), dy = Math.abs(y - gy);
    return (dx + dy) + (DIAG - 2) * Math.min(dx, dy);
  };
  gScore.set(idx(sx, sy), 0);
  open.push({ x: sx, y: sy, f: h(sx, sy) });
  let expanded = 0;

  while (open.size) {
    const cur = open.pop();
    const ci = idx(cur.x, cur.y);
    if (closed.has(ci)) continue;
    closed.add(ci);
    if (ci === goalI) break;
    if (++expanded > maxNodes) break;

    const cg = gScore.get(ci);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cur.x + dx, ny = cur.y + dy;
        if (!tileWalkable(nx, ny)) continue;
        if (dx && dy && (!tileWalkable(cur.x + dx, cur.y) || !tileWalkable(cur.x, cur.y + dy))) continue;
        const ni = idx(nx, ny);
        if (closed.has(ni)) continue;
        const ng = cg + (dx && dy ? DIAG : 1);
        if (ng < (gScore.get(ni) ?? Infinity)) {
          gScore.set(ni, ng);
          came.set(ni, ci);
          open.push({ x: nx, y: ny, f: ng + h(nx, ny) });
        }
      }
    }
  }

  if (!came.has(goalI) && idx(sx, sy) !== goalI) return null;
  const tiles = [];
  let i = goalI;
  while (i !== idx(sx, sy)) {
    tiles.push({ x: i % W, y: Math.floor(i / W) });
    i = came.get(i);
    if (i === undefined) return null;
  }
  return tiles.reverse();
}

// Greedy string-pulling: keep only the corners where the straight line
// would clip something, so open ground is crossed in one diagonal run.
function smooth(startX, startY, tiles) {
  const pts = [{ x: startX, y: startY }];
  for (const t of tiles) pts.push(tileCenter(t.x, t.y));
  const out = [];
  let anchor = 0;
  for (let i = 2; i < pts.length; i++) {
    if (!losClear(pts[anchor].x, pts[anchor].y, pts[i].x, pts[i].y)) {
      out.push(pts[i - 1]);
      anchor = i - 1;
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// Public entry: a route of feet-centre waypoints from (fx, fy) to the
// destination, or null when nothing is reachable.
export function routeTo(fx, fy, destX, destY) {
  if (!G.map) return null;
  if (losClear(fx, fy, destX, destY)) return [{ x: destX, y: destY }];

  const s = tileOf(fx, fy);
  const start = tileWalkable(s.x, s.y) ? s : nearestWalkable(s.x, s.y, 3);
  if (!start) return null;
  const d = tileOf(destX, destY);
  const dest = nearestWalkable(d.x, d.y, 6);
  if (!dest) return null;
  if (start.x === dest.x && start.y === dest.y) return [{ x: destX, y: destY }];

  const tiles = astar(start.x, start.y, dest.x, dest.y);
  if (!tiles) return null;
  const path = smooth(fx, fy, tiles);
  // If the true destination is reachable from the last corner, finish there
  // instead of stopping at the tile centre.
  const last = path[path.length - 1];
  if (losClear(last.x, last.y, destX, destY)) path.push({ x: destX, y: destY });
  return path;
}
