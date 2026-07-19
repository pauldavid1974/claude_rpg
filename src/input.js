// Keyboard + touch input, mapped to logical buttons.

const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Space: 'attack', KeyJ: 'attack',
  KeyE: 'interact', Enter: 'interact',
  KeyI: 'inv', Tab: 'inv',
  KeyQ: 'quest',
  Escape: 'pause',
  KeyM: 'mute',
};

export const input = {
  held: {},
  pressed: {},   // true for one frame after keydown
  mouse: { x: 0, y: 0, clicked: false },
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
  addEventListener('blur', () => { input.held = {}; });

  const canvas = document.getElementById('game');
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    input.mouse.x = (e.clientX - r.left) / r.width * 320;
    input.mouse.y = (e.clientY - r.top) / r.height * 180;
  });
  canvas.addEventListener('mousedown', () => { gesture(); input.mouse.clicked = true; });

  // Touch controls: only revealed on touch devices.
  if ('ontouchstart' in window) {
    document.body.classList.add('touch');
    for (const el of document.querySelectorAll('[data-b]')) {
      const b = el.dataset.b;
      const on = (e) => { e.preventDefault(); gesture(); input.pressed[b] = true; input.held[b] = true; };
      const off = (e) => { e.preventDefault(); input.held[b] = false; };
      el.addEventListener('touchstart', on);
      el.addEventListener('touchend', off);
      el.addEventListener('touchcancel', off);
    }
  }
}

function gesture() {
  if (firstGesture) { firstGesture(); firstGesture = null; }
}

export function endFrame() {
  input.pressed = {};
  input.mouse.clicked = false;
  input.anyKey = false;
}
