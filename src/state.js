// Shared game state and constants.  No imports: every module can import this.

export const TILE = 16;
export const VW = 320;   // internal resolution
export const VH = 180;

export const G = {
  mode: 'title',        // title | play | dialogue | inventory | quests | shop | pause | gameover
  time: 0,
  canvas: null, ctx: null,      // scaled display canvas
  screen: null, sctx: null,     // internal 320x180 canvas
  cam: { x: 0, y: 0 },
  shake: 0,
  hitstop: 0,
  map: null,
  mapName: '',
  player: null,
  monsters: [],
  npcs: [],
  projectiles: [],
  pickups: [],       // coins, hearts, ground items
  particles: [],
  floats: [],        // floating damage numbers / texts
  quests: {},        // id -> {state:'active'|'done', n:progress}
  flags: {},         // bossDead, chests opened, etc.
  transition: null,  // {t, phase, cb}
  banner: null,      // {text, t}  (level up / quest complete strip)
  ui: {},            // per-menu scratch state
  muted: false,
  saveTimer: 0,
};

export function resetRun() {
  G.monsters = [];
  G.npcs = [];
  G.projectiles = [];
  G.pickups = [];
  G.particles = [];
  G.floats = [];
}
