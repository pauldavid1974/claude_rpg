// Keyboard + touch input, mapped to logical buttons.

import { VW, VH } from './state.js';

const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Space: 'attack', KeyJ: 'attack',
  ShiftLeft: 'dodge', ShiftRight: 'dodge', KeyK: 'dodge',
  KeyE: 'interact', Enter: 'interact',
  Digit1: 'q1', Digit2: 'q2', Digit3: 'q3',
  KeyI: 'inv', Tab: 'inv',
  KeyQ: 'quest',
  KeyU: 'skills',
  Escape: 'pause',
  KeyM: 'mute',
};

export const input = {
  held: {},
  pressed: {},   // true for one frame after keydown
  mouse: { x: 0, y: 0, clicked: false, rclicked: false, held: false, rheld: false },
  axis: { x: 0, y: 0 },   // analog stick, when a pad is connected
  pad: false,
  anyKey: false, // true for one frame on any keydown (title screen)
};

// --- gamepad ------------------------------------------------------------
// Standard layout.  Buttons feed the same logical names the keyboard uses,
// so nothing downstream needs to know a pad is attached.

const PAD_BUTTONS = {
  0: 'attack', 1: 'dodge', 2: 'interact', 3: 'inv',
  4: 'q1', 5: 'q2', 6: 'q3', 7: 'q3',
  8: 'skills', 9: 'pause',
  12: 'up', 13: 'down', 14: 'left', 15: 'right',
};
const DEAD = 0.28;
const padWas = {};

export function pollGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let pad = null;
  for (const p of pads) if (p && p.connected) { pad = p; break; }
  input.pad = !!pad;
  if (!pad) { input.axis.x = input.axis.y = 0; return; }

  const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
  const mag = Math.hypot(ax, ay);
  input.axis.x = mag > DEAD ? ax : 0;
  input.axis.y = mag > DEAD ? ay : 0;

  // the stick also drives menu navigation, one step per push
  const dir = { left: input.axis.x < -0.6, right: input.axis.x > 0.6,
                up: input.axis.y < -0.6, down: input.axis.y > 0.6 };

  for (const i in PAD_BUTTONS) {
    const name = PAD_BUTTONS[i];
    const b = pad.buttons[i];
    const down = !!(b && (b.pressed || b.value > 0.5));
    if (down && !padWas[i]) { input.pressed[name] = true; input.anyKey = true; }
    if (down) input.held[name] = true;
    else if (padWas[i] && !keyHeld[name]) input.held[name] = false;
    padWas[i] = down;
  }
  for (const name of ['left', 'right', 'up', 'down']) {
    const key = 'axis_' + name;
    if (dir[name] && !padWas[key]) input.pressed[name] = true;
    padWas[key] = dir[name];
  }
}

// Track which logical buttons the keyboard is holding, so releasing a pad
// button never cancels a key the player is still pressing.
const keyHeld = {};

let firstGesture = null;

export function initInput(onFirstGesture) {
  firstGesture = onFirstGesture;

  addEventListener('keydown', (e) => {
    gesture();
    const b = KEYMAP[e.code];
    input.anyKey = true;
    if (b) {
      if (!input.held[b]) input.pressed[b] = true;
      input.held[b] = true;
      keyHeld[b] = true;
      e.preventDefault();
    }
  });
  addEventListener('keyup', (e) => {
    const b = KEYMAP[e.code];
    if (b) { input.held[b] = false; keyHeld[b] = false; }
  });
  addEventListener('blur', () => {
    input.held = {};
    for (const k in keyHeld) keyHeld[k] = false;
    input.mouse.held = input.mouse.rheld = false;
  });

  const canvas = document.getElementById('game');
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    input.mouse.x = (e.clientX - r.left) / r.width * VW;
    input.mouse.y = (e.clientY - r.top) / r.height * VH;
  });
  canvas.addEventListener('mousedown', (e) => {
    gesture();
    if (e.button === 0) { input.mouse.clicked = true; input.mouse.held = true; }
    if (e.button === 2) { input.mouse.rclicked = true; input.mouse.rheld = true; }
  });
  addEventListener('mouseup', (e) => {
    if (e.button === 0) input.mouse.held = false;
    if (e.button === 2) input.mouse.rheld = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // Touch: a tap is a click, a drag steers. No on-screen buttons - the
  // canvas HUD buttons and tap-to-move cover everything.
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    document.body.classList.add('touch');
    const at = (t) => {
      const r = canvas.getBoundingClientRect();
      input.mouse.x = (t.clientX - r.left) / r.width * VW;
      input.mouse.y = (t.clientY - r.top) / r.height * VH;
    };
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      gesture();
      at(e.changedTouches[0]);
      input.mouse.clicked = true;
      input.mouse.held = true;
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      at(e.changedTouches[0]);
    }, { passive: false });
    const end = (e) => { e.preventDefault(); input.mouse.held = false; };
    canvas.addEventListener('touchend', end, { passive: false });
    canvas.addEventListener('touchcancel', end, { passive: false });
  }
}

function gesture() {
  if (firstGesture) { firstGesture(); firstGesture = null; }
}

export function endFrame() {
  input.pressed = {};
  input.mouse.clicked = false;
  input.mouse.rclicked = false;
  input.anyKey = false;
}
