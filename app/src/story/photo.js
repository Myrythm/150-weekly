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
    if (full && full.close) full.close();
    throw fail('decode-failed');
  }
  const long = Math.max(full.width, full.height);
  if (long <= MAX_SIDE) return { bitmap: full, w: full.width, h: full.height };
  const s = MAX_SIDE / long;
  const w = Math.max(1, Math.round(full.width * s));
  const h = Math.max(1, Math.round(full.height * s));
  let small;
  try {
    small = await createImageBitmap(full, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' });
  } catch (e) {
    throw fail('decode-failed');
  } finally {
    if (full.close) full.close();
  }
  return { bitmap: small, w: w, h: h };
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
