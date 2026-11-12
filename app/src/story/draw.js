/*
 * Drawing helpers shared by the story templates. Every helper takes the 2D context as an argument
 * and leaves the context state as it found it. Sizes are canvas pixels on the 1080 x 1920 story.
 * Colours come from colors.js or from the user's chosen colour; none are defined here.
 */
import { coverRect } from './photo.js';
import { routePath } from './model.js';

/* The story canvas and its safe area (Instagram draws its own interface above 250 and below 1580).
   render.js re-exports these; templates import them from here to avoid a circular import. */
export const W = 1080;
export const H = 1920;
export const SAFE_TOP = 250;
export const SAFE_BOTTOM = 1580;

/* As loaded by app/index.html: Barlow Condensed 600, 700, 800 and IBM Plex Mono 500. */
export const FONT = {
  display: '"Barlow Condensed", "Arial Narrow", Arial, sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, Consolas, monospace'
};

export function font(weight, px, family) {
  return weight + ' ' + px + 'px ' + family;
}

/* Letter spacing in em, where the browser supports it (measureText then includes it). */
export function setTracking(ctx, em, px) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = (em * px).toFixed(2) + 'px';
}

export function textWidth(ctx, text, px, family, weight) {
  const prev = ctx.font;
  ctx.font = font(weight, px, family);
  const w = ctx.measureText(text).width;
  ctx.font = prev;
  return w;
}

/* The largest whole pixel size up to basePx whose measured width fits maxWidth. */
export function fitFont(ctx, text, maxWidth, basePx, family, weight) {
  const base = Math.max(1, Math.floor(basePx));
  const w = textWidth(ctx, text, base, family, weight);
  if (w <= maxWidth) return base;
  let px = Math.max(1, Math.floor(base * maxWidth / w));
  while (px > 1 && textWidth(ctx, text, px, family, weight) > maxWidth) px--;
  return px;
}

/* One line of text, left aligned unless align says otherwise. */
export function text(ctx, str, x, y, px, family, weight, color, alpha, align) {
  ctx.save();
  ctx.font = font(weight, px, family);
  ctx.fillStyle = color;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'alphabetic';
  if (alpha !== undefined && alpha !== 1) ctx.globalAlpha = ctx.globalAlpha * alpha;
  ctx.fillText(str, x, y);
  ctx.restore();
}

export function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r || 0, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

/* The photo covering the box (x, y, w, h), positioned by view. Drawn only from photo.bitmap. */
export function drawPhoto(ctx, photo, view, x, y, w, h) {
  if (!photo || !photo.bitmap) return;
  const r = coverRect(photo.w, photo.h, w, h, view);
  ctx.drawImage(photo.bitmap, r.sx, r.sy, r.sw, r.sh, x, y, w, h);
}

