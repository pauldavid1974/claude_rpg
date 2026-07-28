// Shared game state and constants.  No imports: every module can import this.

export const TILE = 16;

// Internal resolution. At least 320x180; resize() extends it so the view
// fills the whole window at an integer zoom (no letterboxing).
export let VW = 320;
export let VH = 180;
export function setView(w, h) { VW = w; VH = h; }

export const G = {
  mode: 'title',        // title | play | dialogue | inventory | quests | shop | pause | gameover
  time: 0,
  canvas: null, ctx: null,      // display canvas, drawn at integer zoom
  zoom: 1,                      // device pixels per game pixel
  cam: { x: 0, y: 0 },
  shake: 0,
  hitstop: 0,
  slowmo: 0,
  slot: 0,
  ngPlus: 0,
  stats: { kills: 0, gold: 0, deaths: 0, elites: 0, playtime: 0 },
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
  musicOn: true,
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
