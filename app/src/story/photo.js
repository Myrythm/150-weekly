/*
 * The story photo: decoded in the browser only (never uploaded, stored or saved), EXIF orientation
 * applied, scaled down so its longer side is at most 2160 px, and released when no longer needed.
 */
export const MAX_SIDE = 2160;

function fail(code) { return new Error(code); }

export async function loadPhoto(file) {
  if (!file || typeof file.type !== 'string' || file.type.indexOf('image/') !== 0) throw fail('not-image');
  let full;
  try {
    full = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (e) {
    throw fail('decode-failed');
  }
  if (!full || !(full.width > 0) || !(full.height > 0)) {
    close(full);
    throw fail('decode-failed');
  }
  const long = Math.max(full.width, full.height);
  if (long <= MAX_SIDE) return { bitmap: full, w: full.width, h: full.height };
  const s = MAX_SIDE / long;
  const w = Math.max(1, Math.round(full.width * s));
  const h = Math.max(1, Math.round(full.height * s));
  let small = null;
  try {
    small = await createImageBitmap(full, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' });
  } catch (e) {
    small = null;
  }
  /* An engine may ignore or partly honour the resize options: then draw it down on a canvas. */
  if (!fits(small)) {
    close(small);
    try {
      small = await viaCanvas(full, w, h);
    } catch (e) {
      small = null;
    }
  }
  close(full);
  if (!fits(small)) {
    close(small);
    throw fail('decode-failed');
  }
  return { bitmap: small, w: small.width, h: small.height };
}

function close(bitmap) {
  if (bitmap && typeof bitmap.close === 'function') bitmap.close();
}

function fits(bitmap) {
  return !!bitmap && bitmap.width > 0 && bitmap.height > 0 && Math.max(bitmap.width, bitmap.height) <= MAX_SIDE;
}

async function viaCanvas(src, w, h) {
  let canvas;
  if (typeof OffscreenCanvas === 'function') {
    canvas = new OffscreenCanvas(w, h);
  } else if (typeof document !== 'undefined') {
    canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
  } else {
    throw fail('decode-failed');
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) throw fail('decode-failed');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return createImageBitmap(canvas);
}

function clamp(v, lo, hi) {
  v = Number(v);
  if (!isFinite(v)) v = lo > 0 ? lo : 0;
  return Math.min(hi, Math.max(lo, v));
}

/* The source rectangle of a pw x ph photo that covers a boxW x boxH box (aspect kept),
   zoomed by view.zoom (1..3) and moved by view.x, view.y (-1 left/top .. 1 right/bottom). */
export function coverRect(pw, ph, boxW, boxH, view) {
  const v = view || {};
  const zoom = clamp(v.zoom === undefined ? 1 : v.zoom, 1, 3);
  const x = clamp(v.x || 0, -1, 1);
  const y = clamp(v.y || 0, -1, 1);
  const boxAspect = boxW / boxH;
  let sw, sh;
  if (pw / ph > boxAspect) { sh = ph; sw = ph * boxAspect; } else { sw = pw; sh = pw / boxAspect; }
  sw /= zoom; sh /= zoom;
  const sx = (pw - sw) * (x + 1) / 2;
  const sy = (ph - sh) * (y + 1) / 2;
  return { sx: sx, sy: sy, sw: sw, sh: sh };
}

export function releasePhoto(photo) {
  if (photo && photo.bitmap && typeof photo.bitmap.close === 'function') photo.bitmap.close();
}