/* A colour layer (a colour string or a gradient) at alpha 0..1. Nothing is drawn at alpha 0. */
export function colorLayer(ctx, fill, alpha, x, y, w, h, radius) {
  if (!(alpha > 0)) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.fillStyle = fill;
  if (radius > 0) {
    roundRectPath(ctx, x, y, w, h, radius);
    ctx.fill();
  } else {
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

/* The results sheet row of the mockup (.st-row): a rule, then one cell per number with the value
   (Barlow Condensed 700, 9.5cqw for up to 3 numbers, 1.7cqw less per extra) over its label
   (IBM Plex Mono 2.5cqw at 80 percent). */
const ROW = { rule: 6, pad: 32, gap: 22, labelPx: 27, labelGap: 12, labelCap: 21, tail: 6 };

function rowValuePx(n) {
  return Math.round(102.6 - Math.max(0, n - 3) * 18.36);
}

export function numberRowHeight(n) {
  if (!n) return 0;
  const fs = rowValuePx(n);
  return ROW.rule + ROW.pad + fs + ROW.labelGap + ROW.labelCap + ROW.tail;
}

/* items: [{ value, label }]; y is the top of the rule. Returns the row height. */
export function numberRow(ctx, items, x, y, w, color) {
  const n = items.length;
  if (!n) return 0;
  const fs = rowValuePx(n);
  ctx.save();
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, ROW.rule);
  ctx.restore();
  const cellW = (w - ROW.gap * (n - 1)) / n;
  const valueY = y + ROW.rule + ROW.pad + Math.round(fs * 0.8);
  const labelY = y + ROW.rule + ROW.pad + fs + ROW.labelGap + ROW.labelCap;
  /* one value size for the whole row: the smallest size at which every value fits its cell */
  const vpx = items.reduce(function (px, it) { return Math.min(px, fitFont(ctx, it.value, cellW, fs, FONT.display, 700)); }, fs);
  items.forEach(function (it, i) {
    const cx = x + i * (cellW + ROW.gap);
    text(ctx, it.value, cx, valueY, vpx, FONT.display, 700, color);
    ctx.save();
    setTracking(ctx, 0.06, ROW.labelPx);
    const lpx = fitFont(ctx, it.label, cellW, ROW.labelPx, FONT.mono, 500);
    text(ctx, it.label, cx, labelY, lpx, FONT.mono, 500, color, 0.8);
    ctx.restore();
  });
  return numberRowHeight(n);
}

/* The main number with its unit at 0.3 of its size (.st-big .u). */
export function heroFit(ctx, value, unit, maxWidth, basePx) {
  const measure = function (px) {
    const wn = textWidth(ctx, value, px, FONT.display, 800);
    if (!unit) return wn;
    const upx = Math.max(1, Math.round(px * 0.3));
    return wn + upx * 0.12 + textWidth(ctx, unit, upx, FONT.display, 800);
  };
  let px = Math.max(1, Math.floor(basePx));
  const w = measure(px);
  if (w <= maxWidth) return px;
  px = Math.max(1, Math.floor(px * maxWidth / w));
  while (px > 1 && measure(px) > maxWidth) px--;
  return px;
}

export function heroLine(ctx, value, unit, x, y, px, color) {
  text(ctx, value, x, y, px, FONT.display, 800, color);
  if (!unit) return;
  const upx = Math.max(1, Math.round(px * 0.3));
  const ux = x + textWidth(ctx, value, px, FONT.display, 800) + upx * 0.12;
  text(ctx, unit, ux, y, upx, FONT.display, 800, color);
}

/* The route outline fitted into the box, one sub path per segment (track.brk starts a new one). */
export function routeLine(ctx, track, x, y, w, h, color, lineWidth) {
  if (!track || !track.lat || !track.lon) return;
  const p = routePath(track, w, h);
  if (p.pts.length < 2) return;
  const brk = {};
  (track.brk || []).forEach(function (b) { brk[b] = true; });
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  p.pts.forEach(function (pt, i) {
    if (i === 0 || brk[i]) ctx.moveTo(x + pt[0], y + pt[1]);
    else ctx.lineTo(x + pt[0], y + pt[1]);
  });
  ctx.stroke();
  ctx.restore();
}

/* The colour mixed with black: f of the colour, 1 - f of black (CSS color-mix(color f, #000)). */
export function shade(hex, f) {
  const v = hex.replace('#', '');
  const out = [0, 2, 4].map(function (i) {
    const c = Math.round(parseInt(v.slice(i, i + 2), 16) * f);
    return (c < 16 ? '0' : '') + c.toString(16);
  });
  return ('#' + out.join('')).toUpperCase();
}

/* The main number and small numbers chosen in state.numbers, as display items. */
export function heroItem(state) {
  const vals = state.model.values;
  const key = state.numbers && vals[state.numbers.hero] ? state.numbers.hero : 'dist';
  const v = vals[key];
  return { key: key, value: v.value, unit: key === 'time' ? '' : v.unit };
}

export function smallItems(state) {
  const vals = state.model.values;
  const keys = (state.numbers && state.numbers.small) || [];
  return keys.map(function (k) { return vals[k]; }).filter(Boolean);
}

/* Main number scale per kind, as in the mockup (--st-hs). */
export const HERO_SCALE = { dist: 1, time: 0.74, pace: 0.88 };

/* The wordmark (.st-brand: IBM Plex Mono 500, 3.2cqw, tracking 0.2em). One text call. */
export const BRAND = 'WEEKLY 150';
export const BRAND_PX = 35;
export function brand(ctx, x, y, color, alpha) {
  ctx.save();
  setTracking(ctx, 0.2, BRAND_PX);
  text(ctx, BRAND, x, y, BRAND_PX, FONT.mono, 500, color, alpha);
  ctx.restore();
}

/* The activity label and date (.st-kicker: IBM Plex Mono 500, 3cqw, tracking 0.12em), fitted to maxWidth. */
export const KICKER_PX = 32;
export function kicker(ctx, str, x, y, maxWidth, color, alpha) {
  ctx.save();
  setTracking(ctx, 0.12, KICKER_PX);
  const px = fitFont(ctx, str, maxWidth, KICKER_PX, FONT.mono, 500);
  text(ctx, str, x, y, px, FONT.mono, 500, color, alpha);
  ctx.restore();
}

/* A soft text shadow (CSS text-shadow 0 1px 6..8px at 40 to 60 percent black). */
export function softShadow(ctx, color, blur, offsetY) {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = offsetY;
}
