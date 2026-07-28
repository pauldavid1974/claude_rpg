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
  anyKey: false, // true for one frame on any keydown (title screen)
};

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
      e.preventDefault();
    }
  });
  addEventListener('keyup', (e) => {
    const b = KEYMAP[e.code];
    if (b) input.held[b] = false;
  });
  addEventListener('blur', () => { input.held = {}; input.mouse.held = input.mouse.rheld = false; });

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
