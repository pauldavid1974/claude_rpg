// Spritesheet loading and drawing, driven by assets/sprites/manifest.json.

let manifest = null;
const images = {};
const scratch = document.createElement('canvas');
scratch.width = 64; scratch.height = 64;
const scratchCtx = scratch.getContext('2d');

export async function loadAssets() {
  manifest = await (await fetch('assets/sprites/manifest.json')).json();
  await Promise.all(Object.entries(manifest.sheets).map(([name, s]) =>
    new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => { images[name] = img; res(); };
      img.onerror = rej;
      img.src = 'assets/sprites/' + s.file;
    })));
}

export function anim(name) {
  const a = manifest.anims[name];
  if (!a) throw new Error('unknown anim ' + name);
  return a;
}

export function frameOf(name, t) {
  const a = anim(name);
  return a.frames > 1 ? Math.floor(t * a.fps) % a.frames : 0;
}

export function drawAnim(ctx, name, fi, x, y, flip = false) {
  const a = anim(name);
  const img = images[a.sheet];
  const sx = fi * a.w, sy = a.row * a.h;
  x = Math.round(x); y = Math.round(y);
  if (!flip) {
    ctx.drawImage(img, sx, sy, a.w, a.h, x, y, a.w, a.h);
  } else {
    ctx.save();
    ctx.translate(x + a.w, y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, sx, sy, a.w, a.h, 0, 0, a.w, a.h);
    ctx.restore();
  }
}

// Draw a sprite silhouetted in a flat colour (hurt flash).
export function drawAnimFlash(ctx, name, fi, x, y, color, flip = false) {
  const a = anim(name);
  scratchCtx.clearRect(0, 0, a.w, a.h);
  scratchCtx.globalCompositeOperation = 'source-over';
  drawAnim(scratchCtx, name, fi, 0, 0, flip);
  scratchCtx.globalCompositeOperation = 'source-in';
  scratchCtx.fillStyle = color;
  scratchCtx.fillRect(0, 0, a.w, a.h);
  ctx.drawImage(scratch, 0, 0, a.w, a.h, Math.round(x), Math.round(y), a.w, a.h);
}

export function sheetImage(name) {
  return images[name];
}

